import type { BrickModelProps } from 'brickinetic'

export const quickstartModel = {
	src: '/models/car.mpd',
	center: true,
	effect: { type: 'assembly', playback: { duration: 3 } },
} satisfies BrickModelProps

export const quickstartCode = `import { Canvas } from '@react-three/fiber'
import { BrickModel } from 'brickinetic'

export function Scene() {
  return (
    <Canvas camera={{ position: [0, 0, 300] }}>
      <ambientLight intensity={2} />
      <BrickModel src="${quickstartModel.src}" center={${quickstartModel.center}}
        effect={{ type: '${quickstartModel.effect.type}',
          playback: { duration: ${quickstartModel.effect.playback.duration} } }} />
    </Canvas>
  )
}`
