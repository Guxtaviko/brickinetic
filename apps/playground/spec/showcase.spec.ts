import { expect, test } from '@playwright/test'

const fixture =
	'0 FILE test.ldr\n0 Test\n4 4 10 20 30 20 20 30 20 30 30 10 30 30\n'
test.beforeEach(async ({ page }) => {
	await page.route('**/models/*.mpd', (route) =>
		route.fulfill({ contentType: 'text/plain', body: fixture }),
	)
	await page.goto('/playground')
	await expect(page.getByTestId('model-status')).toContainText('Model ready')
})

test('automatic defaults capture actual progress into manual mode and preserve the mode across edits', async ({
	page,
}) => {
	await expect(
		page.getByRole('radio', { name: 'Automatic', exact: true }),
	).toBeChecked()
	await expect(
		page.getByRole('slider', { name: 'Effect progress', exact: true }),
	).toHaveCount(0)
	await expect(
		page.getByLabel('Duration (seconds)', { exact: true }),
	).toHaveValue('3')
	await expect(page.getByLabel('Hold (seconds)', { exact: true })).toHaveValue(
		'3',
	)
	await expect(page.getByLabel('Repeat', { exact: true })).toBeChecked()
	await expect(page.getByLabel('Float', { exact: true })).not.toBeChecked()
	await expect(page.getByLabel('Spin', { exact: true })).toBeChecked()
	await page.getByRole('button', { name: 'Replay', exact: true }).click()
	await expect
		.poll(async () =>
			Number(
				(
					await page
						.getByLabel('Current effect progress', { exact: true })
						.textContent()
				)?.replace('%', ''),
			),
		)
		.toBeGreaterThan(5)
	const actual =
		Number(
			(
				await page
					.getByLabel('Current effect progress', { exact: true })
					.textContent()
			)?.replace('%', ''),
		) / 100
	await page.getByRole('radio', { name: 'Manual', exact: true }).check()
	const slider = page.getByRole('slider', {
		name: 'Effect progress',
		exact: true,
	})
	const captured = Number(await slider.inputValue())
	expect(captured).toBeGreaterThan(0)
	expect(Math.abs(captured - actual)).toBeLessThan(0.15)
	await slider.fill('0.6')
	await page.getByLabel('Construction effect').selectOption('explosion')
	await expect(
		page.getByRole('radio', { name: 'Manual', exact: true }),
	).toBeChecked()
	await expect(slider).toHaveValue('0.6')
	await page.getByLabel('Model', { exact: true }).selectOption('speedboat')
	await expect(page.getByTestId('model-status')).toContainText('Model ready')
	await expect(slider).toHaveValue('0.6')
	await page.getByRole('radio', { name: 'Automatic', exact: true }).check()
	await expect(slider).toHaveCount(0)
	await page.getByRole('button', { name: 'Pause effect', exact: true }).click()
	const paused = await page
		.getByLabel('Current effect progress', { exact: true })
		.textContent()
	await page.waitForTimeout(120)
	await expect(
		page.getByLabel('Current effect progress', { exact: true }),
	).toHaveText(paused ?? '')
	await page.getByRole('button', { name: 'Resume effect', exact: true }).click()
})

test('generated code reflects controls, omits disabled motion and copies the current configuration', async ({
	page,
	context,
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await page.getByRole('radio', { name: 'Manual', exact: true }).check()
	await page
		.getByRole('slider', { name: 'Effect progress', exact: true })
		.fill('0.37')
	await page.getByLabel('Construction effect').selectOption('explosion')
	await page
		.getByLabel('Explosion rotation (degrees)', { exact: true })
		.fill('30')
	await page.getByLabel('Spin', { exact: true }).uncheck()
	await page.getByLabel('Edge lines', { exact: true }).uncheck()
	await page.getByRole('slider', { name: 'Position X', exact: true }).fill('12')
	await page.getByLabel('Easing', { exact: true }).selectOption('custom')
	await page.getByLabel('X1', { exact: true }).fill('0.3')
	await page.getByRole('button', { name: 'Copy code', exact: true }).click()
	await expect(
		page.getByRole('status', { name: 'Code copy status' }),
	).toContainText('Copied')
	const code = await page.evaluate(() => navigator.clipboard.readText())
	expect(code).toContain('satisfies BrickModelProps')
	expect(code).toContain('"progress": 0.37')
	expect(code).toContain('"edges": false')
	expect(code).toContain('0.5235987755982988')
	expect(code).toContain('0.3')
	expect(code).not.toContain('"motion"')
	expect(code).not.toContain('"playback"')
	await expect(
		page.getByTestId('generated-code').locator('code span').first(),
	).toBeVisible()
})

test('playback updates the viewport without React commits on every frame', async ({
	page,
}) => {
	await page.addInitScript(() => {
		let commits = 0
		let nextId = 0
		const renderers = new Map<number, unknown>()
		Object.defineProperty(window, '__reactCommits', { get: () => commits })
		Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
			value: {
				supportsFiber: true,
				renderers,
				inject: (renderer: unknown) => {
					const id = ++nextId
					renderers.set(id, renderer)
					return id
				},
				onCommitFiberRoot: () => {
					commits++
				},
				onCommitFiberUnmount() {},
				onPostCommitFiberRoot() {},
			},
		})
	})
	await page.reload()
	await expect(page.getByTestId('model-status')).toContainText('Model ready')
	await expect(
		page.getByTestId('generated-code').locator('code span').first(),
	).toBeVisible()
	await page.waitForTimeout(500)
	const commits = await page.evaluate(() =>
		Number(Reflect.get(window, '__reactCommits')),
	)
	expect(commits).toBeGreaterThan(0)
	await page.waitForTimeout(250)
	expect(
		await page.evaluate(() => Number(Reflect.get(window, '__reactCommits'))),
	).toBe(commits)
})
