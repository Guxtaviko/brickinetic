import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
	type AssemblyConfig,
	type BrickEffectController,
	BrickModel,
	createBrickEffectController,
	type ExplosionConfig,
	type MotionConfig,
} from 'brickinetic'
import {
	Component,
	type ReactNode,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { Box3, type Group, PerspectiveCamera, Sphere, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import '@/styles/globals.css'

const models = [
	{
		id: 'car',
		label: 'Car',
		complexity: 'Minimal',
		set: '1477',
		title: 'Red Devil Racer',
	},
	{
		id: 'speedboat',
		label: 'Speedboat',
		complexity: 'Medium',
		set: '31039',
		title: 'Speedboat',
	},
	{
		id: 'spaceship',
		label: 'Spaceship',
		complexity: 'Complex',
		set: '70816',
		title: 'Benny’s Spaceship',
	},
] as const

type Axis = 'x' | 'y' | 'z'
type Loop = 'always' | 'demand' | 'never'

class ModelErrorBoundary extends Component<
	{
		children: ReactNode
		retry: () => void
		onError: (message: string) => void
	},
	{ error: Error | null }
> {
	state: { error: Error | null } = { error: null }
	static getDerivedStateFromError(error: Error) {
		return { error }
	}
	componentDidCatch(error: Error) {
		this.props.onError(error.message)
	}
	render() {
		if (this.state.error)
			return (
				<div className='load-error' role='alert'>
					<span className='eyebrow'>LOAD INTERRUPTED</span>
					<h2>Model unavailable</h2>
					<p>{this.state.error.message}</p>
					<button onClick={this.props.retry} type='button'>
						Retry model
					</button>
				</div>
			)
		return this.props.children
	}
}

function Loading({ onPending }: { onPending: () => void }) {
	useEffect(onPending, [onPending])
	return null
}

function SimulatedLoadingFailure(): never {
	throw new Error(
		'Simulated loading failure. Turn off the test to load this model.',
	)
}

function ModelScene({
	src,
	center,
	edges,
	xyzPreview,
	motion,
	explosion,
	assembly,
	effectController,
	driveEffect,
	positionX,
	rotationY,
	scale,
	onReady,
}: {
	src: string
	center: boolean
	edges: boolean
	xyzPreview: boolean
	motion: MotionConfig
	explosion?: ExplosionConfig
	assembly?: AssemblyConfig
	effectController: BrickEffectController
	driveEffect: boolean
	positionX: number
	rotationY: number
	scale: number
	onReady: () => void
}) {
	const primary = useRef<Group>(null)
	const { camera, gl, invalidate, frameloop, size } = useThree()
	const controlsRef = useRef<OrbitControls | null>(null)
	const [guideSize, setGuideSize] = useState(30)
	const effectPhase = useRef(0)
	useFrame((_, delta) => {
		if (!driveEffect) return
		effectPhase.current = (effectPhase.current + delta * 0.25) % 1
		effectController.setProgress(effectPhase.current)
	})
	useLayoutEffect(() => {
		const controls = new OrbitControls(camera, gl.domElement)
		controlsRef.current = controls
		controls.enablePan = false
		const change = () => invalidate()
		controls.addEventListener('change', change)
		return () => {
			controls.removeEventListener('change', change)
			controls.dispose()
			controlsRef.current = null
		}
	}, [camera, gl, invalidate])
	useEffect(() => {
		if (controlsRef.current)
			controlsRef.current.enableDamping = frameloop === 'always'
	}, [frameloop])
	useFrame(() => controlsRef.current?.update())
	useLayoutEffect(() => {
		const controls = controlsRef.current
		if (!controls || !primary.current || !(camera instanceof PerspectiveCamera))
			return
		const bounds = new Box3().setFromObject(primary.current)
		const sphere = bounds.getBoundingSphere(new Sphere())
		const radius = Math.max(sphere.radius, 1)
		const vertical = (camera.fov * Math.PI) / 360
		const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
		const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.2
		camera.position
			.copy(sphere.center)
			.add(new Vector3(1, 0.65, 1.3).normalize().multiplyScalar(distance))
		camera.near = Math.max(radius / 1000, 0.01)
		camera.far = distance + radius * 30
		camera.updateProjectionMatrix()
		controls.target.copy(sphere.center)
		controls.minDistance = radius * 0.25
		controls.maxDistance = distance * 5
		controls.update()
		setGuideSize((sphere.radius * 0.75) / scale)
		invalidate()
		onReady()
		// Transform sliders intentionally do not reset a user's orbit on every edit.
	}, [src, center, camera, invalidate, onReady, size.width, size.height])
	const rotation: [number, number, number] = [0, (rotationY * Math.PI) / 180, 0]
	return (
		<>
			<group ref={primary} name='inspection-primary'>
				<BrickModel
					src={src}
					center={center}
					edges={edges}
					motion={motion}
					explosion={explosion}
					assembly={assembly}
					position={[positionX, 0, 0]}
					rotation={rotation}
					scale={scale}
				/>
			</group>
			{xyzPreview && (
				<group
					name='xyz-preview'
					position={[positionX, 0, 0]}
					rotation={rotation}
					scale={scale}
				>
					<axesHelper args={[guideSize]} />
				</group>
			)}
		</>
	)
}

function Slider({
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
		<label className='slider'>
			<span>
				{label}
				<output>
					{value.toFixed(step < 1 ? 2 : 0)}
					{unit}
				</output>
			</span>
			<input
				aria-label={label}
				type='range'
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(e) => onChange(Number(e.target.value))}
			/>
		</label>
	)
}

function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
}) {
	return (
		<label className='toggle'>
			<span>{label}</span>
			<input
				type='checkbox'
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
			/>
		</label>
	)
}

function AxisSelect({
	label,
	value,
	onChange,
}: {
	label: string
	value: Axis
	onChange: (value: Axis) => void
}) {
	return (
		<label className='select-row'>
			<span>{label}</span>
			<select
				aria-label={label}
				value={value}
				onChange={(e) => onChange(e.target.value as Axis)}
			>
				{(['x', 'y', 'z'] as const).map((axis) => (
					<option key={axis} value={axis}>
						{axis.toUpperCase()}
					</option>
				))}
			</select>
		</label>
	)
}

export default function App() {
	const [modelId, setModelId] = useState<string>('car')
	const model = models.find((item) => item.id === modelId) ?? models[0]
	const src = `/models/${model.id}.mpd`
	const [attempt, setAttempt] = useState(0)
	const [status, setStatus] = useState('Loading model and parts')
	const [center, setCenter] = useState(true)
	const [edges, setEdges] = useState(true)
	const [xyzPreview, setXyzPreview] = useState(true)
	const [effect, setEffect] = useState<'none' | 'explosion' | 'assembly'>(
		'none',
	)
	const [effectProgress, setEffectProgress] = useState(0)
	const [relativeDistance, setRelativeDistance] = useState(true)
	const [explosionDistance, setExplosionDistance] = useState(24)
	const [explosionMultiplier, setExplosionMultiplier] = useState(1)
	const [controllerSource, setControllerSource] = useState(false)
	const [driveEffect, setDriveEffect] = useState(false)
	const effectController = useMemo(() => createBrickEffectController(), [])
	const explosion = useMemo<ExplosionConfig | undefined>(
		() =>
			effect === 'explosion'
				? controllerSource
					? {
							controller: effectController,
							...(relativeDistance
								? { distanceMultiplier: explosionMultiplier }
								: { distance: explosionDistance }),
						}
					: {
							progress: effectProgress,
							...(relativeDistance
								? { distanceMultiplier: explosionMultiplier }
								: { distance: explosionDistance }),
						}
				: undefined,
		[
			effect,
			controllerSource,
			effectController,
			effectProgress,
			relativeDistance,
			explosionMultiplier,
			explosionDistance,
		],
	)
	const assembly = useMemo<AssemblyConfig | undefined>(
		() =>
			effect === 'assembly'
				? controllerSource
					? {
							controller: effectController,
							entrance: 'translate',
							offset: [0, 28, 0],
							easing: 'smoothstep',
						}
					: {
							progress: effectProgress,
							entrance: 'translate',
							offset: [0, 28, 0],
							easing: 'smoothstep',
						}
				: undefined,
		[effect, controllerSource, effectController, effectProgress],
	)
	useEffect(
		() => effectController.setProgress(effectProgress),
		[effectController, effectProgress],
	)
	const [floatEnabled, setFloatEnabled] = useState(true)
	const [spinEnabled, setSpinEnabled] = useState(true)
	const [floatAxis, setFloatAxis] = useState<Axis>('y')
	const [spinAxis, setSpinAxis] = useState<Axis>('y')
	const [amplitude, setAmplitude] = useState(5)
	const [floatSpeed, setFloatSpeed] = useState(0.8)
	const [spinSpeed, setSpinSpeed] = useState(0.2)
	const [reducedMotion, setReducedMotion] =
		useState<MotionConfig['reducedMotion']>('system')
	const [frameloop, setFrameloop] = useState<Loop>('always')
	const [positionX, setPositionX] = useState(0)
	const [rotationY, setRotationY] = useState(0)
	const [scale, setScale] = useState(1)
	const [simulateFailure, setSimulateFailure] = useState(false)
	const step = useRef<(() => void) | null>(null)
	const motion = useMemo<MotionConfig>(
		() => ({
			float: {
				enabled: floatEnabled,
				axis: floatAxis,
				amplitude,
				speed: floatSpeed,
			},
			spin: { enabled: spinEnabled, axis: spinAxis, speed: spinSpeed },
			reducedMotion,
		}),
		[
			floatEnabled,
			floatAxis,
			amplitude,
			floatSpeed,
			spinEnabled,
			spinAxis,
			spinSpeed,
			reducedMotion,
		],
	)
	const pending = useCallback(() => {
		setStatus('Loading model and parts')
	}, [])
	const ready = useCallback(() => {
		setStatus('Model ready')
	}, [])
	const failed = useCallback(() => {
		setStatus('Load failed')
	}, [])
	const retry = () => {
		pending()
		setSimulateFailure(false)
		setAttempt((value) => value + 1)
	}

	return (
		<main>
			<header className='site-header'>
				<a href='/' aria-label='Brickinetic home'>
					<b className='brand-mark'>B</b> BRICKINETIC
				</a>
				<span>LDRAW / REACT THREE FIBER</span>
			</header>
			<section className='intro'>
				<div>
					<p className='eyebrow'>REAL BRICKS. A FEW PROPS.</p>
					<h1>
						Model <em>in</em> motion.
					</h1>
				</div>
				<p>Pick a model. Give it a little motion.</p>
			</section>
			<div className='workspace'>
				<section className='viewer' aria-label='Live model viewport'>
					<div className='viewer-heading'>
						<span>
							<b>01</b> / LIVE VIEWPORT
						</span>
						<span>DRAG TO ORBIT · SCROLL TO ZOOM</span>
					</div>
					<div className='canvas-shell'>
						<ModelErrorBoundary
							key={`${model.id}-${attempt}-${simulateFailure}`}
							retry={retry}
							onError={failed}
						>
							<Canvas
								frameloop={frameloop}
								camera={{ fov: 38, position: [250, 175, 310] }}
								onCreated={(state) => {
									step.current = () =>
										state.advance(state.clock.elapsedTime + 1 / 60, true)
								}}
							>
								<color attach='background' args={['#e2e8f0']} />
								<ambientLight intensity={1.6} />
								<directionalLight intensity={2.3} position={[120, 230, 160]} />
								<Suspense fallback={<Loading onPending={pending} />}>
									{simulateFailure ? (
										<SimulatedLoadingFailure />
									) : (
										<ModelScene
											src={src}
											center={center}
											edges={edges}
											xyzPreview={xyzPreview}
											motion={motion}
											explosion={explosion}
											assembly={assembly}
											effectController={effectController}
											driveEffect={
												driveEffect && controllerSource && effect !== 'none'
											}
											positionX={positionX}
											rotationY={rotationY}
											scale={scale}
											onReady={ready}
										/>
									)}
								</Suspense>
							</Canvas>
						</ModelErrorBoundary>
						<div
							className='model-status'
							role='status'
							data-testid='model-status'
							data-status={status === 'Model ready' ? 'ready' : 'pending'}
						>
							<i />
							{status}
						</div>
						<div className='axis-preview'>
							<label className='axis-preview-toggle'>
								<input
									aria-label='XYZ preview'
									type='checkbox'
									checked={xyzPreview}
									onChange={(event) => setXyzPreview(event.target.checked)}
								/>
								<span>XYZ preview</span>
							</label>
							{xyzPreview && (
								<figure className='axis-key' aria-label='coordinate axes'>
									<span className='axis-x'>X</span>
									<span className='axis-y'>Y</span>
									<span className='axis-z'>Z</span>
								</figure>
							)}
						</div>
					</div>
					<div className='specimen'>
						<span>
							{model.set} / <b>{model.title}</b>
						</span>
						<a
							href='https://library.ldraw.org/omr/sets'
							target='_blank'
							rel='noreferrer'
						>
							LDRAW OMR ↗
						</a>
					</div>
				</section>
				<aside className='controls' aria-label='Model controls'>
					<div className='controls-heading'>
						<p className='eyebrow'>CONSUMER INPUT</p>
						<h2>Model setup</h2>
					</div>
					<section className='control-section'>
						<label className='model-picker' htmlFor='model-select'>
							Model
							<select
								aria-label='Model'
								id='model-select'
								value={model.id}
								onChange={(e) => {
									pending()
									setModelId(e.target.value)
								}}
							>
								{models.map((item) => (
									<option key={item.id} value={item.id}>
										{item.label} · {item.complexity}
									</option>
								))}
							</select>
						</label>
						<p className='hint'>
							Parts resolve from the LDraw library. A missing part fails the
							draw; fix its availability and retry.
						</p>
						<Toggle
							label='Simulate loading failure'
							checked={simulateFailure}
							onChange={(checked) => {
								pending()
								setSimulateFailure(checked)
							}}
						/>
						<p className='hint'>
							Tests the loading-error UI without changing your connection or
							cached files.
						</p>
					</section>
					<fieldset className='control-section'>
						<legend>Motion</legend>
						<Toggle
							label='Float'
							checked={floatEnabled}
							onChange={setFloatEnabled}
						/>
						<AxisSelect
							label='Float axis'
							value={floatAxis}
							onChange={setFloatAxis}
						/>
						<Slider
							label='Float amplitude'
							min={0}
							max={30}
							step={0.5}
							value={amplitude}
							onChange={setAmplitude}
							unit=' LU'
						/>
						<Slider
							label='Float speed'
							min={-2}
							max={2}
							step={0.1}
							value={floatSpeed}
							onChange={setFloatSpeed}
							unit=' rad/s'
						/>
						<Toggle
							label='Spin'
							checked={spinEnabled}
							onChange={setSpinEnabled}
						/>
						<AxisSelect
							label='Spin axis'
							value={spinAxis}
							onChange={setSpinAxis}
						/>
						<Slider
							label='Spin speed'
							min={-1}
							max={1}
							step={0.05}
							value={spinSpeed}
							onChange={setSpinSpeed}
							unit=' rad/s'
						/>
						<p className='hint'>
							Axes follow the base transform. Changing an axis restarts that
							preset.
						</p>
					</fieldset>
					<fieldset className='control-section'>
						<legend>Construction effects</legend>
						<label className='select-row'>
							Effect
							<select
								aria-label='Construction effect'
								value={effect}
								onChange={(event) =>
									setEffect(event.target.value as typeof effect)
								}
							>
								<option value='none'>None</option>
								<option value='explosion'>Explosion</option>
								<option value='assembly'>Assembly</option>
							</select>
						</label>
						<Slider
							label='Effect progress'
							min={0}
							max={1}
							step={0.01}
							value={effectProgress}
							onChange={setEffectProgress}
						/>
						{effect === 'explosion' && (
							<>
								<Toggle
									label='Use distance units'
									checked={!relativeDistance}
									onChange={(checked) => setRelativeDistance(!checked)}
								/>
								<label className='select-row'>
									{relativeDistance
										? 'Distance multiplier'
										: 'Explosion distance (LU)'}
									<input
										aria-label={
											relativeDistance
												? 'Distance multiplier'
												: 'Explosion distance'
										}
										type='number'
										min={0}
										step={relativeDistance ? 0.1 : 1}
										value={
											relativeDistance ? explosionMultiplier : explosionDistance
										}
										onChange={(event) => {
											const value = event.currentTarget.valueAsNumber
											if (Number.isFinite(value) && value >= 0)
												(relativeDistance
													? setExplosionMultiplier
													: setExplosionDistance)(value)
										}}
									/>
								</label>
							</>
						)}
						<Toggle
							label='Use controller source'
							checked={controllerSource}
							onChange={setControllerSource}
						/>
						<Toggle
							label='Drive from consumer useFrame'
							checked={driveEffect}
							onChange={setDriveEffect}
						/>
						<p className='hint'>
							The slider seeks either public progress source. The optional frame
							driver is owned by this playground and stops when disabled.
						</p>
					</fieldset>
					<fieldset className='control-section'>
						<legend>Transform</legend>
						<Slider
							label='Position X'
							min={-80}
							max={80}
							value={positionX}
							onChange={setPositionX}
							unit=' LU'
						/>
						<Slider
							label='Rotation Y'
							min={-180}
							max={180}
							value={rotationY}
							onChange={setRotationY}
							unit='°'
						/>
						<Slider
							label='Uniform scale'
							min={0.5}
							max={2}
							step={0.05}
							value={scale}
							onChange={setScale}
							unit='×'
						/>
					</fieldset>
					<fieldset className='control-section'>
						<legend>Display & playback</legend>
						<Toggle
							label='Center bounds'
							checked={center}
							onChange={setCenter}
						/>
						<Toggle label='Edge lines' checked={edges} onChange={setEdges} />
						<label className='select-row'>
							Reduced motion
							<select
								aria-label='Reduced motion'
								value={reducedMotion}
								onChange={(e) =>
									setReducedMotion(e.target.value as typeof reducedMotion)
								}
							>
								<option value='system'>Follow system</option>
								<option value='always'>Always reduce</option>
								<option value='never'>Allow motion</option>
							</select>
						</label>
						<label className='select-row'>
							Render loop
							<select
								aria-label='Render loop'
								value={frameloop}
								onChange={(e) => setFrameloop(e.target.value as Loop)}
							>
								<option value='always'>Continuous</option>
								<option value='demand'>Demand</option>
								<option value='never'>Manual</option>
							</select>
						</label>
						<p className='hint'>
							Continuous renders every frame, even when static. Demand renders
							when requested and keeps rendering during motion. Manual renders
							only when you advance it.
						</p>
						{frameloop === 'never' && (
							<>
								<button
									className='manual-button'
									type='button'
									onClick={() => step.current?.()}
								>
									Advance 1/60 second
								</button>
								<p className='hint'>
									Each click advances time by 1/60 second. Always reduce
									disables motion under any render-loop mode.
								</p>
							</>
						)}
					</fieldset>
				</aside>
			</div>
			<section className='api-example' aria-label='Consumer code example'>
				<p className='eyebrow'>02 / PUBLIC API</p>
				<pre>
					<code>{`<BrickModel src="${src}" center\n  motion={{ float: { axis: '${floatAxis}', amplitude: ${amplitude} },\n    spin: { axis: '${spinAxis}', speed: ${spinSpeed} }${reducedMotion === 'system' ? '' : `,\n    reducedMotion: '${reducedMotion}'`} }}\n  ${effect === 'explosion' ? `explosion={{ ${controllerSource ? 'controller' : `progress: ${effectProgress.toFixed(2)}`}, ${relativeDistance ? `distanceMultiplier: ${explosionMultiplier}` : `distance: ${explosionDistance}`} }}` : effect === 'assembly' ? `assembly={{ ${controllerSource ? 'controller' : `progress: ${effectProgress.toFixed(2)}`} }}` : ''} />`}</code>
				</pre>
				<pre>
					<code>{`import { useFrame } from '@react-three/fiber'\nimport { BrickModel, createBrickEffectController } from 'brickinetic'\n\nconst controller = createBrickEffectController()\n\n// Inside a component within your Canvas:\nuseFrame((_, delta) => {\n  controller.setProgress(controller.getProgress() + delta * 0.1)\n})\n\n<BrickModel src="${src}" explosion={{ controller }} />`}</code>
				</pre>
				<p>
					Use inside your Canvas and Suspense boundary. Missing parts reach your
					error boundary.
				</p>
			</section>
			<footer>
				<span>BRICKINETIC · MODEL EXPLORER</span>
				<a href='/models/README.md'>Model provenance & licenses ↗</a>
			</footer>
		</main>
	)
}
