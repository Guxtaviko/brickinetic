import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const layoutOptions = {
	nav: {
		title: (
			<span className='font-semibold tracking-tight'>
				<span className='text-fd-primary'>Brick</span>inetic
			</span>
		),
		url: '/',
	},
	links: [
		{ text: 'Playground', url: '/playground' },
		{ text: 'Documentation', url: '/docs' },
	],
} satisfies BaseLayoutProps
