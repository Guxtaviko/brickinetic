import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BrickModel } from 'brickinetic'
import type { ErrorInfo, FormEvent, ReactNode } from 'react'
import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import '@/styles/globals.css'

const preparedModelUrl = '/models/prepared-model.mpd'

type ModelErrorBoundaryProps = {
	children: ReactNode
	onRetry: () => void
	onError: (error: Error) => void
}

type ModelErrorBoundaryState = { error: Error | null }

class ModelErrorBoundary extends Component<
	ModelErrorBoundaryProps,
	ModelErrorBoundaryState
> {
	state: ModelErrorBoundaryState = { error: null }

	static getDerivedStateFromError(error: Error): ModelErrorBoundaryState {
		return { error }
	}

	componentDidCatch(error: Error, _info: ErrorInfo) {
		this.props.onError(error)
	}

	render() {
		if (this.state.error)
			return (
				<div className='absolute inset-0 z-10 flex items-center justify-center gap-5 bg-slate-100 p-8 [&_h2]:font-heading [&_h2]:text-3xl' role='alert'>
					<div className='grid h-11 w-11 shrink-0 place-items-center border border-red-700 font-heading text-2xl text-red-700'>!</div>
					<div>
						<p className='mb-2 font-mono text-xs font-bold tracking-widest text-red-700'>LOAD INTERRUPTED</p>
						<h2>Model unavailable</h2>
						<p className='my-4 max-w-xl break-all font-mono text-xs leading-relaxed text-slate-600'>{this.state.error.message}</p>
						<button
							className='bg-slate-900 px-4 py-3 text-xs font-bold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700'
							onClick={this.props.onRetry}
							type='button'
						>
							Retry this source
						</button>
					</div>
				</div>
			)
		return this.props.children
	}
}

function Controls() {
	const { camera, gl } = useThree()
	const controlsRef = useRef<OrbitControls | null>(null)
	useFrame(() => controlsRef.current?.update())
	useEffect(() => {
		const controls = new OrbitControls(camera, gl.domElement)
		controlsRef.current = controls
		controls.enableDamping = true
		controls.enablePan = false
		controls.minDistance = 180
		controls.maxDistance = 700
		controls.target.set(0, 0, 0)
		controls.update()
		return () => {
			controlsRef.current = null
			controls.dispose()
		}
	}, [camera, gl])
	return null
}

function SuspenseStatus({ onPending }: { onPending: () => void }) {
	useEffect(() => onPending(), [onPending])
	return (
		<mesh position={[0, 0, 0]}>
			<icosahedronGeometry args={[12, 1]} />
			<meshStandardMaterial color='#d34b35' wireframe />
		</mesh>
	)
}

function ModelScene({
	src,
	position,
	rotation,
	scale,
	center,
	edges,
	showSecond,
	onReady,
}: {
	src: string
	position: [number, number, number]
	rotation: [number, number, number]
	scale: number
	center: boolean
	edges: boolean
	showSecond: boolean
	onReady: () => void
}) {
	useEffect(() => onReady(), [onReady, src])
	return (
		<>
			<BrickModel
				center={center}
				edges={edges}
				position={position}
				rotation={rotation}
				scale={scale}
				src={src}
			/>
			{showSecond && (
				<BrickModel
					center={center}
					edges={false}
					position={[140, 0, 0]}
					scale={0.65}
					src={src}
				/>
			)}
		</>
	)
}

function RangeControl({
	label,
	value,
	min,
	max,
	step = 1,
	unit = '',
	onChange,
}: {
	label: string
	value: number
	min: number
	max: number
	step?: number
	unit?: string
	onChange: (value: number) => void
}) {
	return (
		<label className='mt-4 block'>
			<span className='mb-2 flex justify-between font-mono text-xs [&_output]:font-bold [&_output]:text-red-700'>
				<span>{label}</span>
				<output>
					{value.toFixed(step < 1 ? 2 : 0)}
					{unit}
				</output>
			</span>
			<input
				className='block w-full cursor-ew-resize accent-red-700'
				max={max}
				min={min}
				onChange={(event) => onChange(Number(event.target.value))}
				step={step}
				type='range'
				value={value}
			/>
		</label>
	)
}

export default function App() {
	const [src, setSrc] = useState(preparedModelUrl)
	const [srcInput, setSrcInput] = useState(preparedModelUrl)
	const [boundaryKey, setBoundaryKey] = useState(0)
	const [status, setStatus] = useState('Waiting for model')
	const [center, setCenter] = useState(true)
	const [edges, setEdges] = useState(true)
	const [showSecond, setShowSecond] = useState(false)
	const [positionX, setPositionX] = useState(0)
	const [rotationY, setRotationY] = useState(0)
	const [scale, setScale] = useState(1)
	const [errorMessage, setErrorMessage] = useState('')

	const onPending = useCallback(() => setStatus('Loading prepared MPD'), [])

	const onReady = useCallback(() => {
		setErrorMessage('')
		setStatus('Model ready')
	}, [])

	const onError = useCallback((error: Error) => {
		setErrorMessage(error.message)
		setStatus('Load failed')
	}, [])

	const retry = useCallback(() => {
		setStatus('Retrying model')
		setBoundaryKey((key) => key + 1)
	}, [])

	const submitSource = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const nextSource = srcInput.trim()
		if (!nextSource) return
		setStatus('Loading model source')
		setErrorMessage('')
		setSrc(nextSource)
		setBoundaryKey((key) => key + 1)
	}

	return (
		<main className='min-h-dvh bg-slate-200 px-5 pb-6 font-body text-slate-900 sm:px-10 lg:px-16'>
			<header className='mx-auto flex min-h-18 max-w-screen-2xl items-center justify-between border-b border-slate-900/20 font-mono text-xs font-bold tracking-widest'>
				<a className='inline-flex items-center gap-3 no-underline focus-visible:outline-2 focus-visible:outline-red-700' href='/' aria-label='Brickinetic home'>
					<span className='grid h-8 w-8 place-items-center bg-red-700 text-base font-black tracking-normal text-white' aria-hidden='true'>
						B
					</span>
					<span>BRICKINETIC</span>
				</a>
				<p className='hidden text-slate-500 sm:block [&_span]:text-red-700'>
					RENDERING FOUNDATION <span>·</span> MILESTONE 01
				</p>
			</header>

			<section className='mx-auto flex max-w-screen-2xl flex-col gap-4 pt-10 pb-7 md:flex-row md:items-end md:justify-between md:pt-16 [&_h1]:font-heading [&_h1]:text-5xl [&_h1]:leading-none [&_h1]:tracking-tight md:[&_h1]:text-7xl [&_em]:text-red-700'>
				<div>
					<p className='mb-2 font-mono text-xs font-bold tracking-widest text-red-700'>A SMALL COMPONENT. A WHOLE MODEL.</p>
					<h1>
						Model <em>in</em> motion.
					</h1>
				</div>
				<p className='max-w-sm text-sm leading-relaxed text-slate-600'>
					A consumer-owned Canvas, an embedded MPD, and a few props. Orbit the
					model; change one value at a time.
				</p>
			</section>

			<div className='mx-auto grid max-w-screen-2xl border border-slate-400 bg-slate-100 shadow-xl shadow-slate-900/10 md:grid-cols-[minmax(0,1fr)_300px]'>
				<section className='min-w-0 p-4' aria-label='Live model viewport'>
					<div className='flex justify-between gap-4 pb-3 font-mono text-xs font-semibold tracking-wide text-slate-500 [&_b]:text-red-700 [&_i]:text-red-700'>
						<span>
							<b>01</b> / LIVE VIEWPORT
						</span>
						<span>
							DRAG TO ORBIT <i>·</i> SCROLL TO ZOOM
						</span>
					</div>
					<div className='relative h-[min(112vw,530px)] min-h-85 overflow-hidden border border-slate-300 bg-slate-200 md:h-125 lg:h-150'>
						<div className='absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-slate-400' aria-hidden='true'>
							+
						</div>
						<ModelErrorBoundary
							key={boundaryKey}
							onError={onError}
							onRetry={retry}
						>
							<Canvas
								camera={{
									fov: 38,
									far: 2000,
									near: 1,
									position: [250, 175, 310],
								}}
							>
								<color attach='background' args={['#e2e8f0']} />
								<ambientLight intensity={1.6} />
								<directionalLight intensity={2.3} position={[120, 230, 160]} />
								<Controls />
								<Suspense fallback={<SuspenseStatus onPending={onPending} />}>
									<ModelScene
										center={center}
										edges={edges}
										onReady={onReady}
										position={[positionX, 0, 0]}
										rotation={[0, (rotationY * Math.PI) / 180, 0]}
										scale={scale}
										showSecond={showSecond}
										src={src}
									/>
								</Suspense>
							</Canvas>
						</ModelErrorBoundary>
						<div
							className='absolute bottom-4 left-4 z-10 inline-flex items-center gap-2 border border-slate-900/20 bg-slate-100/95 px-3 py-2 font-mono text-xs font-semibold'
							data-testid='model-status'
							data-status={status.toLowerCase().replaceAll(' ', '-')}
						>
							<span
								className={
									status === 'Model ready'
										? 'h-2 w-2 rounded-full bg-emerald-600'
										: 'h-2 w-2 rounded-full bg-amber-500'
								}
							/>
							{status}
						</div>
					</div>
					<div className='flex flex-wrap justify-between gap-2 pt-3 font-mono text-xs text-slate-500 [&_b]:text-slate-900 [&_i]:text-red-700'>
						<span>
							SPECIMEN <b>1477 / RED DEVIL RACER</b>
						</span>
						<span>
							LDRAW MPD <i>·</i> SELF-CONTAINED
						</span>
					</div>
				</section>

				<aside className='flex min-w-0 flex-col border-t border-slate-300 px-5 pt-5 md:border-t-0 md:border-l' aria-label='Model controls'>
					<div className='flex justify-between border-b border-slate-300 pb-4 [&_h2]:font-heading [&_h2]:text-2xl'>
						<div>
							<p className='mb-2 font-mono text-xs font-bold tracking-widest text-red-700'>CONSUMER INPUT</p>
							<h2>Model setup</h2>
						</div>
						<span className='font-mono text-xs text-slate-400'>01—04</span>
					</div>

					<form className='border-b border-slate-300 py-4 [&>label]:mb-2 [&>label]:block [&>label]:font-mono [&>label]:text-xs [&>label]:font-bold [&>p]:mt-2 [&>p]:text-xs [&>p]:text-slate-500 [&_input]:min-w-0 [&_input]:w-full [&_input]:bg-transparent [&_input]:p-2 [&_input]:font-mono [&_input]:text-xs [&_input]:outline-none' onSubmit={submitSource}>
						<label htmlFor='model-source'>Source URL</label>
						<div className='flex border border-slate-400 bg-slate-50 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-red-700'>
							<input
								id='model-source'
								data-testid='model-source'
								onChange={(event) => setSrcInput(event.target.value)}
								value={srcInput}
							/>
							<button
								className='w-10 shrink-0 cursor-pointer bg-slate-900 text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700'
								type='submit'
								aria-label='Load source'
							>
								↗
							</button>
						</div>
						<p>Use an MPD with all geometry embedded.</p>
					</form>

					<div className='border-b border-slate-300 py-4'>
						<div className='flex items-baseline gap-2 font-mono text-xs font-bold [&_span]:text-red-700'>
							<span>02</span>
							<h3>Transform</h3>
						</div>
						<RangeControl
							label='Position X'
							min={-80}
							max={80}
							onChange={setPositionX}
							value={positionX}
							unit=' LU'
						/>
						<RangeControl
							label='Rotation Y'
							min={-180}
							max={180}
							onChange={setRotationY}
							value={rotationY}
							unit='°'
						/>
						<RangeControl
							label='Uniform scale'
							min={0.5}
							max={2}
							onChange={setScale}
							step={0.05}
							value={scale}
							unit='×'
						/>
					</div>

					<div className='border-b border-slate-300 py-4'>
						<div className='flex items-baseline gap-2 font-mono text-xs font-bold [&_span]:text-red-700'>
							<span>03</span>
							<h3>Display</h3>
						</div>
						<label className='flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1 [&_span]:grid [&_b]:font-mono [&_b]:text-xs [&_small]:text-xs [&_small]:text-slate-500 [&_input]:h-4 [&_input]:w-4 [&_input]:accent-red-700 [&_i]:hidden'>
							<span>
								<b>Center bounds</b>
								<small>Oriented model center → origin</small>
							</span>
							<input
								checked={center}
								onChange={(event) => setCenter(event.target.checked)}
								type='checkbox'
							/>
							<i />
						</label>
						<label className='flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1 [&_span]:grid [&_b]:font-mono [&_b]:text-xs [&_small]:text-xs [&_small]:text-slate-500 [&_input]:h-4 [&_input]:w-4 [&_input]:accent-red-700 [&_i]:hidden'>
							<span>
								<b>Edge lines</b>
								<small>Ordinary + conditional edges</small>
							</span>
							<input
								checked={edges}
								onChange={(event) => setEdges(event.target.checked)}
								type='checkbox'
							/>
							<i />
						</label>
						<label className='flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1 [&_span]:grid [&_b]:font-mono [&_b]:text-xs [&_small]:text-xs [&_small]:text-slate-500 [&_input]:h-4 [&_input]:w-4 [&_input]:accent-red-700 [&_i]:hidden'>
							<span>
								<b>Second instance</b>
								<small>Independent · edges off</small>
							</span>
							<input
								checked={showSecond}
								onChange={(event) => setShowSecond(event.target.checked)}
								type='checkbox'
							/>
							<i />
						</label>
					</div>

					<div className='mt-auto flex items-center gap-3 py-4 text-xs leading-relaxed text-slate-500'>
						<div className='grid h-9 w-11 place-items-center bg-slate-200 font-mono text-xs [&_b]:text-slate-900'>
							R3F <b>9</b>
						</div>
						<p>
							Canvas and recovery stay
							<br />
							in the consumer's hands.
						</p>
					</div>
				</aside>
			</div>

			<section className='mx-auto mt-4 grid max-w-screen-2xl gap-4 border border-slate-700 bg-slate-900 p-5 text-slate-100 md:grid-cols-[130px_minmax(0,1fr)_minmax(150px,0.6fr)] md:items-center [&_pre]:overflow-x-auto [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-relaxed [&>p]:text-sm [&>p]:leading-relaxed [&>p]:text-slate-400' aria-label='Consumer code example'>
				<div className='grid gap-1 font-mono text-xs tracking-widest text-slate-400'>
					<span className='mb-2 font-mono text-xs font-bold tracking-widest text-red-700'>04 / PUBLIC API</span>
					<span>OWN YOUR SCENE</span>
				</div>
				<pre>
					<code>
						<span className='text-red-300'>&lt;Canvas&gt;</span>
						{'\n  '}
						<span className='text-red-300'>
							&lt;Suspense fallback=&#123;null&#125;&gt;
						</span>
						{'\n    '}
						<span className='text-red-300'>&lt;BrickModel</span>
						{' src="/models/ship.mpd" center edges '}
						<span className='text-red-300'>/&gt;</span>
						{'\n  '}
						<span className='text-red-300'>&lt;/Suspense&gt;</span>
						{'\n'}
						<span className='text-red-300'>&lt;/Canvas&gt;</span>
					</code>
				</pre>
				<p>
					Loading suspends. Failures reach the nearest error boundary with the
					source URL.
				</p>
			</section>

			<footer className='mx-auto flex max-w-screen-2xl flex-wrap justify-between gap-4 pt-5 font-mono text-xs tracking-widest text-slate-500 [&_b]:text-red-700'>
				<span>
					BRICKINETIC <b>·</b> M1
				</span>
				<span data-testid='error-message'>{errorMessage}</span>
			</footer>
		</main>
	)
}
