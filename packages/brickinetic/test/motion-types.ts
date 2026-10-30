import type { BrickModelProps, MotionConfig } from '../src/index.js'

const examples: MotionConfig[] = [
	{},
	{ float: { axis: 'y' } },
	{ spin: { axis: 'x', speed: -1 } },
	{
		float: { enabled: false, amplitude: 0, speed: 1 },
		spin: { axis: 'z' },
		reducedMotion: 'never',
	},
	{ float: false, spin: false, reducedMotion: 'system' },
	{ float: { axis: 'z' }, spin: { axis: 'x' }, reducedMotion: 'always' },
]
const props: BrickModelProps = {
	src: 'model.mpd',
	partsLibraryPath: '/ldraw/',
	motion: examples[0],
}
void props

// @ts-expect-error only the three named axes are supported
const invalid: MotionConfig = { float: { axis: 'w' } }
void invalid
