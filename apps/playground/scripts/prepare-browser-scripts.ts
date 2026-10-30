import { readFile, writeFile } from 'node:fs/promises'
import { Script } from 'node:vm'

// Playwright CLI wraps run-code files in parentheses. Remove only the known
// wrappers emitted by tsconfig.browser-scripts.json, then validate that shape.
for (const name of ['verify-browser', 'verify-model-loading']) {
	const output = new URL(`./${name}.js`, import.meta.url)
	const compiled = await readFile(output, 'utf8')
	const expression = compiled
		.trim()
		.replace(/^"use strict";\s*/, '')
		.replace(/^;\s*/, '')
		.replace(/;$/, '')
	if (!/^async\s*\(page\)\s*=>\s*\{/.test(expression)) {
		throw new Error(`${name} must contain one Playwright function expression`)
	}
	// Parse without executing the verification function or initializing a browser.
	new Script(`(${expression})`, { filename: `${name}.js` })
	await writeFile(output, `${expression}\n`)
}
