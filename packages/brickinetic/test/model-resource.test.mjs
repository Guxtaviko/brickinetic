import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { readModel } from '../dist/model-resource.js'

const fixture = await readFile(new URL('./fixtures/car-self-contained.mpd', import.meta.url), 'utf8')
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
		if (url.endsWith('/LDConfig.ldr'))
			return new Response(colors, {
				headers: { 'content-type': 'text/plain' },
			})
		return handler(url, init)
	}
	try {
		await run()
	} finally {
		globalThis.fetch = previous
	}
}

test('deduplicates pending requests and shares the loaded source model', async () => {
	await withFetch(async () => new Response(fixture), async () => {
		const src = 'https://models.test/deduplicated.mpd'
		let requests = 0
		const previous = globalThis.fetch
		globalThis.fetch = async (input, init) => {
			if (String(input) === src) requests++
			return previous(input, init)
		}

		const first = render(src).thrown
		const second = render(src).thrown
		assert.equal(first, second)
		assert.ok(first instanceof Promise)
		await first
		const firstModel = readModel(src)
		assert.equal(readModel(src), firstModel)
		assert.equal(requests, 1)
	})
})

test('rejects network, HTTP, HTML, empty, and unresolved-reference failures with source context', async () => {
	await withFetch(async (url) => {
		if (url.endsWith('/network.mpd')) throw new TypeError('offline')
		if (url.endsWith('/missing.mpd')) return new Response('not found', { status: 404 })
		if (url.endsWith('/html.mpd'))
			return new Response('<!doctype html><html></html>', {
				headers: { 'content-type': 'text/html' },
			})
		if (url.endsWith('/empty.mpd')) return new Response('  \n')
		if (url.endsWith('/no-geometry.mpd'))
			return new Response('0 FILE empty.ldr\n0 Empty model\n')
		if (!url.endsWith('.mpd')) return new Response('missing', { status: 404 })
		return new Response(
			'0 FILE root.ldr\n0 Root\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 missing-part.dat\n',
		)
	}, async () => {
		const failures = [
			['network.mpd', /network error.*offline/i],
			['missing.mpd', /HTTP 404/],
			['html.mpd', /response is HTML/],
			['empty.mpd', /MPD is empty/],
			['no-geometry.mpd', /no renderable geometry/],
			['reference.mpd', /unresolved part.*missing-part\.dat/i],
		]

		for (const [path, message] of failures) {
			const src = `https://models.test/${path}`
			const wakeable = render(src).thrown
			assert.ok(wakeable instanceof Promise, `${path} should suspend while loading`)
			await wakeable
			assert.throws(() => readModel(src), (error) => {
				assert.match(error.message, new RegExp(src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
				assert.match(error.message, message)
				return true
			})
		}
	})
})

test('evicts a failed source so a boundary reset and remount can retry it', async () => {
	let attempts = 0
	await withFetch(async (url) => {
		if (url.endsWith('/retry.mpd') && attempts++ === 0)
			return new Response('unavailable', { status: 503 })
		return new Response(fixture)
	}, async () => {
		const src = 'https://models.test/retry.mpd'

		const initial = render(src).thrown
		assert.ok(initial instanceof Promise)
		await initial
		assert.throws(() => readModel(src), /HTTP 503/)
		assert.throws(() => readModel(src), /HTTP 503/)
		await new Promise((resolve) => setTimeout(resolve, 0))

		const retry = render(src).thrown
		assert.ok(retry instanceof Promise)
		await retry
		assert.ok(readModel(src).isGroup)
		assert.equal(attempts, 2)
	})
})
