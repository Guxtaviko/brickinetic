import { HomeLayout } from 'fumadocs-ui/layouts/home'
import { Link } from 'react-router'
import { ClientPlayground } from './client-playground'
import { QuickstartExample } from './example'
import { layoutOptions } from './shared'

export const meta = () => [
	{ title: 'Brickinetic · LDraw models in React' },
	{
		name: 'description',
		content:
			'Render and animate LDraw models with React Three Fiber. Try assembly, explosion and deterministic effects.',
	},
]
export default function Home() {
	return (
		<HomeLayout {...layoutOptions}>
			<div id='content' className='mx-auto w-full max-w-7xl px-5 py-12 sm:px-8'>
				<div className='mb-8 max-w-2xl'>
					<h1 className='text-balance text-4xl font-semibold tracking-tight sm:text-5xl'>
						LDraw models, set in motion.
					</h1>
					<p className='mt-4 text-lg text-fd-muted-foreground'>
						Render bricks with React Three Fiber. Build an assembly, pull it
						apart, or seek to any moment.
					</p>
					<div className='mt-6 flex flex-wrap gap-3'>
						<Link
							className='rounded-lg bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground'
							to='/playground'
						>
							Open playground
						</Link>
						<Link
							className='rounded-lg border px-4 py-2 text-sm font-medium'
							to='/docs'
						>
							Read the guide
						</Link>
					</div>
				</div>
				<div className='home-preview overflow-hidden rounded-xl border'>
					<ClientPlayground />
				</div>
				<section className='mt-12 max-w-3xl'>
					<h2 className='mb-4 text-2xl font-semibold tracking-tight'>
						Start with your Canvas
					</h2>
					<QuickstartExample />
					<p className='mt-4 text-fd-muted-foreground'>
						You own the scene, camera, lighting and render loop. Brickinetic
						handles the LDraw model and its effects.
					</p>
				</section>
				<p className='mt-8 text-sm text-fd-muted-foreground'>
					<a className='underline underline-offset-4' href='/models/README.md'>
						Model provenance and licenses
					</a>
				</p>
			</div>
		</HomeLayout>
	)
}
