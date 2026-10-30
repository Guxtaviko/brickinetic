import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import {
	readModel,
	retainModel,
	normalizePartsLibraryPath,
	DEFAULT_PARTS_LIBRARY_PATH,
} from '../dist/model-resource.js'

const colors = await readFile(
	new URL('../assets/LDConfig.ldr', import.meta.url),
	'utf8',
)
const triangle = '0 Triangle\n0 !LDRAW_ORG Part\n3 16 0 0 0 10 0 0 0 10 0\n'
const reference = (name) => `1 16 0 0 0 1 0 0 0 1 0 0 0 1 ${name}\n`
const root = (name) => '0 FILE root.ldr\n0 Root\n' + reference(name)
if (!globalThis.ProgressEvent)
	globalThis.ProgressEvent = class extends Event {
		constructor(type, init = {}) {
			super(type)
			Object.assign(this, init)
		}
	}

async function withFetch(handler, run) {
	const previous = globalThis.fetch
	const requests = []
	globalThis.fetch = async (input) => {
		const url = input?.url ?? String(input)
		requests.push(url)
		return url.endsWith('/LDConfig.ldr') ? new Response(colors) : handler(url)
	}
	try {
		await run(requests)
	} finally {
		globalThis.fetch = previous
	}
}
async function load(src, path) {
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
			if (url === path + 'parts/brick.dat')
				return new Response(
					'0 Brick\n0 !LDRAW_ORG Part\n' + reference('primitive.dat'),
				)
			if (url === path + 'p/primitive.dat')
				return new Response(
					triangle.replace('!LDRAW_ORG Part', '!LDRAW_ORG Primitive'),
				)
			return new Response('missing', { status: 404 })
		},
		async (requests) => {
			const model = await load(src, path)
			assert.ok(model.isGroup)
			assert.equal(
				requests.filter((url) => url === path + 'parts/brick.dat').length,
				1,
			)
			assert.ok(requests.includes(path + 'p/primitive.dat'))
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
					'0 Parent\n0 !LDRAW_ORG Part\n' + reference('missing-child.dat'),
				)
			return repaired
				? new Response(triangle)
				: new Response('missing', { status: 404 })
		},
		async () => {
			await assert.rejects(load(src, 'https://nested.test/'), (error) => {
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
				requests.includes(DEFAULT_PARTS_LIBRARY_PATH + 'parts/brick.dat'),
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
				return new Response(
					root(embedded) + '0 FILE ' + embedded + '\n' + triangle,
				)
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
