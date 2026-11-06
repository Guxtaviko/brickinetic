import type {
	AssemblyConfig,
	BrickEffectController,
	ExplosionConfig,
} from '../src/index.js'

const controller: BrickEffectController = {
	setProgress() {},
	getProgress: () => 0,
}
type ControllerHasNoPublicBind = 'bind' extends keyof BrickEffectController
	? never
	: true
const controllerHasNoPublicBind: ControllerHasNoPublicBind = true

const numericExplosion: ExplosionConfig = { progress: 0.5, distance: 24 }
const controlledAssembly: AssemblyConfig = {
	controller,
	axis: 'z',
	entrance: 'translate',
	offset: [0, 20, 0],
	easing: 'smoothstep',
}

// @ts-expect-error An effect must have exactly one progress source.
const conflictingSources: ExplosionConfig = { progress: 0.5, controller }
// @ts-expect-error A progress source is required.
const missingSource: AssemblyConfig = { axis: 'y' }

export type BrickEffectTypeAssertions = [
	typeof numericExplosion,
	typeof controlledAssembly,
	typeof conflictingSources,
	typeof missingSource,
	typeof controllerHasNoPublicBind,
]
