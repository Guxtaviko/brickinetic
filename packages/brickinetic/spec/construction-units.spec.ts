import assert from 'node:assert/strict'
import test from 'node:test'
import {
	BoxGeometry,
	Group,
	LineBasicMaterial,
	LineSegments,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	Points,
	PointsMaterial,
	Sprite,
	Vector3,
} from 'three'
import {
	bindConstructionUnits,
	displaceConstructionUnit,
	prepareConstructionUnits,
	preparedCenter,
	selectConstructionUnits,
} from '../src/construction-units.js'
import { getCenterOffset } from '../src/model-view.js'

function fixture() {
	const root = new Group()
	const container = new Group()
	container.userData.type = 'CustomContainer'
	const part = () => {
		const result = new Group()
		result.userData.type = 'Part'
		result.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
		const nested = new Group()
		nested.userData.type = 'Part'
		nested.add(new LineSegments(new BoxGeometry(), new LineBasicMaterial()))
		result.add(nested)
		return result
	}
	root.add(
		new Mesh(new BoxGeometry(), new MeshBasicMaterial()),
		part(),
		part(),
		container,
	)
	container.add(
		part(),
		new LineSegments(new BoxGeometry(), new LineBasicMaterial()),
	)
	return root
}

test('part occurrences partition visual roots without changing parent relationships', () => {
	const root = fixture()
	const parents: (Group | null)[] = []
	root.traverse((node) => parents.push(node.parent as Group | null))
	const units = selectConstructionUnits(root)
	assert.deepEqual(
		units.map((unit) => unit.id),
		[':residual', '1:part', '2:part', '3:residual', '3/0:part'],
	)
	assert.deepEqual(
		selectConstructionUnits(fixture()).map((unit) => unit.id),
		units.map((unit) => unit.id),
	)
	for (const unit of units)
		for (const path of unit.roots)
			for (const other of units) {
				if (other === unit) continue
				for (const candidate of other.roots)
					assert.equal(
						path.length <= candidate.length &&
							path.every((value, index) => candidate[index] === value),
						false,
					)
			}
	const after: (Group | null)[] = []
	root.traverse((node) => after.push(node.parent as Group | null))
	assert.deepEqual(after, parents)
	const owned = new Map<object, number>()
	for (const unit of units)
		for (const path of unit.roots) {
			const node = path.reduce(
				(current, index) => current.children[index],
				root as import('three').Object3D,
			)
			node.traverse((child) => {
				if ('geometry' in child) owned.set(child, (owned.get(child) ?? 0) + 1)
			})
		}
	root.traverse((node) => {
		if ('geometry' in node) assert.equal(owned.get(node), 1)
	})
})

test('prepared baselines remain immutable and displacement restores across independent clones', () => {
	const root = fixture()
	root.children[3].rotation.z = Math.PI / 2
	root.children[3].scale.set(2, 3, -1)
	const prepared = prepareConstructionUnits(root, 'fixture')
	const first = root.clone(true)
	const second = root.clone(true)
	const a = bindConstructionUnits(first, prepared)
	const b = bindConstructionUnits(second, prepared)
	const index = prepared.units.findIndex((unit) => unit.id === '3/0:part')
	const initial = a[index].roots[0].matrix.clone()
	const reference = JSON.stringify(prepared)
	const center = preparedCenter(prepared).toArray()
	const centered = getCenterOffset(first, true, prepared).toArray()
	displaceConstructionUnit(a[index], new Vector3(2, 3, 4))
	assert.notDeepEqual(a[index].roots[0].matrix.elements, initial.elements)
	assert.deepEqual(b[index].roots[0].matrix.elements, initial.elements)
	assert.deepEqual(preparedCenter(prepared).toArray(), center)
	const displaced = a[index].roots[0].matrix.clone()
	assert.deepEqual(getCenterOffset(first, false, prepared).toArray(), [0, 0, 0])
	assert.deepEqual(getCenterOffset(first, true, prepared).toArray(), centered)
	assert.deepEqual(a[index].roots[0].matrix.elements, displaced.elements)
	for (let i = 0; i < 10; i++) displaceConstructionUnit(a[index], new Vector3())
	assert.deepEqual(a[index].roots[0].matrix.elements, initial.elements)
	assert.equal(JSON.stringify(prepared), reference)
	assert.ok(Object.isFrozen(prepared.units[index].bindings[0].localMatrix))
})

test('captures numeric bounds and explicit absence of optional metadata', () => {
	const root = new Group()
	const part = new Group()
	part.userData.type = 'Part'
	part.position.set(2, 3, 4)
	part.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()))
	root.add(part)
	const prepared = prepareConstructionUnits(root, 'numeric')
	assert.equal(prepared.numBuildingSteps, null)
	const unit = prepared.units[0]
	assert.equal(unit.sourceName, null)
	assert.equal(unit.step, null)
	assert.equal(unit.startingStep, null)
	assert.deepEqual(unit.parentPath, [])
	assert.equal(unit.submodelPath, null)
	assert.deepEqual(unit.bindings[0].localMatrix.slice(12, 15), [2, 3, 4])
	assert.ok(prepared.bounds)
	assert.ok(prepared.center && Object.isFrozen(prepared.center))
	assert.ok(unit.center && Object.isFrozen(unit.center))
	for (const [actual, expected] of preparedCenter(prepared)
		.toArray()
		.map((value, index) => [value, [2, -3, -4][index]]))
		assert.ok(Math.abs(actual - expected) < 1e-6)
})

test('converts oriented displacement through translated, rotated, scaled and mirrored parents', () => {
	for (const scale of [
		new Vector3(1, 1, 1),
		new Vector3(2, 3, 4),
		new Vector3(-2, 3, 4),
	]) {
		const root = new Group()
		const parent = new Group()
		parent.position.set(5, -7, 9)
		parent.rotation.set(0.3, -0.4, 0.7)
		parent.scale.copy(scale)
		const part = new Group()
		part.userData.type = 'Part'
		part.position.set(2, 3, 4)
		part.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
		parent.add(part)
		root.add(parent)
		const prepared = prepareConstructionUnits(root, 'vectors')
		const clone = root.clone(true)
		const binding = bindConstructionUnits(clone, prepared)[0]
		clone.updateMatrixWorld(true)
		const orient = new Matrix4().makeRotationX(Math.PI)
		const before = new Vector3()
			.setFromMatrixPosition(binding.roots[0].matrixWorld)
			.applyMatrix4(orient)
		const delta = new Vector3(3, -4, 5)
		displaceConstructionUnit(binding, delta)
		clone.updateMatrixWorld(true)
		const after = new Vector3()
			.setFromMatrixPosition(binding.roots[0].matrixWorld)
			.applyMatrix4(orient)
		assert.ok(after.sub(before).distanceTo(delta) < 1e-6)
		for (let i = 0; i < 10; i++)
			displaceConstructionUnit(binding, new Vector3())
		assert.ok(
			new Vector3()
				.setFromMatrixPosition(binding.roots[0].matrix)
				.distanceTo(part.position) < 1e-6,
		)
	}
})

test('rejects unsupported renderables and invalid transforms with occurrence context', () => {
	const root = new Group()
	root.add(new Points(new BoxGeometry(), new PointsMaterial()))
	assert.throws(
		() => selectConstructionUnits(root, 'fixture'),
		/fixture.*0.*unsupported renderable/,
	)
	root.remove(root.children[0])
	const parentMesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
	parentMesh.add(new Group())
	root.add(parentMesh)
	assert.throws(
		() => selectConstructionUnits(root, 'fixture'),
		/fixture.*0.*renderable has child/,
	)
	root.remove(parentMesh)
	root.add(new Sprite())
	assert.throws(
		() => selectConstructionUnits(root, 'fixture'),
		/fixture.*0.*unsupported renderable/,
	)
	root.remove(root.children[0])
	const part = new Group()
	part.scale.x = 0
	root.add(part)
	assert.throws(
		() => selectConstructionUnits(root, 'fixture'),
		/fixture.*0.*singular/,
	)
	part.scale.x = Number.NaN
	assert.throws(
		() => selectConstructionUnits(root, 'fixture'),
		/fixture.*0.*nonfinite/,
	)
	part.matrixAutoUpdate = false
	part.matrix.makeScale(1e-320, 1, 1)
	assert.throws(
		() => selectConstructionUnits(root, 'fixture'),
		/fixture.*0.*nonfinite/,
	)
})

test('empty structural and part containers do not produce units', () => {
	const root = new Group()
	const empty = new Group()
	empty.userData.type = 'Part'
	root.add(empty, new Group())
	assert.deepEqual(selectConstructionUnits(root), [])
})

test('rejects clone bindings when the hierarchy no longer matches the prepared source', () => {
	const root = fixture()
	const prepared = prepareConstructionUnits(root, 'fixture')
	const clone = root.clone(true)
	clone.remove(clone.children[1])
	assert.throws(
		() => bindConstructionUnits(clone, prepared),
		/ownership does not match|unexpected type/,
	)
	const changed = root.clone(true)
	const part = changed.children[1]
	part.remove(part.children[0])
	part.add(new LineSegments(new BoxGeometry(), new LineBasicMaterial()))
	assert.throws(
		() => bindConstructionUnits(changed, prepared),
		/renderables do not match|unexpected type/,
	)
})
