import { Box3, Matrix4, type Object3D, Vector3 } from 'three'
import { type PreparedModel, preparedCenter } from './construction-units.js'

export const LDrawOrientation = new Matrix4().makeRotationX(Math.PI)
const edgeBaseline = new WeakMap<Object3D, boolean>()

export function getCenterOffset(
	model: Object3D,
	center: boolean,
	prepared?: PreparedModel,
): Vector3 {
	if (!center) return new Vector3()
	if (prepared) return preparedCenter(prepared).negate()
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
		if (edge.isLineSegments || edge.isConditionalLine) {
			if (!edgeBaseline.has(edge)) edgeBaseline.set(edge, edge.visible)
			edge.visible = visible && (edgeBaseline.get(edge) ?? true)
		}
	})
}
