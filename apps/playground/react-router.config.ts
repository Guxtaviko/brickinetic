import type { Config } from '@react-router/dev/config'

export default {
	appDirectory: 'src/site',
	buildDirectory: 'dist',
	ssr: false,
	prerender: [
		'/',
		'/playground',
		'/docs',
		'/docs/effects',
		'/docs/controllers',
		'/docs/resources',
		'/docs/api',
		'/api/search',
	],
} satisfies Config
