import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
	type BrickEffectConfig,
	BrickModel,
	type BrickModelProps,
} from 'brickinetic'
import { StrictMode, Suspense, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

interface Settings {
	effect?: BrickEffectConfig
	loop: 'always' | 'demand' | 'never'
	reducedMotion: BrickModelProps['reducedMotion']
	mounted: boolean
	replay: number
}
interface Harness {
	configure: (settings: Partial<Settings>) => void
	advance: (delta: number) => void
	pose: () => number[][]
	progress: number
	frames: number
	ready: boolean
}
declare global {
	interface Window {
		effectHarness: Harness
	}
}
const harness: Harness = {
	configure() {},
	advance() {},
	pose: () => [],
	progress: -1,
	frames: 0,
	ready: false,
}
window.effectHarness = harness
const report = (progress: number) => {
	harness.progress = progress
}
function Probe() {
	const state = useThree()
	useLayoutEffect(() => {
		harness.pose = () => {
			const matrices: number[][] = []
			state.scene.traverse((node) => matrices.push(node.matrix.toArray()))
			return matrices
		}
		harness.ready = true
		harness.advance = (delta) =>
			state.advance(state.clock.elapsedTime + delta, true)
		return () => {
			harness.ready = false
		}
	}, [state])
	useFrame(() => {
		harness.frames++
	})
	return null
}
function Fixture() {
	const [settings, setSettings] = useState<Settings>({
		effect: {
			type: 'explosion',
			playback: { duration: 0.2, repeat: true, hold: 0.5 },
		},
		loop:
			new URLSearchParams(location.search).get('loop') === 'never'
				? 'never'
				: 'demand',
		reducedMotion: 'never',
		mounted: true,
		replay: 0,
	})
	useLayoutEffect(() => {
		harness.configure = (patch) =>
			setSettings((previous) => ({ ...previous, ...patch }))
	}, [])
	const effect = settings.effect?.playback
		? {
				...settings.effect,
				playback: { ...settings.effect.playback, onProgress: report },
			}
		: settings.effect
	return (
		<Canvas frameloop={settings.loop} camera={{ position: [0, 0, 100] }}>
			<ambientLight />
			<Suspense fallback={null}>
				{settings.mounted && (
					<BrickModel
						key={settings.replay}
						src='/models/car.mpd'
						effect={effect}
						reducedMotion={settings.reducedMotion}
						center
					/>
				)}
				<Probe />
			</Suspense>
		</Canvas>
	)
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing fixture root')
createRoot(root).render(
	<StrictMode>
		<Fixture />
	</StrictMode>,
)
