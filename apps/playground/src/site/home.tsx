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
			<div
				id='content'
				className='mx-auto w-full max-w-7xl px-5 py-10 sm:px-8 lg:py-12'
			>
				<div className='grid items-start gap-8 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] lg:gap-x-10'>
					<div className='max-w-xl lg:col-start-1 lg:row-start-1'>
						<h1 className='text-balance text-4xl font-semibold tracking-tight sm:text-5xl'>
							LDraw models, set in motion.
						</h1>
						<p className='mt-4 text-lg leading-relaxed text-fd-muted-foreground'>
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
					<div className='min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1'>
						<ClientPlayground compact />
					</div>
					<section className='min-w-0 lg:col-start-1 lg:row-start-2'>
						<h2 className='mb-4 text-xl font-semibold tracking-tight'>
							Start with your Canvas
						</h2>
						<QuickstartExample />
						<p className='mt-4 text-sm leading-relaxed text-fd-muted-foreground'>
							You own the scene, camera, lighting and render loop. Brickinetic
							handles the model and its effects.
						</p>
					</section>
				</div>
			</div>
		</HomeLayout>
	)
}
