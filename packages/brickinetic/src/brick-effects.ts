import { Matrix4, type Object3D, Vector3 } from 'three'
import type { PreparedModel, UnitSnapshot } from './construction-units.js'

export type EffectProgress =
	| { progress: number; controller?: never }
	| { progress?: never; controller: BrickEffectController }

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

export type ExplosionConfig = EffectProgress & {
	distance?: number
	origin?: readonly [number, number, number]
}

export type AssemblyConfig = EffectProgress & {
	axis?: 'x' | 'y' | 'z'
	direction?: 'ascending' | 'descending'
	entrance?: 'instant' | 'translate'
	offset?: readonly [number, number, number]
	easing?: 'linear' | 'smoothstep'
}

export function validateEffectConfig(
	explosion?: ExplosionConfig,
	assembly?: AssemblyConfig,
) {
	if (explosion && assembly)
		throw new Error('Configure either explosion or assembly, not both')
	const config = explosion ?? assembly
	if (!config) return 0
	if ((config.progress === undefined) === (config.controller === undefined))
		throw new Error('Configure exactly one of progress or controller')
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

export function applyBrickEffect(
	bindings: readonly BoundUnit[],
	prepared: PreparedModel,
	progressValue: number,
	config: ExplosionConfig | AssemblyConfig,
	reducedMotion = false,
	kind: 'explosion' | 'assembly' = 'explosion',
	edges = true,
) {
	rememberVisibility(bindings)
	const progress = normalizeProgress(progressValue)
	for (const binding of bindings) midpoint(binding, prepared.source)
	if (kind === 'explosion') {
		const explosion = config as ExplosionConfig
		const distance = explosion.distance ?? 20
		if (!Number.isFinite(distance) || distance < 0)
			throw new Error('distance must be finite and nonnegative')
		const origin = explosion.origin ?? prepared.center ?? [0, 0, 0]
		origin.forEach((v, i) => {
			if (!Number.isFinite(v)) throw new Error(`origin[${i}] must be finite`)
		})
		const center = new Vector3(...origin)
		for (const binding of bindings) {
			const direction = midpoint(binding, prepared.source).sub(center)
			move(
				binding,
				direction.lengthSq()
					? direction.normalize().multiplyScalar(distance * progress)
					: new Vector3(),
			)
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
	if (
		assembly.easing !== undefined &&
		assembly.easing !== 'linear' &&
		assembly.easing !== 'smoothstep'
	)
		throw new Error('easing must be "linear" or "smoothstep"')
	const coordinate = { x: 0, y: 1, z: 2 }[axis]
	const ordered = [...bindings].sort((a, b) => {
		const difference =
			midpoint(a, prepared.source).toArray()[coordinate] -
			midpoint(b, prepared.source).toArray()[coordinate]
		const directed =
			(assembly.direction ?? 'ascending') === 'ascending'
				? difference
				: -difference
		return directed || comparePath(a.unit.path, b.unit.path)
	})
	const offset: readonly [number, number, number] = assembly.offset ?? [0, 0, 0]
	offset.forEach((v, i) => {
		if (!Number.isFinite(v)) throw new Error(`offset[${i}] must be finite`)
	})
	ordered.forEach((binding, index) => {
		const local = ordered.length
			? Math.max(0, Math.min(1, ordered.length * progress - index))
			: 0
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
				: assembly.easing === 'smoothstep'
					? local * local * (3 - 2 * local)
					: local
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
