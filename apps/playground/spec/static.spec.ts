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
