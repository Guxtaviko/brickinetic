import { expect, test } from '@playwright/test'

test('prerendered docs and static browser search work without a runtime server', async ({
	page,
	request,
}) => {
	const base = 'http://127.0.0.1:4184'
	for (const path of [
		'/',
		'/playground/',
		'/docs/',
		'/docs/effects/',
		'/docs/controllers/',
		'/docs/resources/',
		'/docs/api/',
	]) {
		const response = await request.get(base + path)
		expect(response.ok()).toBe(true)
		const html = await response.text()
		expect(html).toContain('<html')
		if (path.startsWith('/docs/')) expect(html).toContain('nd-docs-layout')
	}
	const search = await request.get(`${base}/api/search`)
	expect(search.ok()).toBe(true)
	expect(await search.json()).toBeTruthy()
	await page.goto(`${base}/docs/controllers/`)
	await expect(
		page.getByRole('heading', {
			name: 'Controllers and render loops',
			exact: true,
		}),
	).toBeVisible()
	await page
		.getByRole('button', { name: /Search/ })
		.first()
		.click()
	await page.getByRole('dialog').getByRole('combobox').fill('playback')
	await expect(
		page
			.getByRole('dialog')
			.getByRole('option')
			.filter({ hasText: /playback/i })
			.first(),
	).toBeVisible()
})

test('the production playground hydrates without recoverable errors', async ({
	page,
}) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.route('**/models/*.mpd', (route) =>
		route.fulfill({
			contentType: 'text/plain',
			body: '0 FILE test.ldr\n4 4 10 20 30 20 20 30 20 30 30 10 30 30\n',
		}),
	)
	await page.goto('http://127.0.0.1:4184/playground')
	await expect(page.getByTestId('model-status')).toContainText('Model ready')
	expect(errors).toEqual([])
})
