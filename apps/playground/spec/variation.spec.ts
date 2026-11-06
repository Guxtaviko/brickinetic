import { expect, test } from '@playwright/test'

test('seeded rotation seeks repeatably in the browser and replay reuses its source', async ({
	page,
}) => {
	let requests = 0
	await page.route('**/models/*.mpd', (route) => {
		requests++
		return route.fulfill({
			contentType: 'text/plain',
			body: '0 FILE test.ldr\n0 Test\n4 4 10 20 30 20 20 30 20 30 30 10 30 30\n',
		})
	})
	await page.goto('/spec/fixtures/effects.html?loop=never')
	await expect
		.poll(() => page.evaluate(() => window.effectHarness.ready))
		.toBe(true)
	const seek = (progress: number) =>
		page.evaluate(
			(progress) =>
				window.effectHarness.configure({
					effect: {
						type: 'explosion',
						progress,
						rotation: 0.7,
						origin: [0, 0, 0],
						randomness: 0.2,
						seed: 0,
					},
				}),
			progress,
		)
	await seek(0)
	const baseline = await page.evaluate(() => window.effectHarness.pose())
	await seek(0.8)
	const pose = await page.evaluate(() => window.effectHarness.pose())
	expect(pose).not.toEqual(baseline)
	for (const progress of [1, 0, 0.2, 0.8]) await seek(progress)
	expect(await page.evaluate(() => window.effectHarness.pose())).toEqual(pose)
	await seek(0)
	expect(await page.evaluate(() => window.effectHarness.pose())).toEqual(
		baseline,
	)
	await page.evaluate(() => window.effectHarness.configure({ replay: 2 }))
	await page.waitForTimeout(80)
	expect(requests).toBe(1)
})
