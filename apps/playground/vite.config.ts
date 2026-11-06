import { fileURLToPath, URL } from 'node:url'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { fumadocsMdx } from 'fumadocs-mdx/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	logLevel: 'warn',
	plugins: [
		fumadocsMdx({ macro: { include: ['**/source.ts'] } }),
		tailwindcss(),
		reactRouter(),
	],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
