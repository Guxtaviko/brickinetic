import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
	cacheDir: fileURLToPath(
		new URL('../node_modules/.vite-fixtures', import.meta.url),
	),
	root: fileURLToPath(new URL('./fixtures', import.meta.url)),
	plugins: [react(), tailwindcss()],
})
