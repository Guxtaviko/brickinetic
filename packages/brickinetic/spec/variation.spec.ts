import assert from 'node:assert/strict'
import test from 'node:test'
import {
	BoxGeometry,
	Group,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	Vector3,
} from 'three'
import { applyBrickEffect, restoreBrickEffects } from '../src/brick-effects.js'
import {
	bindConstructionUnits,
	prepareConstructionUnits,
} from '../src/construction-units.js'

function scene(transformed = false) {
	const source = new Group()
	if (transformed) {
		source.rotation.set(0.2, 0.4, -0.3)
		source.scale.set(-2, 3, 0.5)
	}
	for (let i = 0; i < 5; i++) {
		const part = new Group()
		part.userData.type = 'Part'
		part.position.set(i * 3, i * 2, i)
		part.rotation.set(0.1, i * 0.1, 0)
		part.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
		source.add(part)
	}
	const prepared = prepareConstructionUnits(source, 'variation')
	const clone = source.clone(true)
	const bindings = bindConstructionUnits(clone, prepared)
	return { prepared, bindings, clone }
}
const matrices = (bindings: ReturnType<typeof scene>['bindings']) =>
	bindings.map((b) => b.roots[0].matrix.toArray())

test('seeded explosion varies bounded travel and rotation and seeks reproducibly', () => {
	const { prepared, bindings } = scene()
	const baseline = matrices(bindings)
	const config = {
		type: 'explosion' as const,
		progress: 1,
		origin: [6, -4, -2] as const,
		distance: 10,
		rotation: 0.5,
		randomness: 1,
		seed: 7,
	}
	applyBrickEffect(bindings, prepared, 1, config)
	const exploded = matrices(bindings)
	assert.ok(
		exploded.some((matrix, i) =>
			matrix.slice(0, 12).some((n, j) => Math.abs(n - baseline[i][j]) > 1e-6),
		),
	)
	for (let i = 0; i < bindings.length; i++) {
		const delta = new Vector3()
			.setFromMatrixPosition(bindings[i].roots[0].matrix)
			.sub(
				new Vector3().setFromMatrixPosition(
					new Matrix4().fromArray(baseline[i]),
				),
			)
		// The central unit is origin-coincident and stays completely still.
		if (i === 2) assert.deepEqual(exploded[i], baseline[i])
		else assert.ok(delta.length() >= 5 - 1e-6 && delta.length() <= 15 + 1e-6)
	}
	for (const progress of [0.8, 0.2, 1, 0, 0.5, 1])
		applyBrickEffect(bindings, prepared, progress, config)
	assert.deepEqual(matrices(bindings), exploded)
	applyBrickEffect(bindings, prepared, 1, { ...config, seed: 8 })
	assert.notDeepEqual(matrices(bindings), exploded)
	applyBrickEffect(bindings, prepared, 0, config)
	assert.deepEqual(matrices(bindings), baseline)
})

test('randomized assembly retains spatial order and only one unfinished entrance', () => {
	const { prepared, bindings } = scene()
	const config = {
		type: 'assembly' as const,
		progress: 0,
		entrance: 'translate' as const,
		offset: [0, 10, 0] as const,
		randomness: 1,
		seed: 42,
	}
	// Oriented ascending Y reverses the source Y positions.
	for (let step = 0; step <= 100; step++) {
		const progress = step / 100
		applyBrickEffect(bindings, prepared, progress, config)
		const visible = [...bindings]
			.reverse()
			.map((binding) => binding.roots[0].children[0].visible)
		assert.ok(
			visible.every((value, i) => !value || visible.slice(0, i).every(Boolean)),
		)
		let partial = 0
		for (const binding of bindings) {
			if (!binding.roots[0].children[0].visible) continue
			const baseline = new Matrix4().fromArray(
				binding.unit.bindings[0].localMatrix,
			)
			if (Math.abs(binding.roots[0].position.y - baseline.elements[13]) > 1e-6)
				partial++
		}
		assert.ok(partial <= 1)
	}
	applyBrickEffect(bindings, prepared, 0.47, config)
	const pose = matrices(bindings)
	applyBrickEffect(bindings, prepared, 0.47, { ...config, randomness: 0 })
	assert.notDeepEqual(matrices(bindings), pose)
	for (const p of [1, 0, 0.8, 0.47])
		applyBrickEffect(bindings, prepared, p, config)
	assert.deepEqual(matrices(bindings), pose)
})

test('rotations preserve exact transformed matrices and restore auto-update policy', () => {
	const { prepared, bindings, clone } = scene(true)
	const baseline = matrices(bindings)
	const policies = bindings.map((b) => b.roots[0].matrixAutoUpdate)
	const config = {
		type: 'explosion' as const,
		progress: 1,
		rotation: 0.7,
		randomness: 0.2,
		seed: 0,
	}
	applyBrickEffect(bindings, prepared, 0.7, config)
	const before = matrices(bindings)
	clone.updateMatrixWorld(true)
	assert.deepEqual(matrices(bindings), before)
	restoreBrickEffects(bindings)
	assert.deepEqual(matrices(bindings), baseline)
	assert.deepEqual(
		bindings.map((b) => b.roots[0].matrixAutoUpdate),
		policies,
	)
})

test('invalid rotation randomness and uint32 seeds fail descriptively', () => {
	const { prepared, bindings } = scene()
	for (const [key, values] of [
		['rotation', [-1, NaN, Infinity]],
		['randomness', [-1, 2, NaN]],
		['seed', [-1, 2 ** 32, 0.5, NaN]],
	] as const)
		for (const value of values)
			assert.throws(
				() =>
					applyBrickEffect(bindings, prepared, 1, {
						type: 'explosion',
						progress: 1,
						[key]: value,
					}),
				new RegExp(key),
			)
})
