import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import {
	createModelConfig,
	defaultSettings,
	formatModelCode,
} from '../../src/playground-config.js'

test('showcase defaults and disabled effects serialize without redundant forms', () => {
	const config = createModelConfig(defaultSettings)
	assert.equal(config.src, '/models/car.mpd')
	assert.equal(config.motion?.float, undefined)
	assert.ok(config.motion?.spin)
	assert.equal(config.effect?.type, 'assembly')
	assert.deepEqual(config.effect?.playback, {
		duration: 3,
		direction: 'forward',
		hold: 3,
		repeat: true,
		paused: false,
	})
	assert.equal(config.effect?.randomness, 0.2)
	assert.equal(config.effect?.seed, 0)
	const disabled = createModelConfig({
		...defaultSettings,
		effectType: 'none',
		spinEnabled: false,
	})
	assert.equal('effect' in disabled, false)
	assert.equal('motion' in disabled, false)
	assert.deepEqual(JSON.parse(JSON.stringify(config)), config)
})

test('manual configuration retains captured progress and absolute distance exclusivity', () => {
	const config = createModelConfig({
		...defaultSettings,
		mode: 'manual',
		progress: 0.3712345,
		effectType: 'explosion',
		relativeDistance: false,
		positionX: 12,
		rotationY: 90,
		scale: 1.5,
		center: false,
		edges: false,
	})
	assert.equal(config.effect?.progress, 0.3712345)
	assert.equal(config.effect?.playback, undefined)
	assert.deepEqual(config.position, [12, 0, 0])
	assert.deepEqual(config.rotation, [0, Math.PI / 2, 0])
	assert.equal(
		config.effect?.type === 'explosion' && config.effect.distanceMultiplier,
		undefined,
	)
	assert.equal(config.center, false)
	assert.equal(config.edges, false)
})

test('generated scenes typecheck against the source public API for representative configurations', async () => {
	const directory = await mkdtemp(
		resolve('node_modules/.tmp/generated-examples-'),
	)
	try {
		const cases = [
			defaultSettings,
			{
				...defaultSettings,
				mode: 'manual' as const,
				progress: 0.37,
				effectType: 'explosion' as const,
				easing: [0.1, -2, 0.8, 3] as const,
			},
			{ ...defaultSettings, effectType: 'none' as const, spinEnabled: false },
			{
				...defaultSettings,
				modelId: 'spaceship',
				effectType: 'explosion' as const,
				relativeDistance: false,
				floatEnabled: true,
				rotationY: 45,
				edges: false,
			},
		]
		const files: string[] = []
		for (const [index, settings] of cases.entries()) {
			const file = resolve(directory, `scene-${index}.tsx`)
			await writeFile(file, formatModelCode(createModelConfig(settings)))
			files.push(file)
		}
		const tsconfig = resolve(directory, 'tsconfig.json')
		await writeFile(
			tsconfig,
			JSON.stringify({
				compilerOptions: {
					target: 'es2023',
					lib: ['ES2023', 'DOM'],
					module: 'esnext',
					moduleResolution: 'bundler',
					jsx: 'react-jsx',
					strict: true,
					skipLibCheck: true,
					noEmit: true,
					paths: {
						brickinetic: [resolve('../../packages/brickinetic/src/index.ts')],
					},
				},
				files,
			}),
		)
		const result = spawnSync('pnpm', ['exec', 'tsc', '-p', tsconfig], {
			encoding: 'utf8',
		})
		assert.equal(result.status, 0, result.stdout + result.stderr)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})
