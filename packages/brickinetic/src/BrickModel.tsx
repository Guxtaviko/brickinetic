import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type RefObject,
} from 'react'
import type { Group } from 'three'
import { cloneModel, retainModel } from './model-resource.js'
import { getCenterOffset, setEdgeVisibility } from './model-view.js'
import {
	advanceMotion,
	initialMotionState,
	motionPose,
	validateMotion,
	type MotionConfig,
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
		if (!requested || policy === 'never') {
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
		policy === 'never' || (preference?.policy === policy && !preference.reduced)
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
}: BrickModelProps) {
	validateMotion(motion)
	const requested =
		!!motion &&
		((!!motion.float && motion.float.enabled !== false) ||
			(!!motion.spin && motion.spin.enabled !== false))
	const permitted = useReducedMotion(motion?.reducedMotion, requested)
	const model = useMemo(
		() => cloneModel(src, partsLibraryPath),
		[src, partsLibraryPath],
	)
	const centerOffset = useMemo(
		() => getCenterOffset(model, center),
		[model, center],
	)
	const floatRef = useRef<Group>(null)
	const spinRef = useRef<Group>(null)
	useEffect(() => retainModel(src, partsLibraryPath), [src, partsLibraryPath])
	useLayoutEffect(() => setEdgeVisibility(model, edges), [model, edges])
	const active = permitted && requested
	const invalidate = useThree((root) => root.invalidate)
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
