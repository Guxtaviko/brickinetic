import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
	index('home.tsx'),
	route('playground', 'playground.tsx'),
	route('docs/*', 'docs.tsx'),
	route('api/search', 'search.ts'),
] satisfies RouteConfig
