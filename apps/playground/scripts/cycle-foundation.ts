import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

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
const results: Record<string, unknown[]> =
	process.env.FOUNDATION_RESUME === '1'
		? JSON.parse(await readFile('../../docs/evidence/m3.1-cycles.json', 'utf8'))
		: {}
try {
	for (const model of (
		process.env.FOUNDATION_MODELS ?? 'car,speedboat,spaceship'
	).split(',')) {
		const page = await context.newPage()
		await page.goto(
			`${process.env.FOUNDATION_URL ?? 'http://127.0.0.1:4173'}/foundation.html?model=${model}`,
		)
		await page.waitForFunction(
			() => {
				const state = (
					window as unknown as {
						foundation: { ready: boolean; error: string | null }
					}
				).foundation
				return state?.ready || state?.error
			},
			undefined,
			{ timeout: 180_000 },
		)
		const error = await page.evaluate(
			() =>
				(window as unknown as { foundation: { error: string | null } })
					.foundation.error,
		)
		if (error) {
			results[model] = [{ error }]
			await page.close()
			continue
		}
		results[model] = []
		for (let index = 0; index < 10; index++) {
			const result = await page.evaluate(() =>
				(
					window as unknown as { foundation: { cycle: () => Promise<unknown> } }
				).foundation.cycle(),
			)
			results[model].push(result)
			await writeFile(
				'../../docs/evidence/m3.1-cycles.json',
				`${JSON.stringify(results, null, 2)}\n`,
			)
			console.log(`${model} cycle ${index + 1}/10`)
		}
		await page.close()
	}
} finally {
	await context.close()
	await browser.close()
}
