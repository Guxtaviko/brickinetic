import { Matrix4, type Object3D, Vector3 } from 'three'
import type { PreparedModel, UnitSnapshot } from './construction-units.js'
import {
	type BrickEffectEasing,
	evaluateEasing,
	validateEasing,
} from './easing.js'
import { type EffectPlaybackConfig, validatePlayback } from './playback.js'

export type EffectProgress =
	| { progress: number; controller?: never; playback?: never }
	| { progress?: never; controller: BrickEffectController; playback?: never }
	| { progress?: never; controller?: never; playback: EffectPlaybackConfig }

export interface BrickEffectController {
	setProgress(value: number): void
	getProgress(): number
}

const controllerBindings = new WeakMap<
	BrickEffectController,
	(listener: (value: number) => void) => () => void
>()

function normalizeProgress(value: number, field = 'progress') {
	if (!Number.isFinite(value)) throw new Error(`${field} must be finite`)
	return Math.max(0, Math.min(1, value))
}

export function createBrickEffectController(
	initialProgress = 0,
): BrickEffectController {
	let progress = normalizeProgress(initialProgress, 'initialProgress')
	let listener: ((value: number) => void) | undefined
	const controller: BrickEffectController = {
		setProgress(value) {
			progress = normalizeProgress(value)
			listener?.(progress)
		},
		getProgress: () => progress,
	}
	controllerBindings.set(controller, (next) => {
		if (listener) throw new Error('BrickEffectController is already bound')
		listener = next
		try {
			next(progress)
		} catch (error) {
			if (listener === next) listener = undefined
			throw error
		}
		return () => {
			if (listener === next) listener = undefined
		}
	})
	return controller
}

interface EffectVariation {
	randomness?: number
	seed?: number
}

type ExplosionDistance =
	| { distance?: number; distanceMultiplier?: never }
	| { distance?: never; distanceMultiplier: number }

export type ExplosionConfig = EffectProgress &
	EffectVariation &
	ExplosionDistance & {
		type: 'explosion'
		rotation?: number
		easing?: BrickEffectEasing
		origin?: readonly [number, number, number]
	}

export type AssemblyConfig = EffectProgress &
	EffectVariation & {
		type: 'assembly'
		axis?: 'x' | 'y' | 'z'
		direction?: 'ascending' | 'descending'
		entrance?: 'instant' | 'translate'
		offset?: readonly [number, number, number]
		easing?: BrickEffectEasing
	}

export type BrickEffectConfig = ExplosionConfig | AssemblyConfig

export function validateEffectConfig(config?: BrickEffectConfig) {
	if (!config) return 0
	if (config.type !== 'assembly' && config.type !== 'explosion')
		throw new Error('effect.type must be assembly or explosion')
	if (
		[config.progress, config.controller, config.playback].filter(
			(value) => value !== undefined,
		).length !== 1
	)
		throw new Error(
			'Configure exactly one of progress or controller or playback',
		)
	validateEasing(config.easing ?? 'linear')
	if (config.playback) {
		validatePlayback(config.playback)
		return config.playback.direction === 'reverse' ? 1 : 0
	}
	return (
		config.controller?.getProgress() ??
		normalizeProgress(config.progress as number)
	)
}

export function bindBrickEffect(
	config: ExplosionConfig | AssemblyConfig,
	apply: (progress: number) => void,
) {
	if (config.controller) {
		const bind = controllerBindings.get(config.controller)
		if (!bind)
			throw new Error(
				'controller must be created by createBrickEffectController',
			)
		return bind(apply)
	}
	apply(normalizeProgress(config.progress as number))
	return () => {}
}

export type BoundUnit = { unit: UnitSnapshot; roots: Object3D[] }
const originalVisibility = new WeakMap<Object3D, boolean>()

export function captureBrickEffectVisibility(model: Object3D) {
	model.traverse((node) => {
		if (!originalVisibility.has(node))
			originalVisibility.set(node, node.visible)
	})
}

function rememberVisibility(bindings: readonly BoundUnit[]) {
	for (const binding of bindings)
		for (const root of binding.roots)
			root.traverse((node) => {
				if (!originalVisibility.has(node))
					originalVisibility.set(node, node.visible)
			})
}

export function restoreBrickEffects(bindings: readonly BoundUnit[]) {
	for (const binding of bindings) setBaseline(binding)
	for (const binding of bindings)
		for (const root of binding.roots)
			root.traverse((node) => {
				const visible = originalVisibility.get(node)
				if (visible !== undefined) node.visible = visible
			})
}

function setBaseline(binding: BoundUnit) {
	binding.roots.forEach((node, index) => {
		const matrix = new Matrix4().fromArray(
			binding.unit.bindings[index].localMatrix,
		)
		matrix.decompose(node.position, node.quaternion, node.scale)
		node.matrixAutoUpdate = binding.unit.bindings[index].matrixAutoUpdate
		node.matrix.copy(matrix)
		node.matrixWorldNeedsUpdate = true
	})
}

function move(binding: BoundUnit, offset: Vector3) {
	setBaseline(binding)
	binding.roots.forEach((node, index) => {
		const snapshot = binding.unit.bindings[index]
		const parent = new Matrix4().fromArray(snapshot.parentMatrix)
		const inverse = new Matrix4()
			.makeRotationX(Math.PI)
			.multiply(parent)
			.invert()
		const zero = new Vector3().applyMatrix4(inverse)
		const delta = offset.clone().applyMatrix4(inverse).sub(zero)
		const matrix = new Matrix4().fromArray(snapshot.localMatrix)
		matrix.setPosition(new Vector3().setFromMatrixPosition(matrix).add(delta))
		matrix.decompose(node.position, node.quaternion, node.scale)
		node.matrix.copy(matrix)
		node.matrixWorldNeedsUpdate = true
	})
}

function midpoint(binding: BoundUnit, source: string) {
	const { bounds, path } = binding.unit
	if (
		!bounds ||
		[...bounds.min, ...bounds.max].some((value) => !Number.isFinite(value))
	)
		throw new Error(
			`Cannot apply construction effect to "${source}" at ${path.join('/') || '<root>'}: unit bounds are unavailable or nonfinite`,
		)
	return new Vector3(...bounds.min)
		.add(new Vector3(...bounds.max))
		.multiplyScalar(0.5)
}

const orderCache = new WeakMap<readonly BoundUnit[], Map<string, BoundUnit[]>>()

export function applyBrickEffect(
	bindings: readonly BoundUnit[],
	prepared: PreparedModel,
	progressValue: number,
	config: ExplosionConfig | AssemblyConfig,
	reducedMotion = false,
	kind: 'explosion' | 'assembly' = config.type,
	edges = true,
) {
	rememberVisibility(bindings)
	const progress = normalizeProgress(progressValue)
	const amount = config.randomness ?? 0
	const seed = config.seed ?? 0
	if (!Number.isFinite(amount) || amount < 0 || amount > 1)
		throw new Error('randomness must be finite and in [0, 1]')
	if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
		throw new Error('seed must be a uint32 integer')
	for (const binding of bindings) midpoint(binding, prepared.source)
	if (kind === 'explosion') {
		const explosion = config as ExplosionConfig
		const rotation = explosion.rotation ?? 0
		if (!Number.isFinite(rotation) || rotation < 0)
			throw new Error('rotation must be finite and nonnegative')
		if (
			explosion.distance !== undefined &&
			explosion.distanceMultiplier !== undefined
		)
			throw new Error(
				'Configure either distance or distanceMultiplier, not both',
			)
		const multiplier = explosion.distanceMultiplier
		if (
			multiplier !== undefined &&
			(!Number.isFinite(multiplier) || multiplier < 0)
		)
			throw new Error('distanceMultiplier must be finite and nonnegative')
		const bounds = prepared.bounds
		const size = bounds
			? Math.max(...bounds.max.map((value, i) => value - bounds.min[i]))
			: 0
		const distance = explosion.distance ?? (multiplier ?? 1) * size * 0.5
		if (!Number.isFinite(distance) || distance < 0)
			throw new Error('distance must be finite and nonnegative')
		const origin = explosion.origin ?? prepared.center ?? [0, 0, 0]
		origin.forEach((v, i) => {
			if (!Number.isFinite(v)) throw new Error(`origin[${i}] must be finite`)
		})
		const center = new Vector3(...origin)
		const eased = evaluateEasing(explosion.easing, progress)
		for (const binding of bindings) {
			const unitCenter = midpoint(binding, prepared.source)
			const direction = unitCenter.clone().sub(center)
			if (
				direction.length() <=
					Number.EPSILON *
						4 *
						Math.max(1, unitCenter.length(), center.length()) ||
				eased === 0
			) {
				setBaseline(binding)
				continue
			}
			direction.normalize()
			const random = variation(binding, seed)
			const offset = direction
				.clone()
				.multiplyScalar(distance * eased * (1 + amount * (random.travel - 0.5)))
			const angle = rotation * eased * (1 + amount * (random.rotation - 0.5))
			if (angle === 0) {
				move(binding, offset)
				continue
			}
			const axis = direction.clone().cross(new Vector3(0, 1, 0))
			if (axis.lengthSq() < 1e-12)
				axis.copy(direction).cross(new Vector3(1, 0, 0))
			rotateAndMove(binding, unitCenter, axis.normalize(), angle, offset)
		}
		return
	}
	const assembly = config as AssemblyConfig
	const axis: 'x' | 'y' | 'z' = assembly.axis ?? 'y'
	if (axis !== 'x' && axis !== 'y' && axis !== 'z')
		throw new Error('axis must be "x", "y", or "z"')
	if (
		assembly.direction !== undefined &&
		assembly.direction !== 'ascending' &&
		assembly.direction !== 'descending'
	)
		throw new Error('direction must be "ascending" or "descending"')
	if (
		assembly.entrance !== undefined &&
		assembly.entrance !== 'instant' &&
		assembly.entrance !== 'translate'
	)
		throw new Error('entrance must be "instant" or "translate"')
	validateEasing(assembly.easing ?? 'linear')
	const coordinate = { x: 0, y: 1, z: 2 }[axis]
	let orders = orderCache.get(bindings)
	if (!orders) {
		orders = new Map()
		orderCache.set(bindings, orders)
	}
	const orderKey = `${axis}:${assembly.direction ?? 'ascending'}`
	let ordered = orders.get(orderKey)
	if (!ordered) {
		ordered = [...bindings].sort((a, b) => {
			const difference =
				midpoint(a, prepared.source).toArray()[coordinate] -
				midpoint(b, prepared.source).toArray()[coordinate]
			const directed =
				(assembly.direction ?? 'ascending') === 'ascending'
					? difference
					: -difference
			return directed || comparePath(a.unit.path, b.unit.path)
		})
		orders.set(orderKey, ordered)
	}
	const offset: readonly [number, number, number] = assembly.offset ?? [0, 0, 0]
	offset.forEach((v, i) => {
		if (!Number.isFinite(v)) throw new Error(`offset[${i}] must be finite`)
	})
	const stages = assemblyStages(ordered, amount, seed)
	ordered.forEach((binding, index) => {
		const stage = stages[index]
		const local = Math.max(
			0,
			Math.min(
				1,
				amount === 0
					? ordered.length * progress - index
					: (progress - stage.start) / stage.length,
			),
		)
		for (const path of binding.unit.renderables) {
			const node = resolve(binding.roots, binding.unit, path.path)
			if (node) {
				const edge = 'isLineSegments' in node && node.isLineSegments
				const conditional =
					'isConditionalLine' in node && node.isConditionalLine
				node.visible =
					(originalVisibility.get(node) ?? true) &&
					local > 0 &&
					(edges || !(edge || conditional))
			}
		}
		const eased =
			reducedMotion || assembly.entrance !== 'translate'
				? 1
				: evaluateEasing(assembly.easing, local)
		move(binding, new Vector3(...offset).multiplyScalar(1 - eased))
	})
}

function comparePath(a: readonly number[], b: readonly number[]) {
	for (let i = 0; i < Math.min(a.length, b.length); i++)
		if (a[i] !== b[i]) return a[i] - b[i]
	return a.length - b.length
}

function resolve(
	roots: Object3D[],
	unit: UnitSnapshot,
	path: readonly number[],
) {
	const rootIndex = unit.roots.findIndex((root) =>
		root.every((part, i) => path[i] === part),
	)
	let node: Object3D | undefined = roots[rootIndex]
	for (const index of path.slice(unit.roots[rootIndex]?.length ?? path.length))
		node = node?.children[index]
	return node
}

const variationCache = new WeakMap<
	BoundUnit,
	{ seed: number; travel: number; rotation: number; weight: number }
>()
function variation(binding: BoundUnit, seed: number) {
	const previous = variationCache.get(binding)
	if (previous?.seed === seed) return previous
	let hash = seed >>> 0
	for (const part of binding.unit.path)
		hash = Math.imul(hash ^ (part + 1), 16777619) >>> 0
	const next = () => {
		hash = (hash + 0x6d2b79f5) >>> 0
		let value = Math.imul(hash ^ (hash >>> 15), hash | 1)
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296
	}
	const result = { seed, travel: next(), rotation: next(), weight: next() }
	variationCache.set(binding, result)
	return result
}
const stageCache = new WeakMap<
	readonly BoundUnit[],
	{ amount: number; seed: number; stages: { start: number; length: number }[] }
>()
function assemblyStages(
	ordered: readonly BoundUnit[],
	amount: number,
	seed: number,
) {
	const previous = stageCache.get(ordered)
	if (previous?.amount === amount && previous.seed === seed)
		return previous.stages
	const weights = ordered.map(
		(binding) => 1 + amount * (variation(binding, seed).weight - 0.5),
	)
	const total = weights.reduce((sum, value) => sum + value, 0)
	let start = 0
	const stages = weights.map((weight, index) => {
		const length = weight / total
		const stage = {
			start,
			length: index === weights.length - 1 ? 1 - start : length,
		}
		start += length
		return stage
	})
	stageCache.set(ordered, { amount, seed, stages })
	return stages
}
function rotateAndMove(
	binding: BoundUnit,
	center: Vector3,
	axis: Vector3,
	angle: number,
	offset: Vector3,
) {
	const transform = new Matrix4()
		.makeTranslation(
			center.x + offset.x,
			center.y + offset.y,
			center.z + offset.z,
		)
		.multiply(new Matrix4().makeRotationAxis(axis, angle))
		.multiply(new Matrix4().makeTranslation(-center.x, -center.y, -center.z))
	binding.roots.forEach((node, index) => {
		const snapshot = binding.unit.bindings[index]
		const parent = new Matrix4()
			.makeRotationX(Math.PI)
			.multiply(new Matrix4().fromArray(snapshot.parentMatrix))
		const matrix = parent
			.clone()
			.invert()
			.multiply(transform)
			.multiply(parent)
			.multiply(new Matrix4().fromArray(snapshot.localMatrix))
		matrix.decompose(node.position, node.quaternion, node.scale)
		// Conjugating a rotation through a nonuniform/mirrored parent can produce shear.
		// Keep the exact matrix until baseline restoration rather than recomposing TRS.
		node.matrixAutoUpdate = false
		node.matrix.copy(matrix)
		node.matrixWorldNeedsUpdate = true
	})
}
