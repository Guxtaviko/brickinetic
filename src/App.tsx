import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Box3, type Group, type Object3D, Vector3 } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { LDrawLoader } from 'three/addons/loaders/LDrawLoader.js'
import { LDrawConditionalLineMaterial } from 'three/addons/materials/LDrawConditionalLineMaterial.js'
import type { AssemblyGroup } from './assembly'
import { applyProgress, makeGroups } from './assembly'

function Metrics({ model }: { model: Group | null }) {
	const { gl, scene } = useThree()
	useFrame(() => {
		if (!model) return
		let objects = 0
		let groups = 0
		scene.traverse((object) => {
			objects++
			if (object.type === 'Group') groups++
		})
		Object.assign(window, {
			ldrawMetrics: { objects, groups, drawCalls: gl.info.render.calls },
		})
	})
	return null
}

function Controls() {
	const { camera, gl } = useThree()
	useEffect(() => {
		const controls = new OrbitControls(camera, gl.domElement)
		controls.enableDamping = true
		controls.enablePan = false
		controls.minDistance = 220
		controls.maxDistance = 750
		let frame = 0
		const update = () => {
			controls.update()
			frame = requestAnimationFrame(update)
		}
		update()
		return () => {
			cancelAnimationFrame(frame)
			controls.dispose()
		}
	}, [camera, gl])
	return null
}

export default function App() {
	const [model, setModel] = useState<Group | null>(null)
	const [status, setStatus] = useState('Loading model and colours…')
	const [groups, setGroups] = useState<{
		source: AssemblyGroup[]
		manual: AssemblyGroup[]
	} | null>(null)
	const [mode, setMode] = useState<'source' | 'manual'>('source')
	const [progress, setProgress] = useState(1)
	const [playing, setPlaying] = useState(false)
	const [speed, setSpeed] = useState(2)
	const speedRef = useRef(2)
	const playbackStart = useRef(0)
	useEffect(() => {
		if (!playing) return
		let frame = 0
		let lastTime: number | undefined
		let current = playbackStart.current
		const tick = (time: number) => {
			if (lastTime !== undefined)
				current = Math.min(
					1,
					current + ((time - lastTime) / 10000) * speedRef.current,
				)
			lastTime = time
			setProgress(current)
			if (current < 1) frame = requestAnimationFrame(tick)
			else setPlaying(false)
		}
		frame = requestAnimationFrame(tick)
		return () => cancelAnimationFrame(frame)
	}, [playing])
	useEffect(() => {
		if (groups) applyProgress(groups[mode], progress)
	}, [groups, mode, progress])
	useEffect(() => {
		let active = true
		const startedAt = performance.now()
		const loader = new LDrawLoader().setPartsLibraryPath(
			`${import.meta.env.BASE_URL}ldraw/`,
		)
		loader.setConditionalLineMaterial(LDrawConditionalLineMaterial)
		const run = async () => {
			try {
				const base = `${import.meta.env.BASE_URL}ldraw/`
				const mapResponse = await fetch(`${base}file-map.json`)
				if (!mapResponse.ok)
					throw new Error(
						`Cannot load ${base}file-map.json (${mapResponse.status})`,
					)
				const fileMap: Record<string, string> = await mapResponse.json()
				const resources = [
					'car.mpd',
					'LDConfig.ldr',
					...new Set(
						Object.values(fileMap).map((path) => path.replace(/^\.\.\//, '')),
					),
				]
				await Promise.all(
					resources.map(async (path) => {
						const url = `${base}${path}`
						let response: Response
						try {
							response = await fetch(url)
						} catch {
							throw new Error(
								`Cannot load LDraw resource ${url} (network error)`,
							)
						}
						if (
							!response.ok ||
							response.headers.get('content-type')?.includes('text/html')
						)
							throw new Error(
								`Cannot load LDraw resource ${url} (${response.status})`,
							)
						const bytes = await response.arrayBuffer()
						if (path === 'car.mpd') {
							const hash = Array.from(
								new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
								(byte) => byte.toString(16).padStart(2, '0'),
							).join('')
							if (
								hash !==
								'58229219ee238640bb99ccd902c0bf2966b06f96b673dd9d6fb8bad7d0388775'
							)
								throw new Error(
									'Car fixture does not match the grouping manifest',
								)
						}
						const text = new TextDecoder().decode(bytes)
						if (!/^\s*[0-5](?:\s|$)/.test(text))
							throw new Error(`Invalid LDraw resource ${url}`)
					}),
				)
				loader.setFileMap(fileMap)
				await loader.preloadMaterials(
					`${import.meta.env.BASE_URL}ldraw/LDConfig.ldr`,
				)
				const group = await loader.loadAsync(
					`${import.meta.env.BASE_URL}ldraw/car.mpd`,
				)
				if (!active) return
				group.updateMatrixWorld(true)
				const hierarchy: object[] = []
				const paths = new Map<Object3D, string>([[group, 'root']])
				group.traverse((object) => {
					if (object.parent && paths.has(object.parent))
						paths.set(
							object,
							`${paths.get(object.parent)}/${object.parent.children.indexOf(object)}`,
						)
					hierarchy.push({
						path: paths.get(object),
						name: object.name,
						type: object.type,
						parent: object.parent ? paths.get(object.parent) : null,
						userData: object.userData,
						localMatrix: object.matrix.toArray(),
						worldMatrix: object.matrixWorld.toArray(),
					})
				})
				console.log('Raw LDraw hierarchy', hierarchy)
				Object.assign(window, {
					ldrawHierarchy: hierarchy,
					ldrawModel: group,
					ldrawLoadMs: performance.now() - startedAt,
				})
				const box = new Box3().setFromObject(group)
				const center = box.getCenter(new Vector3())
				group.rotation.x = Math.PI
				group.position.set(-center.x, center.y, center.z)
				setGroups({
					source: makeGroups(group, 'source'),
					manual: makeGroups(group, 'manual'),
				})
				setModel(group)
				setStatus('Ready · drag to orbit, scroll to zoom')
			} catch (error) {
				if (active) setStatus(`Loading failed: ${String(error)}`)
			}
		}
		void run()
		return () => {
			active = false
		}
	}, [])
	return (
		<main className='flex h-dvh flex-col gap-4.5 bg-neutral-900 px-[4vw] py-6 font-body text-stone-100 max-[43.75rem]:gap-3 max-[43.75rem]:py-3'>
			<header className='flex items-end justify-between gap-5 max-[43.75rem]:flex-col max-[43.75rem]:items-start max-[43.75rem]:gap-1.25'>
				<p className='mb-1.25 font-mono text-xs tracking-[0.08em] uppercase max-[43.75rem]:mb-0'>
					BRICKINETIC / M0
				</p>
				<h1 className='font-head text-[clamp(2rem,5vw,4rem)] leading-[0.9] font-bold tracking-[0.015em] uppercase'>
					Assembly lab
					<span className='align-top font-mono text-sm font-normal text-red-500'>
						{' '}
						01
					</span>
				</h1>
				<p className='mb-1.25 font-mono text-xs tracking-[0.08em] uppercase max-[43.75rem]:hidden'>
					Red Devil Racer · LDraw rendering study
				</p>
			</header>
			<section className='relative min-h-0 flex-1 overflow-hidden'>
				<Canvas
					camera={{ position: [320, 240, 380], fov: 35, near: 1, far: 3000 }}
				>
					<color attach='background' args={['#e7e5e4']} />
					<ambientLight intensity={1.4} />
					<directionalLight position={[100, 250, 200]} intensity={2.5} />
					<Controls />
					<Metrics model={model} />
					{model && <primitive object={model} />}
				</Canvas>
				<output className='absolute top-4.5 left-4.5 max-w-[calc(100%-2.25rem)] bg-neutral-900 px-3 py-2.5 font-mono text-xs tracking-[0.08em] text-white uppercase max-[43.75rem]:top-2.5 max-[43.75rem]:left-2.5 max-[43.75rem]:max-w-[calc(100%-1.25rem)]'>
					{status}
				</output>
				<div className='absolute top-4.5 right-4.5 bg-neutral-900 px-3 py-2.5 font-mono text-xs text-white max-[43.75rem]:top-12 max-[43.75rem]:right-2.5'>
					<span className='mr-2 text-red-300 uppercase'>Assembly</span>{' '}
					{Math.round(progress * 100)}%
				</div>
				<div className='absolute right-4.5 bottom-4.5 left-4.5 flex items-center gap-5 bg-neutral-900 p-3 font-mono text-xs text-stone-100 max-[43.75rem]:right-2.5 max-[43.75rem]:bottom-2.5 max-[43.75rem]:left-2.5 max-[43.75rem]:grid max-[43.75rem]:grid-cols-[auto_1fr] max-[43.75rem]:gap-2.5'>
					<button
						className='min-w-19 cursor-pointer bg-red-500 px-4 py-2.5 text-white disabled:cursor-default disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white'
						type='button'
						disabled={!groups}
						onClick={() => {
							if (playing) {
								setPlaying(false)
								return
							}
							const start = progress >= 1 ? 0 : progress
							playbackStart.current = start
							setProgress(start)
							setPlaying(true)
						}}
					>
						{playing ? 'Pause' : progress >= 1 ? 'Play' : 'Resume'}
					</button>
					<label className='flex items-center gap-2.5 whitespace-nowrap max-[43.75rem]:min-w-0'>
						Grouping{' '}
						<select
							className='max-w-35 bg-stone-200 p-2 text-neutral-900 accent-red-500 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white'
							value={mode}
							onChange={(event) => {
								setPlaying(false)
								setMode(event.target.value as typeof mode)
							}}
						>
							<option value='source'>Source steps</option>
							<option value='manual'>Manual groups</option>
						</select>
					</label>
					<label className='flex min-w-25 flex-1 items-center gap-2.5 whitespace-nowrap max-[43.75rem]:col-span-2 max-[43.75rem]:min-w-0'>
						Assembly{' '}
						<input
							className='w-full min-w-10 max-w-45 accent-red-500 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white max-[43.75rem]:flex-1'
							type='range'
							min='0'
							max='1'
							step='0.01'
							value={progress}
							onChange={(event) => {
								setPlaying(false)
								setProgress(Number(event.target.value))
							}}
						/>{' '}
						{Math.round(progress * 100)}%
					</label>
					<label className='flex min-w-25 flex-1 items-center gap-2.5 whitespace-nowrap max-[43.75rem]:col-span-2 max-[43.75rem]:min-w-0'>
						<span>
							Speed{' '}
							<output className='inline-block w-[5ch] text-red-300'>
								{speed.toFixed(2).replace(/\.?0+$/, '')}×
							</output>
						</span>
						<input
							className='w-full min-w-10 max-w-45 accent-red-500 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white max-[43.75rem]:flex-1'
							type='range'
							min='0.25'
							max='3'
							step='0.25'
							value={speed}
							onChange={(event) => {
								const value = Number(event.target.value)
								speedRef.current = value
								setSpeed(value)
							}}
						/>
					</label>
				</div>
			</section>
		</main>
	)
}
