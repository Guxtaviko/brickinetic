# brickinetic

React Three Fiber component library for prepared LDraw MPD models.

The package emits ESM and TypeScript declarations. React, React DOM, React Three Fiber, and Three.js are peer dependencies and are not bundled.

Tested together on 2026-10-30: React and React DOM `19.3.1`, React Three Fiber `9.8.2`, Three.js `0.186.1`. The package peer ranges are `react`/`react-dom >=19 <19.4`, `@react-three/fiber >=9 <10`, and `three >=0.186 <0.187`.

The distributed `assets/LDConfig.ldr` is the fixed LDraw color configuration used by the loader.

## Usage

`BrickModel` renders inside a Canvas created by the consumer:

```tsx
import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { BrickModel } from 'brickinetic'

const Sample = () => (
	<Canvas>
		<Suspense fallback={null}>
			<BrickModel src='/models/ship.mpd' center />
		</Suspense>
	</Canvas>
)
```

### Props

| Prop       | Type               | Default     | Behavior                                                                         |
| ---------- | ------------------ | ----------- | -------------------------------------------------------------------------------- |
| `src`      | `string`           | required    | URL of an MPD whose referenced geometry is embedded in the same document.        |
| `position` | R3F group position | `[0, 0, 0]` | Consumer translation, in LDraw units.                                            |
| `rotation` | R3F group rotation | `[0, 0, 0]` | Consumer Euler rotation, in radians.                                             |
| `scale`    | R3F group scale    | `[1, 1, 1]` | Consumer scale.                                                                  |
| `center`   | `boolean`          | `false`     | Moves the oriented bounds center to the local origin before consumer transforms. |
| `edges`    | `boolean`          | `true`      | Shows or hides ordinary and conditional LDraw edges for this instance.           |

### Loading and errors

Pending model and color configuration requests suspend to the nearest React `Suspense` boundary. A network or HTTP error, HTML response, empty document, unresolved external geometry reference, or MPD with no renderable geometry throws an error containing the source URL. Place a React error boundary above the Canvas to show an error state. To retry, reset that boundary and remount the component; failed source entries are evicted. Consumers own the Canvas, fallback UI, and retry controls.

The component supports self-contained MPD input only. It does not resolve arbitrary external LDraw parts libraries. Syntax diagnostics are limited to those reported by the upstream Three.js loader. Importing the package is safe in Node without `window`, `document`, or a WebGL context; this does not promise server rendering of a Canvas or model.
