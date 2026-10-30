# brickinetic

React Three Fiber component library for LDraw MPD models with automatic part resolution.

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
| `src`      | `string`           | required    | URL of an MPD; embedded and externally resolved geometry are supported.        |
| `partsLibraryPath` | `string` | hosted default | Absolute HTTP(S) or origin-relative root of a LDraw library. |
| `position` | R3F group position | `[0, 0, 0]` | Consumer translation, in LDraw units.                                            |
| `rotation` | R3F group rotation | `[0, 0, 0]` | Consumer Euler rotation, in radians.                                             |
| `scale`    | R3F group scale    | `[1, 1, 1]` | Consumer scale.                                                                  |
| `center`   | `boolean`          | `false`     | Moves the oriented bounds center to the local origin before consumer transforms. |
| `edges`    | `boolean`          | `true`      | Shows or hides ordinary and conditional LDraw edges for this instance.           |
| `motion`   | `MotionConfig`     | omitted     | Configures optional whole-model float and spin presets.                          |

### Motion

`motion` accepts independently configured float and spin presets. Import `MotionConfig`, `FloatMotion`, or `SpinMotion` from `brickinetic` when declaring reusable configuration values:

```tsx
import { BrickModel, type MotionConfig } from 'brickinetic'

const motion: MotionConfig = {
	float: { axis: 'y', amplitude: 0.4, speed: 0.8 },
	spin: { axis: 'y', speed: 0.2 },
}

<BrickModel src='/models/ship.mpd' center motion={motion} />
```

An object enables its preset unless `enabled` is false; omission or `false` disables it. Float supports X, Y and Z axes, defaults to Y, and defaults to amplitude `0.15` local model units and speed `0.8` radians per second. Spin defaults to the Y axis and speed `0.2` radians per second; X and Z are also supported. Both presets start at their identity pose. Speeds may be negative to reverse direction or zero to hold the phase. Amplitude must be finite and nonnegative, and speeds must be finite; invalid values throw an error naming the field.

Float moves along its selected base-local axis using `amplitude × sin(phase)`. Its displacement is affected by the consumer's rotation and scale, so scale also scales the float distance. Spin pivots around the model's local origin, which is the bounds center when `center` is true and the model origin otherwise. The consumer's `position`, `rotation`, and `scale` remain the outer base transform.

Changing an active speed preserves accumulated phase; changing amplitude takes effect at the current phase. Changing either axis resets that preset phase to zero and clears the previous axis offset. Disabling a preset, or reenabling it after it was disabled, restores/restarts it at zero while any other active preset continues. By default, motion follows the system `prefers-reduced-motion` setting, including changes while mounted. Set `reducedMotion: 'never'` to opt out; when the preference API is unavailable, motion proceeds.

Motion uses elapsed frame time. Continuous and demand Canvas loops render it while active; a demand loop is invalidated for motion frames. With R3F's `frameloop="never"`, the consumer must advance the Canvas for motion to progress. Large elapsed intervals, such as returning to a suspended tab, are applied as elapsed time and can produce a visible jump.

### Loading and errors

Pending model and color configuration requests suspend to the nearest React `Suspense` boundary. A network or HTTP error, HTML response, empty document, unresolved external geometry reference, or MPD with no renderable geometry throws an error containing the source URL. Place a React error boundary above the Canvas to show an error state. To retry, reset that boundary and remount the component; failed source entries are evicted. Consumers own the Canvas, fallback UI, and retry controls.

Embedded definitions take precedence. External parts and their nested dependencies are fetched through Three.js’s LDraw resolver from the configured library. If a required part cannot be resolved, the entire model fails to load; no successful partial model is returned. Embed a missing custom part or configure a library containing it. Syntax diagnostics are limited to those reported by the upstream Three.js loader. Importing the package is safe in Node without `window`, `document`, or a WebGL context; this does not promise server rendering of a Canvas or model.


### Parts hosting and custom libraries

The default is `https://raw.githubusercontent.com/kulits/ldraw-parts/f3d0c2256398c28fbb682f4bb08c59eed81fd4f1/ldraw/`, a pinned third-party GitHub raw mirror of The LDraw Parts Library. Pinning stabilizes content, not host availability. The official library endpoint was tested but does not allow the cross-origin browser requests needed by this component. jsDelivr was also tested and rejected because the full mirror exceeds its package-size limit.

```tsx
<BrickModel src='/models/ship.mpd' partsLibraryPath='/ldraw/' center />
```

Host a LDraw library with its `parts/`, `parts/s/`, `p/` (including resolution subfolders), and any required `models/` directories beneath that root. An absolute URL is also accepted; origin-relative paths resolve against the browser origin. Preserve filenames and directory layout. The root must allow cross-origin GETs if hosted on another origin. A model URL on another host likewise requires CORS. No proxy, unofficial-parts service, or complete library is bundled.

Use Suspense for pending loads and an error boundary around the Canvas for failures. Errors name the model and unresolved part, including nested parts. Network errors, unavailable files, invalid responses and host restrictions can all prevent resolution. After supplying the missing resource or repairing the host, reset the error boundary and remount to retry. Different effective library URLs have isolated model caches. Requests are deduplicated for concurrent instances of the same model/library; unused scene resources are released after the last consumer.

The upstream resolver probes multiple directories, so a 404 for one candidate can precede successful resolution elsewhere. Large models make many requests on their first load. Self-contained MPDs need no external geometry requests, but the model and bundled color configuration must still be available locally for offline use. Syntax and extension support follows the installed Three.js loader; arbitrary LDraw extensions, including texture mapping, are not promised.

The supported Three.js range is deliberately limited to r186. A small compatibility adapter observes its dependency cache because this version can otherwise omit failed nested parts. Recheck that adapter before expanding the peer range. OMR demo sources and attribution are documented in the playground; part files retain their own license notices.
