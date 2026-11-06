import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
	await page.goto('http://127.0.0.1:4185/editor.html')
})

test('keyboard handles and valid numeric edits update a controlled curve', async ({
	page,
}) => {
	const handle = page.getByRole('slider', {
		name: 'First control point',
		exact: true,
	})
	await handle.focus()
	await page.keyboard.press('ArrowRight')
	await expect(page.getByLabel('X1', { exact: true })).toHaveValue('0.26')
	await page.keyboard.press('Shift+ArrowUp')
	await expect(page.getByLabel('Y1', { exact: true })).toHaveValue('0.2')
	await page.getByLabel('Y1', { exact: true }).fill('-2')
	await expect(page.getByTestId('controlled-curve')).toContainText('-2')
	await page.getByLabel('X1', { exact: true }).fill('2')
	await expect(page.getByRole('alert')).toContainText('X coordinates')
	await expect(page.getByTestId('controlled-curve')).toContainText('0.26')
	await page.getByLabel('X1', { exact: true }).fill('')
	await expect(page.getByRole('alert')).toBeVisible()
	await page.getByRole('button', { name: 'Ease out', exact: true }).click()
	await expect(page.getByLabel('X1', { exact: true })).toHaveValue('0')
	await expect(page.getByRole('alert')).toHaveCount(0)
})

test('pointer capture controls the curve and preview remains bounded in both themes', async ({
	page,
}) => {
	const handle = page.getByRole('slider', {
		name: 'Second control point',
		exact: true,
	})
	const box = await handle.boundingBox()
	if (!box) throw new Error('Missing control point bounds')
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
	await page.mouse.down()
	await page.mouse.move(box.x + 50, box.y - 20, { steps: 4 })
	await page.mouse.up()
	await expect(page.getByLabel('X2', { exact: true })).not.toHaveValue('0.25')
	await page.getByLabel('Y1', { exact: true }).fill('-8')
	await page.getByLabel('Y2', { exact: true }).fill('9')
	for (const theme of ['light', 'dark']) {
		await page.evaluate(
			(theme) =>
				document.documentElement.classList.toggle('dark', theme === 'dark'),
			theme,
		)
		for (const progress of ['0', '0.2', '0.8', '1']) {
			await page
				.getByRole('slider', { name: 'Preview progress', exact: true })
				.fill(progress)
			const value = Number(
				await page.getByTestId('preview-value').textContent(),
			)
			expect(value).toBeGreaterThanOrEqual(0)
			expect(value).toBeLessThanOrEqual(1)
		}
	}
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.setViewportSize({ width: 390, height: 844 })
	await expect(
		page.getByRole('slider', { name: 'First control point', exact: true }),
	).toBeVisible()
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth,
		),
	).toBe(true)
})

test('copy writes the valid tuple and reports completion accessibly', async ({
	page,
	context,
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await page.getByRole('button', { name: 'Copy tuple', exact: true }).click()
	await expect(page.getByRole('status', { name: 'Copy status' })).toContainText(
		'Copied',
	)
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		'[0.25, 0.1, 0.25, 1]',
	)
})
