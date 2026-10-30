// Run against the Vite playground with: playwright-cli run-code --filename=apps/playground/.compiled/scripts/verify-model-loading.js
// Loads each OMR model in Chromium and waits for the fitted scene to report ready.

;async (page: import('playwright').Page) => {
	await page.unrouteAll()
	await page.goto(page.url())
	const status = page.getByTestId('model-status')
	const load = async (id: 'car' | 'speedboat' | 'spaceship') => {
		if (id !== 'car') {
			await page.getByLabel('Model', { exact: true }).selectOption(id)
			await status.filter({ hasText: 'Loading model and parts' }).waitFor()
		}
		await status
			.filter({ hasText: 'Model ready' })
			.waitFor({ timeout: 120_000 })
		if ((await page.getByRole('alert').count()) !== 0)
			throw new Error(`${id} failed to load`)
		return true
	}
	const loaded = {
		car: await load('car'),
		speedboat: await load('speedboat'),
		spaceship: await load('spaceship'),
	}
	return { loaded }
}
