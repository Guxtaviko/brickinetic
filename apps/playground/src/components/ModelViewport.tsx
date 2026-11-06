import { Canvas, useThree } from '@react-three/fiber'
import { BrickModel, type BrickModelProps } from 'brickinetic'
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
import { models } from '../playground-config'

class ModelErrorBoundary extends Component<
	{ children: ReactNode; retry: () => void; onError: () => void },
	{ error: Error | null }
> {
	state: { error: Error | null } = { error: null }
	static getDerivedStateFromError(error: Error) {
		return { error }
	}
	componentDidCatch() {
		this.props.onError()
	}
	render() {
		if (this.state.error)
			return (
				<div
					role='alert'
					className='absolute inset-0 z-10 flex flex-col items-start justify-center bg-fd-background p-6'
				>
					<h2 className='text-xl font-semibold'>Model unavailable</h2>
					<p className='my-4 max-w-prose break-words text-sm leading-relaxed'>
						{this.state.error.message}
					</p>
					<button
						className='ui-button'
						type='button'
						onClick={this.props.retry}
					>
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

function ModelScene({
	config,
	xyzPreview,
	replay,
	onReady,
}: {
	config: BrickModelProps
	xyzPreview: boolean
	replay: number
	onReady: () => void
}) {
	const primary = useRef<Group>(null)
	const { camera, gl, invalidate, size } = useThree()
	const controlsRef = useRef<OrbitControls | null>(null)
	const baselineBounds = useRef<Box3 | undefined>(undefined)
	const [captured, setCaptured] = useState('')
	const [guideSize, setGuideSize] = useState(30)
	const captureKey = config.src
	const initialScale = useRef(
		typeof config.scale === 'number' ? config.scale : 1,
	)
	const fitting = captured !== captureKey
	useLayoutEffect(() => {
		const controls = new OrbitControls(camera, gl.domElement)
		controls.enablePan = false
		controlsRef.current = controls
		const change = () => invalidate()
		controls.addEventListener('change', change)
		return () => {
			controls.removeEventListener('change', change)
			controls.dispose()
			controlsRef.current = null
		}
	}, [camera, gl, invalidate])
	useLayoutEffect(() => {
		const controls = controlsRef.current
		if (!controls || !primary.current || !(camera instanceof PerspectiveCamera))
			return
		if (fitting || !baselineBounds.current) {
			baselineBounds.current = new Box3().setFromObject(primary.current)
			setCaptured(captureKey)
		}
		const sphere = baselineBounds.current.getBoundingSphere(new Sphere())
		const radius = Math.max(sphere.radius, 1)
		const vertical = (camera.fov * Math.PI) / 360
		const horizontal = Math.atan(Math.tan(vertical) * camera.aspect)
		const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.05
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
		setGuideSize((radius * 0.65) / initialScale.current)
		invalidate()
		onReady()
	}, [
		camera,
		captureKey,
		fitting,
		invalidate,
		onReady,
		size.width,
		size.height,
	])
	return (
		<>
			<group ref={primary} name='inspection-primary'>
				<BrickModel
					key={replay}
					{...config}
					effect={fitting ? undefined : config.effect}
				/>
			</group>
			{xyzPreview && (
				<group
					name='xyz-preview'
					position={config.position}
					rotation={config.rotation}
					scale={config.scale}
				>
					<axesHelper args={[guideSize]} />
				</group>
			)}
		</>
	)
}

export interface ModelViewportProps {
	config: BrickModelProps
	xyzPreview: boolean
	onAxesChange: (value: boolean) => void
	replay: number
	background: string
	onProgress: (progress: number) => void
	compact?: boolean
}
export function ModelViewport({
	config,
	xyzPreview,
	onAxesChange,
	replay,
	background,
	onProgress,
	compact = false,
}: ModelViewportProps) {
	const [attempt, setAttempt] = useState(0)
	const [status, setStatus] = useState('Loading model and parts')
	const pending = useCallback(() => setStatus('Loading model and parts'), [])
	const ready = useCallback(() => setStatus('Model ready'), [])
	const failed = useCallback(() => setStatus('Load failed'), [])
	const runtimeConfig = useMemo<BrickModelProps>(
		() =>
			config.effect?.playback
				? {
						...config,
						effect: {
							...config.effect,
							playback: { ...config.effect.playback, onProgress },
						},
					}
				: config,
		[config, onProgress],
	)
	const model =
		models.find((model) => config.src.includes(`${model.id}.mpd`)) ?? models[0]
	return (
		<section aria-label='Live model viewport' className='min-w-0'>
			<div
				className={`relative overflow-hidden rounded-xl border bg-viewer ${compact ? 'h-[25rem] sm:h-[30rem]' : 'h-[clamp(22rem,65dvh,44rem)]'}`}
			>
				<ModelErrorBoundary
					key={`${config.src}:${attempt}`}
					retry={() => {
						pending()
						setAttempt((value) => value + 1)
					}}
					onError={failed}
				>
					<Canvas
						frameloop='demand'
						camera={{ fov: 38, position: [250, 175, 310] }}
						fallback={
							<p className='p-6'>
								This viewer requires WebGL. The guides and code examples remain
								available.
							</p>
						}
					>
						<color attach='background' args={[background]} />
						<ambientLight intensity={1.6} />
						<directionalLight intensity={2.3} position={[120, 230, 160]} />
						<Suspense fallback={<Loading onPending={pending} />}>
							<ModelScene
								config={runtimeConfig}
								xyzPreview={xyzPreview}
								replay={replay}
								onReady={ready}
							/>
						</Suspense>
					</Canvas>
				</ModelErrorBoundary>
				<label className='absolute right-3 top-3 flex min-h-9 cursor-pointer items-center gap-2 rounded-md border bg-fd-background px-3 text-xs'>
					<input
						type='checkbox'
						checked={xyzPreview}
						onChange={(event) => onAxesChange(event.currentTarget.checked)}
						className='accent-fd-primary'
					/>
					XYZ preview
				</label>
				<div
					role='status'
					data-testid='model-status'
					className='pointer-events-none absolute bottom-3 left-3 rounded-md border bg-fd-background px-3 py-2 text-xs text-fd-muted-foreground'
				>
					{status}
				</div>
				{xyzPreview && (
					<figure
						aria-label='coordinate axes'
						className='pointer-events-none absolute bottom-3 right-3 flex gap-2 rounded-md bg-fd-background px-2.5 py-2 font-mono text-xs font-semibold'
					>
						<span className='text-axis-x'>X</span>
						<span className='text-axis-y'>Y</span>
						<span className='text-axis-z'>Z</span>
					</figure>
				)}
			</div>
			<div className='mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-fd-muted-foreground'>
				<span>
					{model.set} · {model.title}
				</span>
				<span>Drag to orbit. Scroll to zoom.</span>
				<a className='underline underline-offset-4' href='/models/README.md'>
					Provenance and licenses
				</a>
			</div>
		</section>
	)
}
