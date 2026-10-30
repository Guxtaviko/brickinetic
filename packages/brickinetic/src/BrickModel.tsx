import type { ThreeElements } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { cloneModel, retainModel } from './model-resource.js'
import { getCenterOffset, setEdgeVisibility } from './model-view.js'

export interface BrickModelProps {
	src: string
	position?: ThreeElements['group']['position']
	rotation?: ThreeElements['group']['rotation']
	scale?: ThreeElements['group']['scale']
	center?: boolean
	edges?: boolean
}

export function BrickModel({
	src,
	position,
	rotation,
	scale,
	center = false,
	edges = true,
}: BrickModelProps) {
	const model = useMemo(() => cloneModel(src), [src])
	const centerOffset = useMemo(
		() => getCenterOffset(model, center),
		[model, center],
	)

	useEffect(() => retainModel(src), [src])
	useLayoutEffect(() => setEdgeVisibility(model, edges), [model, edges])

	return (
		<group position={position} rotation={rotation} scale={scale} dispose={null}>
			<group position={centerOffset} rotation={[Math.PI, 0, 0]}>
				<primitive object={model} />
			</group>
		</group>
	)
}
