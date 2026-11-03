import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import {
	prepareConstructionUnits,
	selectConstructionUnits,
} from '../src/construction-units.js'

const {
	readModel,
	cloneModel,
	getConstructionBindings,
	retainModel,
	normalizePartsLibraryPath,
	DEFAULT_PARTS_LIBRARY_PATH,
} = (await import(
	new URL('../../dist/model-resource.js', import.meta.url).href
)) as typeof import('../dist/model-resource.js')

const colors = await readFile(
	new URL('../../assets/LDConfig.ldr', import.meta.url),
	'utf8',
)
const triangle = '0 Triangle\n0 !LDRAW_ORG Part\n3 16 0 0 0 10 0 0 0 10 0\n'
const reference = (name: string) => `1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${name}\n`
const root = (name: string) => `0 FILE root.ldr\n0 Root\n${reference(name)}`
if (!globalThis.ProgressEvent)
	globalThis.ProgressEvent = class extends Event {
		readonly lengthComputable: boolean
		readonly loaded: number
		readonly total: number
		constructor(type: string, init: ProgressEventInit = {}) {
			super(type)
			this.lengthComputable = init.lengthComputable ?? false
			this.loaded = init.loaded ?? 0
			this.total = init.total ?? 0
			Object.assign(this, init)
		}
	}

async function withFetch(
	handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
	run: (requests: string[]) => Promise<void>,
) {
	const previous = globalThis.fetch
	const requests: string[] = []
	globalThis.fetch = async (input) => {
		const url = input instanceof Request ? input.url : String(input)
		requests.push(url)
		return url.endsWith('/LDConfig.ldr') ? new Response(colors) : handler(url)
	}
	try {
		await run(requests)
	} finally {
		globalThis.fetch = previous
	}
}
async function load(src: string, path?: string) {
	try {
		return readModel(src, path)
	} catch (value) {
		if (!(value instanceof Promise)) throw value
		await value
		return readModel(src, path)
	}
}

test('normalizes library URLs and origin-relative paths without browser globals at import', () => {
	assert.equal(
		normalizePartsLibraryPath('https://parts.test/ldraw'),
		'https://parts.test/ldraw/',
	)
	assert.equal(
		normalizePartsLibraryPath('/ldraw', 'https://app.test/model.mpd'),
		'https://app.test/ldraw/',
	)
	assert.equal(normalizePartsLibraryPath(), DEFAULT_PARTS_LIBRARY_PATH)
	for (const value of [
		'relative/path',
		'file:///tmp/ldraw',
		'https://parts.test/?bad=1',
	])
		assert.throws(() => normalizePartsLibraryPath(value), /partsLibraryPath/)
})

test('recursively resolves parts and primitives, deduplicates repeated references, and honors embedded definitions', async () => {
	const src = 'https://models.test/recursive.mpd'
	const path = 'https://recursive.test/ldraw/'
	const embedded = 'embedded.dat'
	await withFetch(
		(url) => {
			if (url === src)
				return new Response(
					root('brick.dat') +
						reference('brick.dat') +
						reference(embedded) +
						'0 FILE embedded.dat\n' +
						triangle,
				)
			if (url === `${path}parts/brick.dat`)
				return new Response(
					`0 Brick\n0 !LDRAW_ORG Part\n${reference('primitive.dat')}`,
				)
			if (url === `${path}p/primitive.dat`)
				return new Response(
					triangle.replace('!LDRAW_ORG Part', '!LDRAW_ORG Primitive'),
				)
			return new Response('missing', { status: 404 })
		},
		async (requests) => {
			const model = await load(src, path)
			assert.ok(model.isGroup)
			assert.equal(
				requests.filter((url) => url === `${path}parts/brick.dat`).length,
				1,
			)
			assert.ok(requests.includes(`${path}p/primitive.dat`))
			assert.equal(requests.filter((url) => url.includes(embedded)).length, 0)
		},
	)
})

test('isolates cached models and retain/release by normalized effective library URL', async () => {
	const src = 'https://models.test/libraries.mpd'
	await withFetch(
		(url) => new Response(url === src ? root('brick.dat') : triangle),
		async (requests) => {
			const pending = []
			for (const path of ['https://one.test', 'https://two.test']) {
				try {
					readModel(src, path)
				} catch (promise) {
					pending.push(promise)
				}
			}
			assert.notEqual(pending[0], pending[1])
			await Promise.all(pending)
			const first = readModel(src, 'https://one.test/')
			assert.equal(readModel(src, 'https://one.test'), first)
			assert.notEqual(readModel(src, 'https://two.test'), first)
			const release = retainModel(src, 'https://one.test')
			release()
			release()
			assert.equal(requests.filter((url) => url === src).length, 2)
		},
	)
})

test('rejects nested failures that upstream would otherwise log and omit, then permits retry', async () => {
	const src = 'https://models.test/nested-retry.mpd'
	let repaired = false
	await withFetch(
		(url) => {
			if (url === src) return new Response(root('parent.dat'))
			if (url.endsWith('/parts/parent.dat'))
				return new Response(
					`0 Parent\n0 !LDRAW_ORG Part\n${reference('missing-child.dat')}`,
				)
			return repaired
				? new Response(triangle)
				: new Response('missing', { status: 404 })
		},
		async () => {
			await assert.rejects(load(src, 'https://nested.test/'), (error) => {
				assert.ok(error instanceof Error)
				assert.match(error.message, /nested-retry.mpd/)
				assert.match(error.message, /missing-child.dat/)
				return true
			})
			repaired = true
			await new Promise((resolve) => setTimeout(resolve, 0))
			assert.ok((await load(src, 'https://nested.test/')).isGroup)
		},
	)
})

test('rejects HTML, empty, and offline part responses with dependency and model context', async () => {
	for (const mode of ['html', 'empty', 'network']) {
		const src = `https://models.test/bad-part-${mode}.mpd`
		await withFetch(
			(url) => {
				if (url === src) return new Response(root('bad.dat'))
				if (mode === 'network') throw new TypeError('offline')
				return new Response(
					mode === 'html' ? '<!doctype html><html>fallback</html>' : '  ',
				)
			},
			async () => {
				await assert.rejects(load(src, 'https://invalid.test/'), (error) => {
					assert.ok(error instanceof Error)
					assert.match(error.message, /bad-part-/)
					assert.match(error.message, /bad.dat/)
					return true
				})
			},
		)
	}
})

test('uses the hosted default when no override is supplied', async () => {
	const src = 'https://models.test/default.mpd'
	await withFetch(
		(url) => new Response(url === src ? root('brick.dat') : triangle),
		async (requests) => {
			await load(src)
			assert.ok(
				requests.includes(`${DEFAULT_PARTS_LIBRARY_PATH}parts/brick.dat`),
			)
		},
	)
})

test('resolves embedded OMR backslash subparts before attempting the library', async () => {
	const src = 'https://models.test/omr-subpart.mpd'
	const embedded = 's\\set - subpart.dat'
	await withFetch(
		(url) => {
			if (url === src)
				return new Response(`${root(embedded)}0 FILE ${embedded}\n${triangle}`)
			throw new Error('embedded subpart must not require external geometry')
		},
		async (requests) => {
			assert.ok((await load(src)).isGroup)
			assert.equal(
				requests.filter((url) => !url.endsWith('/LDConfig.ldr') && url !== src)
					.length,
				0,
			)
		},
	)
})

test('loads the embedded construction ownership fixture without geometry requests', async () => {
	const src = 'https://models.test/construction-ownership.mpd'
	const secondSrc = 'https://models.test/construction-ownership-reload.mpd'
	const fixture = await readFile(
		new URL('../../spec/fixtures/construction-ownership.mpd', import.meta.url),
		'utf8',
	)
	await withFetch(
		(url) =>
			new Response(url === src || url === secondSrc ? fixture : 'missing', {
				status: url === src || url === secondSrc ? 200 : 404,
			}),
		async (requests) => {
			const model = await load(src, 'https://fixture.test/ldraw/')
			assert.ok(model.isGroup)
			assert.equal(selectConstructionUnits(model).length, 7)
			const reloaded = await load(secondSrc, 'https://fixture.test/ldraw/')
			assert.deepEqual(
				selectConstructionUnits(model).map((unit) => unit.id),
				selectConstructionUnits(reloaded).map((unit) => unit.id),
			)
			assert.deepEqual(
				requests.filter((url) => !url.endsWith('/LDConfig.ldr')),
				[src, secondSrc],
			)
		},
	)
})

test('loads the standalone construction fixture without geometry requests', async () => {
	const src = 'https://models.test/construction-standalone.ldr'
	const fixture = await readFile(
		new URL('../../spec/fixtures/construction-standalone.ldr', import.meta.url),
		'utf8',
	)
	await withFetch(
		(url) =>
			new Response(url === src ? fixture : 'missing', {
				status: url === src ? 200 : 404,
			}),
		async (requests) => {
			const model = await load(src, 'https://fixture.test/ldraw/')
			assert.equal(model.userData.type, 'Part')
			assert.equal(model.userData.numBuildingSteps, 1)
			assert.equal(model.userData.buildingStep, 0)
			assert.deepEqual(
				requests.filter((url) => !url.endsWith('/LDConfig.ldr')),
				[src],
			)
		},
	)
})

test('disposes failed preparation and permits a repaired retry', async () => {
	const src = 'https://models.test/preparation-retry.mpd'
	const parse = LDrawLoader.prototype.parse
	let broken = true
	let disposed = 0
	LDrawLoader.prototype.parse = function (text, onLoad, onError) {
		return parse.call(
			this,
			text,
			(model) => {
				if (broken) {
					model.scale.x = 0
					model.traverse((node) => {
						if (
							'geometry' in node &&
							node.geometry &&
							typeof node.geometry === 'object' &&
							'addEventListener' in node.geometry &&
							typeof node.geometry.addEventListener === 'function'
						)
							node.geometry.addEventListener('dispose', () => disposed++)
					})
				}
				onLoad(model)
			},
			onError,
		)
	}
	try {
		await withFetch(
			() => new Response(triangle),
			async () => {
				await assert.rejects(load(src), /preparation-retry.*singular/)
				assert.ok(disposed > 0)
				broken = false
				await new Promise((resolve) => setTimeout(resolve, 0))
				assert.ok((await load(src)).isGroup)
			},
		)
	} finally {
		LDrawLoader.prototype.parse = parse
	}
})

test('shares prepared metadata per effective library and binds clones independently', async () => {
	const src = 'https://models.test/prepared-libraries.ldr'
	await withFetch(
		() => new Response(triangle),
		async () => {
			await load(src, 'https://one.test/')
			await load(src, 'https://two.test/')
			const first = cloneModel(src, 'https://one.test/')
			const second = cloneModel(src, 'https://one.test/')
			const other = cloneModel(src, 'https://two.test/')
			const a = getConstructionBindings(first)
			const b = getConstructionBindings(second)
			const c = getConstructionBindings(other)
			assert.ok(a && b && c)
			assert.equal(a.prepared, b.prepared)
			assert.notEqual(a.prepared, c.prepared)
			assert.notEqual(a.units[0].roots[0], b.units[0].roots[0])
			const firstMesh = first.children[0] as import('three').Mesh
			const secondMesh = second.children[0] as import('three').Mesh
			assert.equal(firstMesh.geometry, secondMesh.geometry)
			assert.equal(firstMesh.material, secondMesh.material)
		},
	)
})

test('observes explicit, empty and nested loader steps and recursive clone metadata', async () => {
	const src = 'https://models.test/construction-steps.mpd'
	const fixture = await readFile(
		new URL('../../spec/fixtures/construction-steps.mpd', import.meta.url),
		'utf8',
	)
	await withFetch(
		() => new Response(fixture),
		async () => {
			const model = await load(src)
			const observations = (root: import('three').Object3D) => {
				const values: unknown[] = []
				root.traverse((node) => {
					if ('type' in node.userData)
						values.push([
							node.userData.fileName,
							node.userData.startingBuildingStep ?? null,
							node.userData.buildingStep ?? null,
						])
				})
				return values
			}
			assert.deepEqual(observations(model), [
				['', null, 0],
				['part.dat', false, 0],
				['sub.ldr', true, 1],
				['part.dat', false, 1],
				['outer.dat', true, 2],
				['part.dat', true, 3],
				['part.dat', true, 4],
			])
			assert.equal(model.userData.numBuildingSteps, 5)
			const prepared = prepareConstructionUnits(model, src)
			assert.equal(prepared.numBuildingSteps, 5)
			assert.deepEqual(
				prepared.observations.map((item) => [
					item.sourceName,
					item.startingStep,
					item.step,
				]),
				observations(model),
			)
			const units = selectConstructionUnits(model)
			assert.equal(units.filter((unit) => unit.kind === 'part').length, 4)
			assert.deepEqual(observations(model.clone(true)), observations(model))
		},
	)
})
