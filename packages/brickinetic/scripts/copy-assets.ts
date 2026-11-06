import { cpSync, mkdirSync } from 'node:fs'

mkdirSync(new URL('../dist/assets/', import.meta.url), { recursive: true })
cpSync(
	new URL('../assets/', import.meta.url),
	new URL('../dist/assets/', import.meta.url),
	{
		recursive: true,
	},
)
