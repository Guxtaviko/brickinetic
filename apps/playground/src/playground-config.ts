import type {
	BrickEffectEasing,
	BrickModelProps,
	EffectPlaybackConfig,
} from 'brickinetic'

export const models = [
	{ id: 'car', label: 'Car', set: '1477', title: 'Red Devil Racer' },
	{ id: 'speedboat', label: 'Speedboat', set: '31039', title: 'Speedboat' },
	{
		id: 'spaceship',
		label: 'Spaceship',
		set: '70816',
		title: 'Benny’s Spaceship',
	},
] as const
export type Axis = 'x' | 'y' | 'z'
export interface PlaygroundSettings {
	modelId: string
	effectType: 'assembly' | 'explosion' | 'none'
	mode: 'automatic' | 'manual'
	progress: number
	duration: number
	direction: NonNullable<EffectPlaybackConfig['direction']>
	repeat: boolean
	hold: number
	paused: boolean
	easing: BrickEffectEasing
	randomness: number
	seed: number
	assemblyAxis: Axis
	assemblyDirection: 'ascending' | 'descending'
	entrance: 'instant' | 'translate'
	offsetY: number
	relativeDistance: boolean
	distance: number
	distanceMultiplier: number
	explosionRotation: number
	center: boolean
	edges: boolean
	reducedMotion: NonNullable<BrickModelProps['reducedMotion']>
	floatEnabled: boolean
	floatAxis: Axis
	amplitude: number
	floatSpeed: number
	spinEnabled: boolean
	spinAxis: Axis
	spinSpeed: number
	positionX: number
	rotationY: number
	scale: number
}
export const defaultSettings: Readonly<PlaygroundSettings> = Object.freeze({
	modelId: 'car',
	effectType: 'assembly',
	mode: 'automatic',
	progress: 0,
	duration: 3,
	direction: 'forward',
	repeat: true,
	hold: 3,
	paused: false,
	easing: 'smoothstep',
	randomness: 0.2,
	seed: 0,
	assemblyAxis: 'y',
	assemblyDirection: 'ascending',
	entrance: 'translate',
	offsetY: 28,
	relativeDistance: true,
	distance: 24,
	distanceMultiplier: 1,
	explosionRotation: 15,
	center: true,
	edges: true,
	reducedMotion: 'system',
	floatEnabled: false,
	floatAxis: 'y',
	amplitude: 5,
	floatSpeed: 0.8,
	spinEnabled: true,
	spinAxis: 'y',
	spinSpeed: 0.1,
	positionX: 0,
	rotationY: 0,
	scale: 1,
})

/** The sole serializable source for rendered model props and copyable examples. */
export function createModelConfig(
	settings: Readonly<PlaygroundSettings>,
): BrickModelProps {
	const model =
		models.find((model) => model.id === settings.modelId) ?? models[0]
	const config: BrickModelProps = {
		src: `/models/${model.id}.mpd`,
		center: settings.center,
		edges: settings.edges,
		reducedMotion: settings.reducedMotion,
		position: [settings.positionX, 0, 0],
		rotation: [0, (settings.rotationY * Math.PI) / 180, 0],
		scale: settings.scale,
	}
	if (settings.floatEnabled || settings.spinEnabled) {
		config.motion = {
			...(settings.floatEnabled
				? {
						float: {
							axis: settings.floatAxis,
							amplitude: settings.amplitude,
							speed: settings.floatSpeed,
						},
					}
				: {}),
			...(settings.spinEnabled
				? { spin: { axis: settings.spinAxis, speed: settings.spinSpeed } }
				: {}),
		}
	}
	if (settings.effectType !== 'none') {
		const driver =
			settings.mode === 'automatic'
				? {
						playback: {
							duration: settings.duration,
							direction: settings.direction,
							hold: settings.hold,
							repeat: settings.repeat,
							paused: settings.paused,
						},
					}
				: { progress: settings.progress }
		const appearance =
			settings.effectType === 'assembly'
				? {
						type: 'assembly' as const,
						axis: settings.assemblyAxis,
						direction: settings.assemblyDirection,
						entrance: settings.entrance,
						...(settings.entrance === 'translate'
							? { offset: [0, settings.offsetY, 0] as const }
							: {}),
					}
				: {
						type: 'explosion' as const,
						...(settings.relativeDistance
							? { distanceMultiplier: settings.distanceMultiplier }
							: { distance: settings.distance }),
						rotation: (settings.explosionRotation * Math.PI) / 180,
					}
		config.effect = {
			...appearance,
			...driver,
			easing: settings.easing,
			randomness: settings.randomness,
			seed: settings.seed,
		}
	}
	return config
}

export function formatModelCode(config: BrickModelProps) {
	return `import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { BrickModel, type BrickModelProps } from 'brickinetic'

const model = ${JSON.stringify(config, null, 2)} satisfies BrickModelProps

export function Scene() {
  return (
    <Canvas camera={{ fov: 38, position: [250, 175, 310] }}>
      <ambientLight intensity={1.6} />
      <directionalLight intensity={2.3} position={[120, 230, 160]} />
      <Suspense fallback={null}>
        <BrickModel {...model} />
      </Suspense>
    </Canvas>
  )
}
`
}
