import { fileURLToPath, URL } from 'node:url'
import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { fumadocsMdx } from 'fumadocs-mdx/vite'
import { defineConfig } from 'vite'
import routerConfig from './react-router.config.js'

export default defineConfig({
	logLevel: 'warn',
	plugins: [
		{
			name: 'prerender-directory-indexes',
			configurePreviewServer(server) {
				const pages = new Set(
					routerConfig.prerender.filter(
						(path) => path !== '/' && path !== '/api/search',
					),
				)
				server.middlewares.use((request, response, next) => {
					const url = new URL(request.url ?? '/', 'http://localhost')
					if (!pages.has(url.pathname)) {
						next()
						return
					}
					response.writeHead(308, { Location: `${url.pathname}/${url.search}` })
					response.end()
				})
			},
		},
		fumadocsMdx({ macro: { include: ['**/source.ts'] } }),
		tailwindcss(),
		reactRouter(),
	],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
