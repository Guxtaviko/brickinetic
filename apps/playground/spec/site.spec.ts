import { expect, test } from '@playwright/test'

test('home and documentation deep links render with browser search and both themes', async ({
	page,
}) => {
	const errors: string[] = []
	page.on('pageerror', (error) => errors.push(error.message))
	await page.goto('/docs/effects')
	await expect(
		page.getByRole('heading', { name: 'Effects and motion', exact: true }),
	).toBeVisible()
	await page
		.getByRole('button', { name: /Search/ })
		.first()
		.click()
	const search = page.getByRole('dialog').getByRole('combobox')
	await search.fill('controller')
	await expect(
		page
			.getByRole('dialog')
			.getByRole('option')
			.filter({ hasText: /controller/i })
			.first(),
	).toBeVisible()
	await page.keyboard.press('Escape')
	await page.goto('/docs/api')
	await expect(
		page.getByRole('heading', { name: /^BrickModelProps/ }),
	).toBeVisible()
	await page.emulateMedia({ colorScheme: 'dark' })
	await page.goto('/')
	await expect(page.getByRole('heading', { level: 1 })).toContainText(
		'LDraw models',
	)
	expect(errors).toEqual([])
})
