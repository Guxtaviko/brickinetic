import { expect, test } from '@playwright/test'

const fixture =
	'0 FILE test.ldr\n0 Test\n4 4 10 20 30 20 20 30 20 30 30 10 30 30\n'

test('axes persist, effects seek, reduced motion and models remain inspectable', async ({
	page,
}) => {
	await page.route('**/models/*.mpd', (route) =>
		route.fulfill({ contentType: 'text/plain', body: fixture }),
	)
	await page.goto('/playground')
	const ready = () =>
		expect(page.getByTestId('model-status')).toContainText('Model ready')
	await ready()
	const axes = page.getByLabel('XYZ preview', { exact: true })
	await expect(axes).toBeChecked()
	await expect(page.getByLabel('coordinate axes')).toBeVisible()
	await axes.uncheck()
	await expect(page.getByLabel('coordinate axes')).toHaveCount(0)
	await page.getByLabel('Model', { exact: true }).selectOption('speedboat')
	await ready()
	await expect(axes).not.toBeChecked()
	await page.getByLabel('Construction effect').selectOption('explosion')
	await page.getByRole('radio', { name: 'Manual', exact: true }).check()
	await page.getByLabel('Distance multiplier', { exact: true }).fill('2')
	await page
		.getByRole('slider', { name: 'Effect progress', exact: true })
		.fill('1')
	await expect(page.getByRole('alert')).toHaveCount(0)
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.getByLabel('Construction effect').selectOption('assembly')
	await page
		.getByRole('slider', { name: 'Effect progress', exact: true })
		.fill('0.5')
	await expect(page.getByRole('alert')).toHaveCount(0)
	await page.setViewportSize({ width: 390, height: 844 })
	await expect(axes).toBeVisible()
	await expect(page.locator('canvas')).toBeVisible()
})

test('each real demonstration model loads without an error', async ({
	page,
}) => {
	await page.goto('/playground')
	for (const model of ['car', 'speedboat', 'spaceship']) {
		await page.getByLabel('Model', { exact: true }).selectOption(model)
		await expect(page.getByTestId('model-status')).toContainText(
			'Model ready',
			{ timeout: 120_000 },
		)
		await expect(page.getByRole('alert')).toHaveCount(0)
	}
})

test('a missing part reports its name and retry recovers after repair', async ({
	page,
}) => {
	let repaired = false
	await page.route('**/models/*.mpd', (route) =>
		route.fulfill({
			contentType: 'text/plain',
			body: repaired
				? fixture
				: '0 FILE test.ldr\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 deliberately-missing.dat\n',
		}),
	)
	await page.route('**/deliberately-missing.dat', (route) =>
		route.fulfill({ status: 404, body: 'missing' }),
	)
	await page.goto('/playground')
	await expect(page.getByRole('alert')).toContainText(
		'deliberately-missing.dat',
	)
	repaired = true
	await page.getByRole('button', { name: 'Retry model' }).click()
	await expect(page.getByTestId('model-status')).toContainText('Model ready')
	await expect(page.getByRole('alert')).toHaveCount(0)
})
