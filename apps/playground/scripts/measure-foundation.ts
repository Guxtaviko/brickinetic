import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { chromium } from 'playwright'

const base = process.env.FOUNDATION_URL ?? 'http://127.0.0.1:4173'
const runs = Number(process.env.FOUNDATION_RUNS ?? 5)
const motion = process.env.FOUNDATION_MOTION === '1'
const single = process.env.FOUNDATION_SINGLE === '1'
const warmup = Number(process.env.FOUNDATION_WARMUP_MS ?? 2000)
const windowMs = Number(process.env.FOUNDATION_WINDOW_MS ?? 10000)
const output =
	process.env.FOUNDATION_OUTPUT ?? '../../docs/evidence/m3.1-measurements.json'
const models = (
	process.env.FOUNDATION_MODELS ?? 'car,speedboat,spaceship'
).split(',')
const effects = (process.env.FOUNDATION_EFFECTS ?? 'none').split(',')
const effectRuns = process.env.FOUNDATION_EFFECTS !== undefined
const hashes: Record<string, string> = {}
const sizes: Record<string, number> = {}
const codeHashes: Record<string, string> = {}
for (const path of [
	'src/foundation.tsx',
	'../../packages/brickinetic/src/construction-units.ts',
	'../../packages/brickinetic/src/model-resource.ts',
	'../../packages/brickinetic/src/brick-effects.ts',
	'../../packages/brickinetic/src/model-view.ts',
	'scripts/measure-foundation.ts',
])
	codeHashes[path] = createHash('sha256')
		.update(await readFile(path))
		.digest('hex')
for (const model of models) {
	const bytes = await readFile(`public/models/${model}.mpd`)
	hashes[model] = createHash('sha256').update(bytes).digest('hex')
	sizes[model] = bytes.length
}
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
	reducedMotion: motion ? 'no-preference' : 'reduce',
})
type Measurement = {
	model: string
	baseline: boolean
	instances: number
	edges: boolean
	run: number
	error?: string
} & Record<string, unknown>
const results: Measurement[] = []
const report = {
	timestamp: new Date().toISOString(),
	browser: browser.version(),
	platform: os.platform(),
	release: os.release(),
	cpu: os.cpus()[0]?.model,
	cpuCount: os.cpus().length,
	memory: os.totalmem(),
	viewport: [960, 720],
	dpr: 1,
	power: 'not observable',
	throttling: 'none configured',
	backend: 'Chromium headless ANGLE SwiftShader',
	libraryRevision: 'f3d0c2256398c28fbb682f4bb08c59eed81fd4f1',
	hashes,
	sizes,
	codeHashes,
	commit: execFileSync('git', ['rev-parse', 'HEAD'], {
		encoding: 'utf8',
	}).trim(),
	versions: {
		node: process.version,
		three: '0.186.1',
		react: '19.3.1',
		fiber: '9.8.2',
	},
	warmup,
	windowMs,
	runs,
	motion,
	single,
	effects,
	cache:
		'single browser context; first request cold, subsequent HTTP cache subject to server headers',
	results,
}
if (process.env.FOUNDATION_RESUME === '1') {
	const previous = JSON.parse(await readFile(output, 'utf8')) as typeof report
	if (
		JSON.stringify(previous.codeHashes) !== JSON.stringify(codeHashes) ||
		JSON.stringify(previous.hashes) !== JSON.stringify(hashes) ||
		previous.warmup !== warmup ||
		previous.windowMs !== windowMs ||
		previous.runs !== runs ||
		previous.motion !== motion ||
		(previous.single ?? false) !== single ||
		JSON.stringify(previous.effects ?? ['none']) !== JSON.stringify(effects) ||
		previous.browser !== report.browser
	)
		throw new Error(
			'Cannot resume measurements with different inputs, browser, or sampling settings',
		)
	results.push(...previous.results.filter((result) => !result.error))
	report.timestamp = previous.timestamp
	report.cache = `${previous.cache}; resumed in a new browser context`
}
const save = () => writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
try {
	for (const model of models)
		for (const baseline of effectRuns || single ? [false] : [true, false])
			for (const instances of single ? [2] : effectRuns ? [1] : [1, 2])
				for (const edges of single ? [true] : [false, true])
					for (let run = 0; run < runs; run++) {
						for (const effect of effects) {
							const config = { model, baseline, instances, edges, effect, run }
							if (
								results.some(
									(row) =>
										row.model === model &&
										row.baseline === baseline &&
										row.instances === instances &&
										row.edges === edges &&
										(row.effect ?? 'none') === effect &&
										row.run === run,
								)
							)
								continue
							const page = await context.newPage()
							try {
								await page.goto(
									`${base}/foundation.html?model=${model}&baseline=${Number(baseline)}&instances=${instances}&edges=${Number(edges)}&motion=${Number(motion)}&effect=${effect}`,
									{ waitUntil: 'domcontentloaded' },
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
										(
											window as unknown as {
												foundation: { error: string | null }
											}
										).foundation.error,
								)
								if (error) throw new Error(error)
								await page.waitForTimeout(warmup)
								await page.evaluate(() => {
									;(
										window as unknown as { foundation: { frames: number[] } }
									).foundation.frames = []
									;(
										window as unknown as {
											foundation: { effectUpdateMs: number[] }
										}
									).foundation.effectUpdateMs = []
								})
								await page.waitForTimeout(windowMs)
								const measurements = await page.evaluate(() => {
									const state = (
										window as unknown as { foundation: Record<string, unknown> }
									).foundation
									const gl = document
										.querySelector('canvas')
										?.getContext('webgl2')
									const ext = gl?.getExtension('WEBGL_debug_renderer_info')
									return {
										...state,
										renderer:
											gl && ext
												? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
												: null,
										vendor:
											gl && ext
												? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
												: null,
										heap:
											(
												performance as Performance & {
													memory?: { usedJSHeapSize: number }
												}
											).memory?.usedJSHeapSize ?? null,
									}
								})
								results.push({ ...config, ...measurements })
							} catch (error) {
								results.push({
									...config,
									error: error instanceof Error ? error.message : String(error),
								})
							}
							await page.close()
							await save()
							console.log(
								JSON.stringify({
									...config,
									completed: results.length,
									total:
										models.length *
										(single ? 1 : effectRuns ? 2 : 8) *
										runs *
										effects.length,
								}),
							)
						}
					}
} finally {
	await context.close()
	await browser.close()
	await save()
}
