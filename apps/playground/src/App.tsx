import { Canvas, useThree } from '@react-three/fiber'
import { BrickModel } from 'brickinetic'
import type { ErrorInfo, FormEvent, ReactNode } from 'react'
import { Component, Suspense, useCallback, useEffect, useState } from 'react'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import '@/styles/m1.css'

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
				<div className='m1-error' role='alert'>
					<div className='m1-error__mark'>!</div>
					<div>
						<p className='m1-eyebrow'>LOAD INTERRUPTED</p>
						<h2>Model unavailable</h2>
						<p className='m1-error__message'>{this.state.error.message}</p>
						<button
							className='m1-button m1-button--dark'
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
	useEffect(() => {
		const controls = new OrbitControls(camera, gl.domElement)
		controls.enableDamping = true
		controls.enablePan = false
		controls.minDistance = 180
		controls.maxDistance = 700
		controls.target.set(50, 0, 0)
		return () => controls.dispose()
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
		<label className='m1-range'>
			<span className='m1-range__heading'>
				<span>{label}</span>
				<output>
					{value.toFixed(step < 1 ? 2 : 0)}
					{unit}
				</output>
			</span>
			<input
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
		<main className='m1-page'>
			<header className='m1-header'>
				<a className='m1-brand' href='/' aria-label='Brickinetic home'>
					<span className='m1-brand__cube' aria-hidden='true'>
						B
					</span>
					<span>BRICKINETIC</span>
				</a>
				<p className='m1-header__issue'>
					RENDERING FOUNDATION <span>·</span> MILESTONE 01
				</p>
			</header>

			<section className='m1-intro'>
				<div>
					<p className='m1-eyebrow'>A SMALL COMPONENT. A WHOLE MODEL.</p>
					<h1>
						Model <em>in</em> motion.
					</h1>
				</div>
				<p className='m1-intro__note'>
					A consumer-owned Canvas, an embedded MPD, and a few props. Orbit the
					model; change one value at a time.
				</p>
			</section>

			<div className='m1-workbench'>
				<section className='m1-viewport' aria-label='Live model viewport'>
					<div className='m1-viewport__topline'>
						<span>
							<b>01</b> / LIVE VIEWPORT
						</span>
						<span>
							DRAG TO ORBIT <i>·</i> SCROLL TO ZOOM
						</span>
					</div>
					<div className='m1-canvas'>
						<div className='m1-crosshair' aria-hidden='true'>
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
								<color attach='background' args={['#e9e7df']} />
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
							className='m1-viewport__badge'
							data-testid='model-status'
							data-status={status.toLowerCase().replaceAll(' ', '-')}
						>
							<span
								className={
									status === 'Model ready' ? 'm1-led m1-led--ready' : 'm1-led'
								}
							/>
							{status}
						</div>
					</div>
					<div className='m1-viewport__caption'>
						<span>
							SPECIMEN <b>1477 / RED DEVIL RACER</b>
						</span>
						<span>
							LDRAW MPD <i>·</i> SELF-CONTAINED
						</span>
					</div>
				</section>

				<aside className='m1-panel' aria-label='Model controls'>
					<div className='m1-panel__heading'>
						<div>
							<p className='m1-eyebrow'>CONSUMER INPUT</p>
							<h2>Model setup</h2>
						</div>
						<span className='m1-panel__index'>01—04</span>
					</div>

					<form className='m1-source' onSubmit={submitSource}>
						<label htmlFor='model-source'>Source URL</label>
						<div className='m1-source__row'>
							<input
								id='model-source'
								data-testid='model-source'
								onChange={(event) => setSrcInput(event.target.value)}
								value={srcInput}
							/>
							<button
								className='m1-load'
								type='submit'
								aria-label='Load source'
							>
								↗
							</button>
						</div>
						<p>Use an MPD with all geometry embedded.</p>
					</form>

					<div className='m1-control-section'>
						<div className='m1-section-label'>
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

					<div className='m1-control-section m1-options'>
						<div className='m1-section-label'>
							<span>03</span>
							<h3>Display</h3>
						</div>
						<label className='m1-toggle'>
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
						<label className='m1-toggle'>
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
						<label className='m1-toggle'>
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

					<div className='m1-panel__foot'>
						<div className='m1-panel__footmark'>
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

			<section className='m1-code' aria-label='Consumer code example'>
				<div className='m1-code__label'>
					<span className='m1-eyebrow'>04 / PUBLIC API</span>
					<span>OWN YOUR SCENE</span>
				</div>
				<pre>
					<code>
						<span className='m1-token'>&lt;Canvas&gt;</span>
						{'\n  '}
						<span className='m1-token'>
							&lt;Suspense fallback=&#123;null&#125;&gt;
						</span>
						{'\n    '}
						<span className='m1-token'>&lt;BrickModel</span>
						{' src="/models/ship.mpd" center edges '}
						<span className='m1-token'>/&gt;</span>
						{'\n  '}
						<span className='m1-token'>&lt;/Suspense&gt;</span>
						{'\n'}
						<span className='m1-token'>&lt;/Canvas&gt;</span>
					</code>
				</pre>
				<p>
					Loading suspends. Failures reach the nearest error boundary with the
					source URL.
				</p>
			</section>

			<footer className='m1-footer'>
				<span>
					BRICKINETIC <b>·</b> M1
				</span>
				<span data-testid='error-message'>{errorMessage}</span>
			</footer>
		</main>
	)
}
