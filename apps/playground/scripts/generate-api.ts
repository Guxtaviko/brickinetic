import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createGenerator } from 'fumadocs-typescript'

const generator = createGenerator({
	tsconfigPath: resolve('../../packages/brickinetic/tsconfig.build.json'),
})
const declarations = [
	['BrickModel.tsx', 'BrickModelProps'],
	['brick-effects.ts', 'BrickEffectConfig'],
	['brick-effects.ts', 'BrickEffectController'],
	['playback.ts', 'EffectPlaybackConfig'],
	['motion.ts', 'MotionConfig'],
	['motion.ts', 'FloatMotion'],
	['motion.ts', 'SpinMotion'],
] as const
let markdown =
	'---\ntitle: API reference\ndescription: Generated from the checked TypeScript source at build time.\n---\n\nThese tables are generated from public TypeScript declarations. See the guides for defaults, validation and lifecycle behavior.\n\n'
for (const [file, name] of declarations) {
	const docs = await generator.generateDocumentation(
		{ path: resolve('../../packages/brickinetic/src', file) },
		name,
	)
	if (docs.length === 0)
		throw new Error(`No API documentation generated for ${name}`)
	markdown += `## ${name}\n\n| Property | Type | Required |\n| --- | --- | --- |\n`
	for (const doc of docs)
		for (const entry of doc.entries)
			markdown += `| \`${entry.name}\` | \`${entry.type.replaceAll('|', '\\|').replaceAll('`', '').replaceAll('\n', ' ')}\` | ${entry.required ? 'Yes' : 'No'} |\n`
	markdown += '\n'
}
markdown +=
	'## BrickEffectEasing\n\n`linear`, `smoothstep`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, or a readonly cubic tuple `[x1, y1, x2, y2]`. All coordinates must be finite; X coordinates are in [0, 1].\n'
await mkdir('content/docs', { recursive: true })
await writeFile('content/docs/api.mdx', markdown)
console.log('Generated public TypeScript API tables.')
