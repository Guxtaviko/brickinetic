import assert from 'node:assert/strict'
import test from 'node:test'
import {
	Box3,
	BoxGeometry,
	Group,
	Mesh,
	MeshBasicMaterial,
	Vector3,
} from 'three'

const { getCenterOffset, LDrawOrientation, setEdgeVisibility } = await import(
	'../src/model-view.js'
)

test('uses identity center offset by default and centers the oriented bounds when requested', () => {
	const model = new Group()
	const mesh = new Mesh(new BoxGeometry(2, 4, 6), new MeshBasicMaterial())
	mesh.position.set(10, 20, 30)
	model.add(mesh)

	assert.deepEqual(getCenterOffset(model, false).toArray(), [0, 0, 0])
	const offset = getCenterOffset(model, true)
	const bounds = new Box3()
	model.updateMatrixWorld(true)
	bounds.setFromObject(model).applyMatrix4(LDrawOrientation).translate(offset)
	assert.ok(bounds.getCenter(new Vector3()).length() < 1e-10)
})

test('rotates the LDraw vertical axis into Three.js positive Y', () => {
	const ldrawUp = new Vector3(0, -1, 0)
	const threeUp = ldrawUp.applyMatrix4(LDrawOrientation)
	assert.ok(threeUp.distanceTo(new Vector3(0, 1, 0)) < 1e-10)
})

test('toggles ordinary and conditional edge visibility on the supplied instance tree', () => {
	const model = new Group()
	const ordinary = new Group()
	Object.assign(ordinary, { isLineSegments: true })
	const conditional = new Group()
	Object.assign(conditional, { isConditionalLine: true })
	const hidden = new Group()
	Object.assign(hidden, { isLineSegments: true })
	hidden.visible = false
	model.add(ordinary, conditional, hidden)

	setEdgeVisibility(model, false)
	assert.equal(ordinary.visible, false)
	assert.equal(conditional.visible, false)
	setEdgeVisibility(model, true)
	assert.equal(ordinary.visible, true)
	assert.equal(conditional.visible, true)
	assert.equal(hidden.visible, false)
})
