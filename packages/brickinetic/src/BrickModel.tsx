// Evaluate Three.js before R3F's CommonJS entry to avoid a require(ESM) cycle on Node 22.12.
import 'three'
import { type ThreeElements, useFrame, useThree } from '@react-three/fiber'
import {
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import type { Group } from 'three'
import {
	type AssemblyConfig,
	applyBrickEffect,
	bindBrickEffect,
	captureBrickEffectVisibility,
	type ExplosionConfig,
	restoreBrickEffects,
	validateEffectConfig,
} from './brick-effects.js'
import {
	cloneModel,
	getConstructionBindings,
	retainModel,
} from './model-resource.js'
import { getCenterOffset, setEdgeVisibility } from './model-view.js'
import {
	advanceMotion,
	initialMotionState,
	type MotionConfig,
	motionPose,
	validateMotion,
} from './motion.js'

export interface BrickModelProps {
	src: string
	partsLibraryPath?: string
	position?: ThreeElements['group']['position']
	rotation?: ThreeElements['group']['rotation']
	scale?: ThreeElements['group']['scale']
	center?: boolean
	edges?: boolean
	motion?: MotionConfig
	explosion?: ExplosionConfig
	assembly?: AssemblyConfig
}

function useReducedMotion(
	policy: MotionConfig['reducedMotion'] = 'system',
	requested = true,
) {
	const [preference, setPreference] = useState<{
		policy: string
		reduced: boolean
	}>()
	useEffect(() => {
		if (!requested || policy === 'never' || policy === 'always') {
			setPreference(undefined)
			return
		}
		if (
			typeof window === 'undefined' ||
			typeof window.matchMedia !== 'function'
		) {
			setPreference({ policy, reduced: false })
			return
		}
		const query = window.matchMedia('(prefers-reduced-motion: reduce)')
		const update = () => setPreference({ policy, reduced: query.matches })
		update()
		if (query.addEventListener) query.addEventListener('change', update)
		else query.addListener(update)
		return () => {
			if (query.removeEventListener) query.removeEventListener('change', update)
			else query.removeListener(update)
		}
	}, [policy, requested])
	return (
		policy !== 'always' &&
		(policy === 'never' ||
			(preference?.policy === policy && !preference.reduced))
	)
}

function MotionDriver({
	config,
	floatRef,
	spinRef,
}: {
	config: MotionConfig
	floatRef: RefObject<Group | null>
	spinRef: RefObject<Group | null>
}) {
	const state = useRef(initialMotionState())
	const invalidate = useThree((root) => root.invalidate)
	const frameloop = useThree((root) => root.frameloop)
	const dynamic =
		(!!config.float &&
			config.float.enabled !== false &&
			(config.float.speed ?? 0.8) !== 0 &&
			(config.float.amplitude ?? 0.15) !== 0) ||
		(!!config.spin &&
			config.spin.enabled !== false &&
			(config.spin.speed ?? 0.2) !== 0)
	const applyPose = useCallback(
		(delta: number) => {
			state.current = advanceMotion(state.current, config, delta)
			const pose = motionPose(state.current, config)
			floatRef.current?.position.set(...pose.position)
			spinRef.current?.rotation.set(...pose.rotation)
		},
		[config, floatRef, spinRef],
	)
	useLayoutEffect(() => {
		applyPose(0)
		invalidate()
	}, [applyPose, invalidate])
	useFrame((_, delta) => {
		applyPose(delta)
		if (dynamic && frameloop === 'demand') invalidate()
	})
	return null
}

export function BrickModel({
	src,
	partsLibraryPath,
	position,
	rotation,
	scale,
	center = false,
	edges = true,
	motion,
	explosion,
	assembly,
}: BrickModelProps) {
	validateMotion(motion)
	validateEffectConfig(explosion, assembly)
	const requested =
		!!motion &&
		((!!motion.float && motion.float.enabled !== false) ||
			(!!motion.spin && motion.spin.enabled !== false))
	const permitted = useReducedMotion(motion?.reducedMotion, requested)
	const model = useMemo(() => {
		const clone = cloneModel(src, partsLibraryPath)
		captureBrickEffectVisibility(clone)
		return clone
	}, [src, partsLibraryPath])
	const centerOffset = useMemo(
		() =>
			getCenterOffset(model, center, getConstructionBindings(model)?.prepared),
		[model, center],
	)
	const floatRef = useRef<Group>(null)
	const spinRef = useRef<Group>(null)
	useEffect(() => retainModel(src, partsLibraryPath), [src, partsLibraryPath])
	useLayoutEffect(() => setEdgeVisibility(model, edges), [model, edges])
	const construction = getConstructionBindings(model)
	const effectReduced = useReducedMotion(motion?.reducedMotion, !!assembly)
	const invalidate = useThree((root) => root.invalidate)
	useLayoutEffect(() => {
		if (!construction || (!explosion && !assembly)) return
		const config = (explosion ?? assembly) as ExplosionConfig | AssemblyConfig
		const update = (progress: number) => {
			applyBrickEffect(
				construction.units,
				construction.prepared,
				progress,
				config,
				!!assembly && !effectReduced,
				assembly ? 'assembly' : 'explosion',
				edges,
			)
			invalidate()
		}
		const unbind = bindBrickEffect(config, update)
		return () => {
			unbind()
			restoreBrickEffects(construction.units)
			setEdgeVisibility(model, edges)
			invalidate()
		}
	}, [
		construction,
		explosion,
		assembly,
		effectReduced,
		invalidate,
		model,
		edges,
	])
	const active = permitted && requested
	useLayoutEffect(() => {
		if (!active) {
			if (floatRef.current) floatRef.current.position.set(0, 0, 0)
			if (spinRef.current) spinRef.current.rotation.set(0, 0, 0)
			invalidate()
		}
	}, [active, invalidate])
	return (
		<group position={position} rotation={rotation} scale={scale} dispose={null}>
			<group ref={floatRef} name='brickinetic-float'>
				<group ref={spinRef} name='brickinetic-spin'>
					<group position={centerOffset} rotation={[Math.PI, 0, 0]}>
						<primitive object={model} />
					</group>
				</group>
			</group>
			{active && motion && (
				<MotionDriver config={motion} floatRef={floatRef} spinRef={spinRef} />
			)}
		</group>
	)
}
