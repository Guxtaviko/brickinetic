import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	build: {
		rollupOptions: {
			input: {
				main: fileURLToPath(new URL('./index.html', import.meta.url)),
				foundation: fileURLToPath(
					new URL('./foundation.html', import.meta.url),
				),
			},
		},
	},
	resolve: {
		alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
	},
})
