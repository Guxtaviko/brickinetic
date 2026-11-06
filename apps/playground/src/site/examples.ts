import type { BrickModelProps } from 'brickinetic'

export const quickstartModel = {
	src: '/models/car.mpd',
	center: true,
	effect: { type: 'assembly', playback: { duration: 3 } },
} satisfies BrickModelProps

export const quickstartCode = `import { Canvas } from '@react-three/fiber'
import { BrickModel, type BrickModelProps } from 'brickinetic'

const model: BrickModelProps = ${JSON.stringify(quickstartModel, null, 2)}

export function Scene() {
  return <Canvas camera={{ position: [0, 0, 300] }}>
    <ambientLight intensity={2} />
    <BrickModel {...model} />
  </Canvas>
}`
