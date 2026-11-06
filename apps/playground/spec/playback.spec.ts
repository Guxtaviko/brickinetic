import { expect, test } from '@playwright/test'

const fixture =
	'0 FILE test.ldr\n0 Test\n4 4 10 20 30 20 20 30 20 30 30 10 30 30\n'
test.beforeEach(async ({ page }) => {
	await page.route('**/models/*.mpd', (route) =>
		route.fulfill({ contentType: 'text/plain', body: fixture }),
	)
	await page.goto('/spec/fixtures/effects.html')
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.ready))
		.toBe(true)
})

test('demand holds sleep, paused playback freezes and completion stops frames', async ({
	page,
}) => {
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.progress))
		.toBe(1)
	const held = await page.evaluate(() => window.effectHarness.frames)
	await page.waitForTimeout(120)
	expect(await page.evaluate(() => window.effectHarness.frames)).toBe(held)
	await page.evaluate(() =>
		window.effectHarness.configure({
			effect: { type: 'explosion', playback: { duration: 0.5, paused: true } },
		}),
	)
	const paused = await page.evaluate(() => ({
		progress: window.effectHarness.progress,
		frames: window.effectHarness.frames,
	}))
	await page.waitForTimeout(150)
	expect(await page.evaluate(() => window.effectHarness.progress)).toBe(
		paused.progress,
	)
	const frames = await page.evaluate(() => window.effectHarness.frames)
	await page.waitForTimeout(100)
	expect(await page.evaluate(() => window.effectHarness.frames)).toBe(frames)
	await page.evaluate(() =>
		window.effectHarness.configure({
			effect: { type: 'explosion', playback: { duration: 0.5 } },
		}),
	)
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.progress))
		.toBe(1)
	await page.waitForTimeout(50)
	const completed = await page.evaluate(() => window.effectHarness.frames)
	await page.waitForTimeout(100)
	expect(await page.evaluate(() => window.effectHarness.frames)).toBe(completed)
})

test('manual frames stay consumer advanced and visual edits preserve progress', async ({
	page,
}) => {
	await page.goto('/spec/fixtures/effects.html?loop=never')
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.ready))
		.toBe(true)
	await page.evaluate(() =>
		window.effectHarness.configure({
			loop: 'never',
			replay: 1,
			effect: { type: 'explosion', distance: 5, playback: { duration: 2 } },
		}),
	)
	await page.waitForTimeout(50)
	await page.evaluate(() => window.effectHarness.advance(0.5))
	expect(await page.evaluate(() => window.effectHarness.progress)).toBeCloseTo(
		0.25,
		2,
	)
	await page.evaluate(() =>
		window.effectHarness.configure({
			effect: {
				type: 'explosion',
				distance: 20,
				easing: 'ease',
				playback: { duration: 2 },
			},
		}),
	)
	expect(await page.evaluate(() => window.effectHarness.progress)).toBeCloseTo(
		0.25,
		2,
	)
	await page.waitForTimeout(150)
	expect(await page.evaluate(() => window.effectHarness.progress)).toBeCloseTo(
		0.25,
		2,
	)
	await page.evaluate(() =>
		window.effectHarness.configure({
			effect: { type: 'explosion', playback: { duration: 2, paused: true } },
		}),
	)
	await page.evaluate(() => window.effectHarness.advance(1))
	expect(await page.evaluate(() => window.effectHarness.progress)).toBeCloseTo(
		0.25,
		2,
	)
})

test('reduced motion shows assembled pose and allowing motion restarts playback', async ({
	page,
}) => {
	await page.evaluate(() =>
		window.effectHarness.configure({
			reducedMotion: 'always',
			effect: { type: 'assembly', playback: { duration: 2, repeat: true } },
		}),
	)
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.progress))
		.toBe(1)
	await page.evaluate(() =>
		window.effectHarness.configure({
			reducedMotion: 'always',
			effect: { type: 'explosion', playback: { duration: 2, repeat: true } },
		}),
	)
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.progress))
		.toBe(0)
	await page.evaluate(() =>
		window.effectHarness.configure({ reducedMotion: 'never' }),
	)
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.progress))
		.toBeGreaterThan(0)
	await page.evaluate(() => window.effectHarness.configure({ mounted: false }))
	await page.waitForTimeout(50)
	const frames = await page.evaluate(() => window.effectHarness.frames)
	await page.waitForTimeout(100)
	expect(await page.evaluate(() => window.effectHarness.frames)).toBe(frames)
})

test('hidden time is excluded and playback resumes from the retained pose', async ({
	page,
}) => {
	await page.evaluate(() =>
		window.effectHarness.configure({
			replay: 1,
			effect: { type: 'explosion', playback: { duration: 2 } },
		}),
	)
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.progress))
		.toBeGreaterThan(0.05)
	const hidden = await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			value: true,
		})
		document.dispatchEvent(new Event('visibilitychange'))
		return window.effectHarness.progress
	})
	await page.waitForTimeout(250)
	expect(await page.evaluate(() => window.effectHarness.progress)).toBe(hidden)
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			value: false,
		})
		document.dispatchEvent(new Event('visibilitychange'))
	})
	expect(await page.evaluate(() => window.effectHarness.progress)).toBeCloseTo(
		hidden,
		1,
	)
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.progress))
		.toBeGreaterThan(hidden + 0.03)
})
