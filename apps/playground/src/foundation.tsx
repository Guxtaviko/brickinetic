import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { createRoot } from 'react-dom/client'
import { Box3, Group, Vector3 } from 'three'
import {
	bindConstructionUnits,
	displaceConstructionUnit,
	prepareConstructionUnits,
	preparedCenter,
} from '../../../packages/brickinetic/dist/construction-units.js'
import {
	cloneModel,
	DEFAULT_PARTS_LIBRARY_PATH,
	disposeModel,
	loadUnpreparedModel,
	readModel,
	retainModel,
} from '../../../packages/brickinetic/dist/model-resource.js'
import { setEdgeVisibility } from '../../../packages/brickinetic/dist/model-view.js'

const params = new URLSearchParams(location.search)
const source = `/models/${params.get('model') ?? 'car'}.mpd`
const baseline = params.get('baseline') === '1'
const instances = params.get('instances') === '2' ? 2 : 1
const edges = params.get('edges') !== '0'
const frameLoop =
	params.get('loop') === 'never'
		? 'never'
		: params.get('loop') === 'demand'
			? 'demand'
			: 'always'
const motion =
	params.get('motion') === '1' &&
	!matchMedia('(prefers-reduced-motion: reduce)').matches
const state: {
	ready: boolean
	error: string | null
	loaderMs: number
	loaderStages: { transportMs?: number; materialsMs?: number; parseMs?: number }
	preparationMs: number | null
	bindingMs: number[]
	cloneMs: number[]
	units: number | null
	renderables: number
	frames: number[]
	calls: number
	geometries: number
	textures: number
	reduced: boolean
	probe?: (distance: number) => unknown
	center?: (enabled: boolean) => number[]
	pose?: () => { float: number[]; spin: number; frameCount: number }
	cycle?: () => Promise<unknown>
	invalidate?: () => void
	advance?: () => void
	unmount?: () => void
} = {
	ready: false,
	error: null,
	loaderMs: 0,
	loaderStages: {},
	preparationMs: null,
	bindingMs: [],
	cloneMs: [],
	units: null,
	renderables: 0,
	frames: [],
	calls: 0,
	geometries: 0,
	textures: 0,
	reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
}
Object.assign(window, { foundation: state })

async function main() {
	const started = performance.now()
	const model = await loadUnpreparedModel(
		new URL(source, location.href).href,
		DEFAULT_PARTS_LIBRARY_PATH,
		state.loaderStages,
	)
	state.loaderMs = performance.now() - started
	model.traverse((node) => {
		if ('geometry' in node) state.renderables++
	})
	const preparationStart = performance.now()
	const prepared = baseline ? null : prepareConstructionUnits(model, source)
	if (prepared) {
		state.preparationMs = performance.now() - preparationStart
		state.units = prepared.units.length
	}
	const clones = Array.from({ length: instances }, () => {
		const cloneStart = performance.now()
		const clone = model.clone(true) as Group
		state.cloneMs.push(performance.now() - cloneStart)
		const start = performance.now()
		const binding = prepared ? bindConstructionUnits(clone, prepared) : null
		state.bindingMs.push(performance.now() - start)
		setEdgeVisibility(clone, edges)
		return { clone, binding }
	})
	const bounds = new Box3().setFromObject(model)
	const center = prepared
		? preparedCenter(prepared)
		: bounds.getCenter(new Vector3()).multiply(new Vector3(1, -1, -1))
	const size = bounds.getSize(new Vector3()).length() || 1
	const rootElement = document.getElementById('root')
	if (!rootElement) throw new Error('Missing root')
	const root = createRoot(rootElement)
	let previous = 0
	function Instrument() {
		const { gl, invalidate, advance, scene, camera } = useThree()
		state.invalidate = invalidate
		state.advance = () => advance(performance.now() / 1000)
		state.cycle = async () => {
			const src = new URL(source, location.href).href
			const memory = () => ({
				geometries: gl.info.memory.geometries,
				textures: gl.info.memory.textures,
				heap:
					(performance as Performance & { memory?: { usedJSHeapSize: number } })
						.memory?.usedJSHeapSize ?? null,
			})
			const before = memory()
			let clone: Group
			try {
				clone = cloneModel(src)
			} catch (pending) {
				if (!(pending instanceof Promise)) throw pending
				await pending
				clone = cloneModel(src)
			}
			const release = retainModel(src)
			const warmStart = performance.now()
			readModel(src)
			const warmReadMs = performance.now() - warmStart
			scene.add(clone)
			gl.render(scene, camera)
			const mounted = memory()
			scene.remove(clone)
			release()
			await new Promise((resolve) => setTimeout(resolve, 2200))
			gl.render(scene, camera)
			return { before, mounted, settled: memory(), warmReadMs }
		}
		useFrame(({ clock }) => {
			const now = performance.now()
			if (previous) state.frames.push(now - previous)
			previous = now
			state.calls = gl.info.render.calls
			state.geometries = gl.info.memory.geometries
			state.textures = gl.info.memory.textures
			if (motion) {
				spin.rotation.y = clock.elapsedTime * 0.2
				float.position.y = Math.sin(clock.elapsedTime) * size * 0.02
			}
			if (frameLoop === 'demand' && motion) invalidate()
		})
		state.ready = true
		return null
	}
	const float = new Group()
	const spin = new Group()
	float.add(spin)
	const orientedGroups: Group[] = []
	clones.forEach(({ clone }, index) => {
		const oriented = new Group()
		oriented.rotation.x = Math.PI
		oriented.position.copy(center).negate()
		oriented.position.x += (index - (instances - 1) / 2) * size * 0.7
		oriented.add(clone)
		spin.add(oriented)
		orientedGroups.push(oriented)
	})
	float.position.set(0, 0, 0)
	state.probe = (distance) => {
		const binding = clones[0].binding?.find((unit) => {
			const kinds = new Set<string>()
			for (const root of unit.roots)
				root.traverse((node) => {
					if ('isConditionalLine' in node && node.isConditionalLine)
						kinds.add('conditional')
					else if ('isLineSegments' in node && node.isLineSegments)
						kinds.add('edge')
					else if ('isMesh' in node && node.isMesh) kinds.add('face')
				})
			return unit.unit.kind === 'part' && kinds.size === 3
		})
		if (!binding) throw new Error('No part binding')
		displaceConstructionUnit(binding, new Vector3(distance, 0, 0))
		float.updateWorldMatrix(true, true)
		const rendered: { kind: string; position: number[] }[] = []
		for (const root of binding.roots)
			root.traverse((node) => {
				const kind =
					'isConditionalLine' in node && node.isConditionalLine
						? 'conditional'
						: 'isLineSegments' in node && node.isLineSegments
							? 'edge'
							: 'isMesh' in node && node.isMesh
								? 'face'
								: null
				if (kind)
					rendered.push({
						kind,
						position: node.getWorldPosition(new Vector3()).toArray(),
					})
			})
		state.invalidate?.()
		return {
			id: binding.unit.id,
			roots: binding.roots.length,
			local: binding.roots[0].matrix.elements.slice(),
			center: center.toArray(),
			rendered,
			other: clones[1]?.clone.children[0]?.matrix.elements.slice() ?? null,
		}
	}
	state.center = (enabled) => {
		orientedGroups.forEach((group, index) => {
			group.position.copy(enabled ? center.clone().negate() : new Vector3())
			group.position.x += (index - (instances - 1) / 2) * size * 0.7
		})
		state.invalidate?.()
		return orientedGroups[0].position.toArray()
	}
	state.pose = () => ({
		float: float.position.toArray(),
		spin: spin.rotation.y,
		frameCount: state.frames.length,
	})
	state.unmount = () => {
		root.unmount()
		disposeModel(model)
		state.ready = false
	}
	root.render(
		<Canvas
			frameloop={frameLoop}
			dpr={1}
			camera={{
				position: [0, 0, size * 1.4],
				near: size / 1000,
				far: size * 20,
			}}
			style={{ width: '100vw', height: '100vh', background: '#e7edf2' }}
		>
			<ambientLight intensity={2} />
			<directionalLight position={[10, 20, 30]} intensity={2} />
			<group position={[size * 0.04, size * 0.03, 0]} rotation={[0.1, 0.2, 0]}>
				<primitive object={float} />
			</group>
			<Instrument />
		</Canvas>,
	)
}
main().catch((error: unknown) => {
	state.error =
		error instanceof Error ? (error.stack ?? error.message) : String(error)
})
