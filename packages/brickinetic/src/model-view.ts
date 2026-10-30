import { Box3, Matrix4, type Object3D, Vector3 } from 'three'

export const LDrawOrientation = new Matrix4().makeRotationX(Math.PI)

export function getCenterOffset(model: Object3D, center: boolean): Vector3 {
	if (!center) return new Vector3()
	model.updateMatrixWorld(true)
	const bounds = new Box3().setFromObject(model).applyMatrix4(LDrawOrientation)
	return bounds.getCenter(new Vector3()).negate()
}

export function setEdgeVisibility(model: Object3D, visible: boolean) {
	model.traverse((object) => {
		const edge = object as Object3D & {
			isLineSegments?: boolean
			isConditionalLine?: boolean
		}
		if (edge.isLineSegments || edge.isConditionalLine) edge.visible = visible
	})
}
