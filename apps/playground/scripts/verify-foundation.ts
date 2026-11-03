import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

type Probe = {
	id: string
	local: number[]
	rendered: { kind: string; position: number[] }[]
	other: number[] | null
}
type State = {
	ready: boolean
	error: string | null
	frames: number[]
	reduced: boolean
	calls: number
	units: number
	renderables: number
	probe: (distance: number) => Probe
	center: (enabled: boolean) => number[]
	pose: () => { float: number[]; spin: number; frameCount: number }
	advance: () => void
	unmount: () => void
}
const browser = await chromium.launch({
	headless: true,
	args: [
		'--no-sandbox',
		'--use-gl=angle',
		'--use-angle=swiftshader',
		'--enable-unsafe-swiftshader',
	],
})
const context = await browser.newContext({
	viewport: { width: 960, height: 720 },
	deviceScaleFactor: 1,
	reducedMotion: 'reduce',
})
const base = process.env.FOUNDATION_URL ?? 'http://127.0.0.1:4173'
const ready = async (page: Page, query: string) => {
	await page.goto(`${base}/foundation.html?model=car&instances=2&${query}`)
	await page.waitForFunction(
		() => {
			const state = (window as unknown as { foundation: State }).foundation
			return state?.ready || state?.error
		},
		undefined,
		{ timeout: 120_000 },
	)
	const error = await page.evaluate(
		() => (window as unknown as { foundation: State }).foundation.error,
	)
	if (error) throw new Error(error)
	await page.waitForTimeout(1000)
}
const near = (a: number[], b: number[]) =>
	a.every((value, i) => Math.abs(value - b[i]) < 1e-6)
const checks: Record<string, unknown> = {}
try {
	const page = await context.newPage()
	await ready(page, 'loop=always')
	const before = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.probe(0),
	)
	await page.screenshot({ path: '../../docs/evidence/m3.1-assembled.png' })
	const displaced = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.probe(30),
	)
	await page.waitForTimeout(200)
	await page.screenshot({ path: '../../docs/evidence/m3.1-displaced.png' })
	assert.deepEqual(
		new Set(before.rendered.map((item) => item.kind)),
		new Set(['face', 'edge', 'conditional']),
	)
	assert.deepEqual(displaced.other, before.other)
	const deltas = displaced.rendered.map((item, i) =>
		item.position.map((n, j) => n - before.rendered[i].position[j]),
	)
	assert.ok(deltas[0].some((n) => Math.abs(n) > 1))
	for (const delta of deltas) assert.ok(near(delta, deltas[0]))
	const centeredOff = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.center(false),
	)
	const stillDisplaced = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.probe(30),
	)
	assert.deepEqual(stillDisplaced.local, displaced.local)
	const centeredOn = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.center(true),
	)
	assert.notDeepEqual(centeredOff, centeredOn)
	const restored = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.probe(0),
	)
	assert.ok(near(restored.local, before.local))
	checks.composition = {
		id: before.id,
		kinds: before.rendered.map((item) => item.kind),
		delta: deltas[0],
		independent: true,
		restored: true,
		centerToggle: true,
	}
	for (const loop of ['always', 'demand', 'never'] as const) {
		await ready(page, `loop=${loop}`)
		const first = await page.evaluate(() =>
			(window as unknown as { foundation: State }).foundation.pose(),
		)
		await page.waitForTimeout(400)
		const second = await page.evaluate(() =>
			(window as unknown as { foundation: State }).foundation.pose(),
		)
		if (loop === 'always') assert.ok(second.frameCount > first.frameCount)
		else assert.equal(second.frameCount, first.frameCount)
		if (loop === 'never') {
			await page.evaluate(() => {
				const state = (window as unknown as { foundation: State }).foundation
				state.advance()
				state.advance()
			})
			assert.ok(
				(
					await page.evaluate(() =>
						(window as unknown as { foundation: State }).foundation.pose(),
					)
				).frameCount > second.frameCount,
			)
		}
		checks[loop] = { before: first.frameCount, after: second.frameCount }
	}
	await page.emulateMedia({ reducedMotion: 'no-preference' })
	await ready(page, 'loop=never&motion=1')
	await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.advance(),
	)
	await page.waitForTimeout(100)
	await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.advance(),
	)
	const motionBaseline = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.probe(0),
	)
	const motionDisplaced = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.probe(30),
	)
	const motionPose = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.pose(),
	)
	assert.notEqual(motionPose.spin, 0)
	assert.notEqual(motionPose.float[1], 0)
	const motionDeltas = motionDisplaced.rendered.map((item, index) =>
		item.position.map(
			(value, axis) => value - motionBaseline.rendered[index].position[axis],
		),
	)
	for (const delta of motionDeltas) assert.ok(near(delta, motionDeltas[0]))
	assert.ok(motionDeltas[0].some((value) => Math.abs(value) > 1))
	await ready(page, 'loop=always&motion=1')
	const motionProbe = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.probe(30),
	)
	assert.ok(motionProbe.rendered.length >= 3)
	const moving = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.pose(),
	)
	await page.waitForTimeout(300)
	const moved = await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.pose(),
	)
	assert.notEqual(moving.spin, moved.spin)
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await ready(page, 'loop=always&motion=1')
	const reduced = await page.evaluate(() => ({
		reduced: (window as unknown as { foundation: State }).foundation.reduced,
		pose: (window as unknown as { foundation: State }).foundation.pose(),
	}))
	assert.equal(reduced.reduced, true)
	assert.equal(reduced.pose.spin, 0)
	await page.evaluate(() =>
		(window as unknown as { foundation: State }).foundation.unmount(),
	)
	assert.equal(await page.locator('canvas').count(), 0)
	checks.motion = {
		moving,
		moved,
		reduced,
		unmounted: true,
		frozenPose: motionPose,
		displacedDelta: motionDeltas[0],
	}
	await page.addInitScript(() => {
		const tracker = { active: 0, commits: 0 }
		let rendererId = 0
		Object.assign(window, {
			preferenceTracker: tracker,
			__REACT_DEVTOOLS_GLOBAL_HOOK__: {
				supportsFiber: true,
				renderers: new Map(),
				inject: () => ++rendererId,
				onCommitFiberRoot: () => tracker.commits++,
				onCommitFiberUnmount: () => {},
				onPostCommitFiberRoot: () => {},
			},
		})
		const original = window.matchMedia.bind(window)
		window.matchMedia = (query) => {
			const result = original(query)
			if (query !== '(prefers-reduced-motion: reduce)') return result
			const add = result.addEventListener.bind(result)
			const remove = result.removeEventListener.bind(result)
			result.addEventListener = (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | AddEventListenerOptions,
			) => {
				if (type === 'change') tracker.active++
				add(type, listener, options)
			}
			result.removeEventListener = (
				type: string,
				listener: EventListenerOrEventListenerObject,
				options?: boolean | EventListenerOptions,
			) => {
				if (type === 'change') tracker.active--
				remove(type, listener, options)
			}
			return result
		}
	})
	await page.goto(base)
	await page
		.getByTestId('model-status')
		.filter({ hasText: 'Model ready' })
		.waitFor({ timeout: 120_000 })
	await page.waitForFunction(
		() =>
			(window as unknown as { preferenceTracker: { active: number } })
				.preferenceTracker.active === 1,
	)
	await page.getByLabel('Float', { exact: true }).uncheck()
	await page.getByLabel('Spin', { exact: true }).uncheck()
	await page.waitForFunction(
		() =>
			(window as unknown as { preferenceTracker: { active: number } })
				.preferenceTracker.active === 0,
	)
	await page.getByLabel('Reduced motion', { exact: true }).selectOption('never')
	await page.getByLabel('Spin', { exact: true }).check()
	await page.waitForTimeout(500)
	const commits = await page.evaluate(
		() =>
			(window as unknown as { preferenceTracker: { commits: number } })
				.preferenceTracker.commits,
	)
	await page.waitForTimeout(500)
	assert.ok(commits > 0)
	assert.equal(
		await page.evaluate(
			() =>
				(window as unknown as { preferenceTracker: { commits: number } })
					.preferenceTracker.commits,
		),
		commits,
	)
	await page.getByLabel('Edge lines', { exact: true }).uncheck()
	await page.getByLabel('Center bounds', { exact: true }).check()
	await page.getByLabel('Render loop', { exact: true }).selectOption('never')
	await page.getByRole('button', { name: 'Advance 1/60 second' }).click()
	assert.equal(await page.locator('canvas').count(), 1)
	assert.equal(await page.getByRole('alert').count(), 0)
	checks.publicDemo = {
		ready: true,
		preferenceCleanup: true,
		noFrameCommits: true,
		edgeToggle: true,
		centerToggle: true,
		manualFrame: true,
	}
	await writeFile(
		'../../docs/evidence/m3.1-browser.json',
		`${JSON.stringify(checks, null, 2)}\n`,
	)
	console.log(JSON.stringify(checks))
} finally {
	await context.close()
	await browser.close()
}
