import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { BufferGeometry, Texture } from 'three'
import {
	cloneModel,
	readModel,
	retainModel,
	RESOURCE_EVICTION_DELAY_MS,
} from '../dist/model-resource.js'
import { setEdgeVisibility } from '../dist/model-view.js'

const fixture = await readFile(new URL('../assets/prepared-model.mpd', import.meta.url), 'utf8')
const colors = await readFile(new URL('../assets/LDConfig.ldr', import.meta.url), 'utf8')

if (!globalThis.ProgressEvent) {
	globalThis.ProgressEvent = class ProgressEvent extends Event {
		constructor(type, init = {}) {
			super(type)
			Object.assign(this, init)
		}
	}
}

function render(src) {
	try {
		return { value: readModel(src) }
	} catch (thrown) {
		return { thrown }
	}
}

async function withFetch(handler, run) {
	const previous = globalThis.fetch
	globalThis.fetch = async (input, init) => {
		const url = input?.url ?? String(input)
		if (url.endsWith('/LDConfig.ldr')) return new Response(colors)
		return handler(url, init)
	}
	try {
		await run()
	} finally {
		globalThis.fetch = previous
	}
}

async function loadAndRead(src) {
	const wakeable = render(src).thrown
	assert.ok(wakeable instanceof Promise)
	await wakeable
	return readModel(src)
}

function trackDisposals(model) {
	const resources = new Set()
	model.traverse((object) => {
		const renderable = object
		if (renderable.geometry) resources.add(renderable.geometry)
		for (const material of Array.isArray(renderable.material)
			? renderable.material
			: renderable.material
				? [renderable.material]
				: [])
		{
			resources.add(material)
			for (const value of Object.values(material))
				if (value?.isTexture) resources.add(value)
		}
	})
	const counts = new Map([...resources].map((resource) => [resource, 0]))
	for (const resource of resources)
		resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1))
	return {
		size: resources.size,
		assertDisposedOnce() {
			assert.ok(resources.size > 0)
			for (const [resource, count] of counts)
				assert.equal(count, 1, `${resource.type} should be disposed exactly once`)
		},
		assertNotDisposed() {
			for (const count of counts.values()) assert.equal(count, 0)
		},
	}
}

test('keeps shared resources through StrictMode replay and concurrent consumers', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	await withFetch(async () => new Response(fixture), async () => {
		const src = 'https://lifecycle.test/shared.mpd'
		const model = await loadAndRead(src)
		const strictInstance = cloneModel(src)
		const remainingInstance = cloneModel(src)
		setEdgeVisibility(strictInstance, false)
		setEdgeVisibility(remainingInstance, true)
		const texture = new Texture()
		let assignedTexture = false
		model.traverse((object) => {
			const materials = Array.isArray(object.material)
				? object.material
				: object.material
					? [object.material]
					: []
			if (!assignedTexture && materials[0]) {
				materials[0].map = texture
				assignedTexture = true
			}
		})
		assert.ok(assignedTexture)
		const disposals = trackDisposals(model)

		const strictSetup = retainModel(src)
		strictSetup()
		const strictReplay = retainModel(src)
		const concurrentConsumer = retainModel(src)

		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS * 2)
		disposals.assertNotDisposed()
		strictReplay()
		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS * 2)
		disposals.assertNotDisposed()
		remainingInstance.traverse((object) => {
			if (object.isLineSegments || object.isConditionalLine)
				assert.equal(object.visible, true)
		})

		concurrentConsumer()
		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS)
		disposals.assertDisposedOnce()
	})
})

test('clones scene nodes per instance while sharing immutable render resources', async () => {
	await withFetch(async () => new Response(fixture), async () => {
		const src = 'https://lifecycle.test/instance-clones.mpd'
		await loadAndRead(src)
		const first = cloneModel(src)
		const second = cloneModel(src)
		assert.notEqual(first, second)
		assert.notEqual(first.children[0], second.children[0])
		assert.equal(first.children.length, second.children.length)

		let firstGeometry
		let secondGeometry
		first.traverse((object) => {
			if (!firstGeometry && object.geometry) firstGeometry = object.geometry
		})
		second.traverse((object) => {
			if (!secondGeometry && object.geometry) secondGeometry = object.geometry
		})
		assert.ok(firstGeometry)
		assert.equal(firstGeometry, secondGeometry)

		first.position.x = 12
		first.children[0].visible = false
		assert.equal(second.position.x, 0)
		assert.equal(second.children[0].visible, true)
	})
})

test('keeps ordinary and conditional edge visibility independent per clone', async () => {
	await withFetch(async () => new Response(fixture), async () => {
		const src = 'https://lifecycle.test/edge-isolation.mpd'
		const source = await loadAndRead(src)
		const withoutEdges = cloneModel(src)
		const withEdges = cloneModel(src)
		setEdgeVisibility(withoutEdges, false)
		setEdgeVisibility(withEdges, true)

		let ordinary = 0
		let conditional = 0
		for (const [model, visible] of [
			[withoutEdges, false],
			[withEdges, true],
			[source, true],
		]) {
			model.traverse((object) => {
				if (object.isConditionalLine) {
					conditional++
					assert.equal(object.visible, visible)
				} else if (object.isLineSegments) {
					ordinary++
					assert.equal(object.visible, visible)
				}
			})
		}
		assert.ok(ordinary > 0)
		assert.ok(conditional > 0)
	})
})

test('keeps out-of-order source completions isolated by src', async () => {
	const resolvers = new Map()
	await withFetch(
		(url) => new Promise((resolve) => resolvers.set(url, resolve)),
		async () => {
			const srcA = 'https://lifecycle.test/source-a.mpd'
			const srcB = 'https://lifecycle.test/source-b.mpd'
			const pendingA = render(srcA).thrown
			const pendingB = render(srcB).thrown
			assert.ok(pendingA instanceof Promise)
			assert.ok(pendingB instanceof Promise)

			resolvers.get(srcB)(new Response(fixture))
			await pendingB
			const modelB = readModel(srcB)
			resolvers.get(srcA)(new Response(fixture))
			await pendingA
			const modelA = readModel(srcA)

			assert.notEqual(modelA, modelB)
			assert.equal(readModel(srcB), modelB)
		},
	)
})

test('protects a render that commits just before deferred eviction', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	await withFetch(async () => new Response(fixture), async () => {
		const src = 'https://lifecycle.test/commit-race.mpd'
		const wakeable = render(src).thrown
		assert.ok(wakeable instanceof Promise)
		await wakeable

		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS - 1)
		const model = readModel(src)
		const disposals = trackDisposals(model)
		const release = retainModel(src)
		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS * 3)
		disposals.assertNotDisposed()

		release()
		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS)
		disposals.assertDisposedOnce()
	})
})

test('releases an abandoned render and a load whose consumer unmounted while pending', async (t) => {
	t.mock.timers.enable({ apis: ['setTimeout'] })
	await withFetch(async () => new Response(fixture), async () => {
		const src = 'https://lifecycle.test/abandoned-render.mpd'
		const model = await loadAndRead(src)
		const disposals = trackDisposals(model)
		// No retainModel call represents a render that Suspense abandoned before commit.
		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS)
		t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS)
		disposals.assertDisposedOnce()
	})

	let resolveResponse
	let geometryDisposals = 0
	const originalDispose = BufferGeometry.prototype.dispose
	BufferGeometry.prototype.dispose = function (...args) {
		geometryDisposals++
		return originalDispose.apply(this, args)
	}
	try {
		await withFetch(
			() => new Promise((resolve) => { resolveResponse = resolve }),
			async () => {
				const src = 'https://lifecycle.test/unmounted-while-pending.mpd'
				const wakeable = render(src).thrown
				assert.ok(wakeable instanceof Promise)
				// The suspended component unmounts before the request settles, so no committed lease exists.
				resolveResponse(new Response(fixture))
				await wakeable
				t.mock.timers.tick(RESOURCE_EVICTION_DELAY_MS)
				assert.ok(geometryDisposals > 0)
			},
		)
	} finally {
		BufferGeometry.prototype.dispose = originalDispose
	}
})
