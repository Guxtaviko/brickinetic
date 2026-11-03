import assert from 'node:assert/strict'
import test from 'node:test'
import {
	BoxGeometry,
	Group,
	LineBasicMaterial,
	LineSegments,
	Mesh,
	MeshBasicMaterial,
	Vector3,
} from 'three'
import {
	applyBrickEffect,
	bindBrickEffect,
	captureBrickEffectVisibility,
	createBrickEffectController,
	restoreBrickEffects,
	validateEffectConfig,
} from '../src/brick-effects.js'
import {
	bindConstructionUnits,
	prepareConstructionUnits,
} from '../src/construction-units.js'
import { setEdgeVisibility } from '../src/model-view.js'

function setup() {
	const model = new Group()
	for (const y of [-2, 2]) {
		const part = new Group()
		part.userData.type = 'Part'
		part.position.y = y
		part.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
		model.add(part)
	}
	const prepared = prepareConstructionUnits(model, 'effect-fixture')
	return {
		prepared,
		bindings: bindConstructionUnits(model.clone(true), prepared),
	}
}

test('controller retains progress across unbind and rejects concurrent bindings', () => {
	const controller = createBrickEffectController(1.5)
	assert.equal(controller.getProgress(), 1)
	const unbind = bindBrickEffect({ controller }, () => {})
	assert.throws(
		() => bindBrickEffect({ controller }, () => {}),
		/already bound/,
	)
	controller.setProgress(0.4)
	assert.throws(() => controller.setProgress(Number.NaN), /finite/)
	unbind()
	assert.equal(controller.getProgress(), 0.4)
	assert.equal(validateEffectConfig({ controller }), 0.4)
})

test('controller binding survives StrictMode-style replay and failed initial evaluation', () => {
	const controller = createBrickEffectController(0.25)
	assert.throws(
		() =>
			bindBrickEffect({ controller }, () => {
				throw new Error('initial apply failed')
			}),
		/initial apply failed/,
	)
	const first = bindBrickEffect({ controller }, () => {})
	first()
	const second = bindBrickEffect({ controller }, () => {})
	controller.setProgress(0.75)
	assert.equal(controller.getProgress(), 0.75)
	second()
	assert.equal(controller.getProgress(), 0.75)
})

test('validates conflicting sources and clamps numeric progress', () => {
	assert.throws(
		() =>
			validateEffectConfig({
				progress: 0,
				controller: createBrickEffectController(),
			} as never),
		/progress or controller/,
	)
	assert.throws(
		() => validateEffectConfig({ progress: Number.POSITIVE_INFINITY }),
		/progress must be finite/,
	)
	assert.equal(validateEffectConfig({ progress: -2 }), 0)
	assert.equal(validateEffectConfig({ progress: 2 }), 1)
})

test('explosion derives reversible poses from baseline for arbitrary seek histories', () => {
	const { prepared, bindings } = setup()
	const config = { progress: 0, distance: 10 }
	const baseline = bindings.map((binding) => binding.roots[0].matrix.toArray())
	for (const progress of [1, 0.25, 0.9, 0])
		applyBrickEffect(bindings, prepared, progress, config)
	assert.deepEqual(
		bindings.map((binding) => binding.roots[0].matrix.toArray()),
		baseline,
	)
	assert.throws(
		() =>
			applyBrickEffect(bindings, prepared, 0, { progress: 0, distance: -1 }),
		/distance/,
	)
	applyBrickEffect(bindings, prepared, 2, { progress: 2, distance: 0 })
	assert.deepEqual(
		bindings.map((binding) => binding.roots[0].matrix.toArray()),
		baseline,
	)
	assert.equal(bindings[0].roots[0].matrix.elements[13], baseline[0][13])
	assert.throws(
		() =>
			applyBrickEffect(bindings, prepared, 0.2, {
				progress: 0.2,
				origin: [0, Number.NaN, 0],
			}),
		/origin\[1\]/,
	)
	assert.throws(
		() =>
			applyBrickEffect(bindings, prepared, 0.2, {
				progress: 0.2,
				distance: Number.POSITIVE_INFINITY,
			}),
		/distance/,
	)
})

test('an explosion leaves a unit at its origin coincident with its baseline center', () => {
	const model = new Group()
	const part = new Group()
	part.userData.type = 'Part'
	part.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
	model.add(part)
	const prepared = prepareConstructionUnits(model, 'origin')
	const bindings = bindConstructionUnits(model.clone(true), prepared)
	const baseline = bindings[0].roots[0].matrix.toArray()
	applyBrickEffect(bindings, prepared, 1, { progress: 1, distance: 20 })
	assert.deepEqual(bindings[0].roots[0].matrix.toArray(), baseline)
})

test('explosion clamps endpoints and applies distance from the configured origin', () => {
	const { prepared, bindings } = setup()
	const baseline = bindings.map(({ roots }) => roots[0].position.clone())
	const config = { progress: 0, origin: [0, 0, 0] as const, distance: 10 }
	applyBrickEffect(bindings, prepared, 2, config)
	for (let i = 0; i < bindings.length; i++)
		assert.ok(
			Math.abs(bindings[i].roots[0].position.distanceTo(baseline[i]) - 10) <
				1e-6,
		)
	applyBrickEffect(bindings, prepared, -1, config)
	for (let i = 0; i < bindings.length; i++)
		assert.ok(bindings[i].roots[0].position.distanceTo(baseline[i]) < 1e-6)
})

test('assembly entrances seek with easing and react to reduced motion', () => {
	const { prepared, bindings } = setup()
	const config = {
		progress: 0,
		entrance: 'translate' as const,
		offset: [8, 0, 0] as const,
		easing: 'smoothstep' as const,
	}
	const root = bindings[1].roots[0]
	const baseline = root.position.x
	applyBrickEffect(bindings, prepared, 0.125, config, false, 'assembly')
	assert.ok(Math.abs(root.position.x - baseline - 6.75) < 1e-6)
	assert.equal(root.children[0].visible, true)
	applyBrickEffect(bindings, prepared, 0.125, config, true, 'assembly')
	assert.ok(Math.abs(root.position.x - baseline) < 1e-6)
	applyBrickEffect(
		bindings,
		prepared,
		0.125,
		{ ...config, easing: 'linear' },
		false,
		'assembly',
	)
	assert.ok(Math.abs(root.position.x - baseline - 6) < 1e-6)
	applyBrickEffect(
		bindings,
		prepared,
		0.125,
		{ progress: 0 },
		false,
		'assembly',
	)
	assert.ok(Math.abs(root.position.x - baseline) < 1e-6)
	applyBrickEffect(bindings, prepared, 0, config, false, 'assembly')
	assert.equal(root.children[0].visible, false)
	applyBrickEffect(bindings, prepared, 1, config, false, 'assembly')
	assert.ok(Math.abs(root.position.x - baseline) < 1e-6)
})

test('missing unit bounds fail with source and occurrence even for a single unit', () => {
	const { prepared, bindings } = setup()
	const unit = { ...bindings[0].unit, bounds: null }
	assert.throws(
		() =>
			applyBrickEffect(
				[{ unit, roots: bindings[0].roots }],
				prepared,
				0.5,
				{ progress: 0.5 },
				false,
				'assembly',
			),
		/effect-fixture.*0.*bounds/,
	)
})

test('effect seeks and restoration are isolated between instances sharing prepared data', () => {
	const model = new Group()
	const part = new Group()
	part.userData.type = 'Part'
	part.position.x = 4
	part.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
	model.add(part)
	const prepared = prepareConstructionUnits(model, 'isolation')
	const first = bindConstructionUnits(model.clone(true), prepared)
	const second = bindConstructionUnits(model.clone(true), prepared)
	const baseline = second[0].roots[0].matrix.toArray()
	applyBrickEffect(first, prepared, 1, {
		progress: 1,
		origin: [0, 0, 0],
		distance: 10,
	})
	assert.notDeepEqual(first[0].roots[0].matrix.toArray(), baseline)
	assert.deepEqual(second[0].roots[0].matrix.toArray(), baseline)
	restoreBrickEffects(first)
	assert.deepEqual(first[0].roots[0].matrix.toArray(), baseline)
})

test('assembly uses stable axis order and strict positive stage visibility', () => {
	const { prepared, bindings } = setup()
	const config = {
		progress: 0,
		entrance: 'translate' as const,
		offset: [3, 0, 0] as const,
	}
	applyBrickEffect(bindings, prepared, 0.5, config, false, 'assembly')
	const visible = bindings.map(
		(binding) => binding.roots[0].children[0].visible,
	)
	assert.deepEqual(visible, [false, true])
	const positions = bindings.map((binding) =>
		new Vector3().setFromMatrixPosition(binding.roots[0].matrix).toArray(),
	)
	assert.notDeepEqual(positions[0], positions[1])
	assert.throws(
		() =>
			applyBrickEffect(
				bindings,
				prepared,
				0.4,
				{ progress: 0.4, offset: [0, Number.NaN, 0] },
				false,
				'assembly',
			),
		/offset\[1\]/,
	)
	assert.throws(
		() =>
			applyBrickEffect(
				bindings,
				prepared,
				0.4,
				{ progress: 0.4, axis: 'q' } as never,
				false,
				'assembly',
			),
		/axis/,
	)
})

test('assembly keeps baseline edge visibility independent from the edges setting', () => {
	const model = new Group()
	const part = new Group()
	part.userData.type = 'Part'
	const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial())
	const edge = new LineSegments(new BoxGeometry(), new LineBasicMaterial())
	const hiddenEdge = new LineSegments(
		new BoxGeometry(),
		new LineBasicMaterial(),
	)
	hiddenEdge.visible = false
	part.add(mesh, edge, hiddenEdge)
	model.add(part)
	const prepared = prepareConstructionUnits(model, 'edges')
	const clone = model.clone(true)
	captureBrickEffectVisibility(clone)
	const bindings = bindConstructionUnits(clone, prepared)
	const clonedEdge = bindings[0].roots[0].children[1]
	const clonedHiddenEdge = bindings[0].roots[0].children[2]
	setEdgeVisibility(clone, false)
	applyBrickEffect(
		bindings,
		prepared,
		1,
		{ progress: 1 },
		false,
		'assembly',
		false,
	)
	assert.equal(clonedEdge.visible, false)
	applyBrickEffect(
		bindings,
		prepared,
		1,
		{ progress: 1 },
		false,
		'assembly',
		true,
	)
	assert.equal(clonedEdge.visible, true)
	assert.equal(clonedHiddenEdge.visible, false)
	restoreBrickEffects(bindings)
	setEdgeVisibility(clone, true)
	assert.equal(clonedEdge.visible, true)
	assert.equal(clonedHiddenEdge.visible, false)
})

test('assembly ordering uses numeric occurrence paths for ties and supports descending direction', () => {
	const model = new Group()
	for (let index = 0; index < 2; index++) {
		const part = new Group()
		part.userData.type = 'Part'
		part.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
		model.add(part)
	}
	const prepared = prepareConstructionUnits(model, 'repeated')
	const bindings = bindConstructionUnits(model.clone(true), prepared)
	applyBrickEffect(
		bindings,
		prepared,
		0.5,
		{ progress: 0.5 },
		false,
		'assembly',
	)
	assert.equal(bindings[0].roots[0].children[0].visible, true)
	assert.equal(bindings[1].roots[0].children[0].visible, false)
	const directional = new Group()
	for (const y of [-2, 2]) {
		const part = new Group()
		part.userData.type = 'Part'
		part.position.y = y
		part.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()))
		directional.add(part)
	}
	const directionalPrepared = prepareConstructionUnits(directional, 'direction')
	const directionalBindings = bindConstructionUnits(
		directional.clone(true),
		directionalPrepared,
	)
	applyBrickEffect(
		directionalBindings,
		directionalPrepared,
		0.5,
		{ progress: 0.5, direction: 'descending' },
		false,
		'assembly',
	)
	assert.equal(directionalBindings[0].roots[0].children[0].visible, true)
	assert.equal(directionalBindings[1].roots[0].children[0].visible, false)
	const empty = new Group()
	const emptyPrepared = prepareConstructionUnits(empty, 'empty')
	assert.doesNotThrow(() =>
		applyBrickEffect(
			[],
			emptyPrepared,
			0.5,
			{ progress: 0.5 },
			false,
			'assembly',
		),
	)
})
