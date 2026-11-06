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

| Prop               | Type                              | Default        | Behavior                                                                         |
| ------------------ | --------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `src`              | `string`                          | required       | URL of an MPD; embedded and externally resolved geometry are supported.          |
| `partsLibraryPath` | `string`                          | hosted default | Absolute HTTP(S) or origin-relative root of a LDraw library.                     |
| `position`         | R3F group position                | `[0, 0, 0]`    | Consumer translation, in LDraw units.                                            |
| `rotation`         | R3F group rotation                | `[0, 0, 0]`    | Consumer Euler rotation, in radians.                                             |
| `scale`            | R3F group scale                   | `[1, 1, 1]`    | Consumer scale.                                                                  |
| `center`           | `boolean`                         | `false`        | Moves the oriented bounds center to the local origin before consumer transforms. |
| `edges`            | `boolean`                         | `true`         | Shows or hides ordinary and conditional LDraw edges for this instance.           |
| `motion`           | `MotionConfig`                    | omitted        | Configures optional whole-model float and spin presets.                          |
| `effect`           | `BrickEffectConfig`               | omitted        | Selects assembly or explosion with exactly one progress driver.                  |
| `reducedMotion`    | `'system' \| 'always' \| 'never'` | `'system'`     | Controls ambient motion and assembly translation.                                |

### Controlled construction effects

Use exactly one effect prop and provide exactly one progress source. Numeric
progress is finite and clamped to `[0, 1]`; NaN and infinities throw. Both
effects are deterministic under forward and reverse seeking. Optional playback supplies an internal effect clock.

```tsx
import { BrickModel, createBrickEffectController } from 'brickinetic'

const controller = createBrickEffectController()
controller.setProgress(0.5) // May be set before the model mounts.
<BrickModel src='/models/ship.mpd' center effect={{ type: 'explosion', controller, distance: 24 }} />
// Or: <BrickModel src='/models/ship.mpd' effect={{ type: 'assembly', progress: 0.6,
//   entrance: 'translate', offset: [0, 30, 0], easing: 'smoothstep' }} />
```

Explosion distance and origin, plus assembly offsets, use oriented model-local
LDraw units before centering. Explosion defaults to the assembled bounds center
and a distance multiplier of 1, corresponding to half the longest assembled bounding-box dimension; an origin-coincident unit stays still. Set `distanceMultiplier` to another finite nonnegative multiple of that half-dimension, or set `distance` for an absolute distance in LDraw units. Do not supply both `distance` and `distanceMultiplier`. Assembly divides units
into equal progress stages, ordered by bounds center on Y, then numeric
occurrence path. Axis and direction can be set with `axis` and `direction`.
This is visual ordering, not authored construction order. For N units, unit i
has local progress `clamp(N * progress - i, 0, 1)` and becomes visible only
above zero; exact stage boundaries leave the next unit hidden. Assembly defaults
to instant reveal; translation defaults to zero offset and linear easing, with
`smoothstep` also available. Reduced motion follows the top-level `reducedMotion` prop
(default `system`) and makes assembly reveal the requested stages at baseline;
preference changes apply while mounted. `always` reduces the entrance and
`never` allows it. An unavailable preference API means no reduction. Explicit
explosion remains at the requested pose regardless of preference. A controller
defaults to progress zero, retains progress across unmount, allows one active
binding, and throws if mounted on two effects at once. Manual render loops
still require the consumer to advance the Canvas; demand loops are invalidated
when a controller changes the pose.

### Motion

`motion` accepts independently configured float and spin presets. Import `MotionConfig`, `FloatMotion`, or `SpinMotion` from `brickinetic` when declaring reusable configuration values:

```tsx
import { BrickModel, type MotionConfig } from 'brickinetic'

const motion: MotionConfig = {
	float: { axis: 'y', amplitude: 0.4, speed: 0.8 },
	spin: { axis: 'y', speed: 0.1 },
}

<BrickModel src='/models/ship.mpd' center motion={motion} />
```

An optional object enables its preset; omission disables it. Float supports X, Y and Z axes, defaults to Y, and defaults to amplitude `0.15` local model units and speed `0.8` radians per second. Spin defaults to the Y axis and speed `0.1` radians per second; X and Z are also supported. Both presets start at their identity pose. Speeds may be negative to reverse direction or zero to hold the phase. Amplitude must be finite and nonnegative, and speeds must be finite; invalid values throw an error naming the field.

Float moves along its selected base-local axis using `amplitude × sin(phase)`. Its displacement is affected by the consumer's rotation and scale, so scale also scales the float distance. Spin pivots around the model's local origin, which is the bounds center when `center` is true and the model origin otherwise. The consumer's `position`, `rotation`, and `scale` remain the outer base transform.

Changing an active speed preserves accumulated phase; changing amplitude takes effect at the current phase. Changing either axis resets that preset phase to zero and clears the previous axis offset. Disabling a preset, or reenabling it after it was disabled, restores/restarts it at zero while any other active preset continues. By default, motion follows the system `prefers-reduced-motion` setting, including changes while mounted. Set the top-level `reducedMotion='always'` to disable motion regardless of system preference, or `'never'` to allow motion regardless of preference. `always` does not subscribe to preference changes. Switching from `always` to an allowed policy restarts motion from zero; when the preference API is unavailable, system policy allows motion.

Motion uses elapsed frame time. Continuous and demand Canvas loops render it while active; a demand loop is invalidated for motion frames. With R3F's `frameloop="never"`, the consumer must advance the Canvas for motion to progress. Large elapsed intervals, such as returning to a suspended tab, are applied as elapsed time and can produce a visible jump.

### Loading and errors

Pending model and color configuration requests suspend to the nearest React `Suspense` boundary. A network or HTTP error, HTML response, empty document, unresolved external geometry reference, MPD with no renderable geometry, an unsupported renderable, or a transform that is singular, nonfinite, or has a nonfinite inverse during preparation throws an error containing the source URL. Preparation errors also identify the affected occurrence. Place a React error boundary above the Canvas to show an error state. To retry, correct the source or dependency, reset that boundary and remount the component; failed source entries are evicted. Consumers own the Canvas, fallback UI, and retry controls.

Embedded definitions take precedence. External parts and their nested dependencies are fetched through Three.js’s LDraw resolver from the configured library. If a required part cannot be resolved, the entire model fails to load; no successful partial model is returned. Embed a missing custom part or configure a library containing it. Syntax diagnostics are limited to those reported by the upstream Three.js loader. Importing the package is safe in Node without `window`, `document`, or a WebGL context; this does not promise server rendering of a Canvas or model.

Effects also require finite construction-unit bounds. Unsupported renderable
structures, units without bounds, and singular transforms fail with source and
occurrence context so the source can be corrected and the error boundary reset.


### Parts hosting and custom libraries

The default is `https://raw.githubusercontent.com/kulits/ldraw-parts/f3d0c2256398c28fbb682f4bb08c59eed81fd4f1/ldraw/`, a pinned third-party GitHub raw mirror of The LDraw Parts Library. Pinning stabilizes content, not host availability. The official library endpoint was tested but does not allow the cross-origin browser requests needed by this component. jsDelivr was also tested but still returns HTTP 403 for required Spaceship parts, so it is not a complete source for the supplied models.

```tsx
;<BrickModel src='/models/ship.mpd' partsLibraryPath='/ldraw/' center />
```

Host a LDraw library with its `parts/`, `parts/s/`, `p/` (including resolution subfolders), and any required `models/` directories beneath that root. An absolute URL is also accepted; origin-relative paths resolve against the browser origin. Preserve filenames and directory layout. The root must allow cross-origin GETs if hosted on another origin. A model URL on another host likewise requires CORS. No proxy, unofficial-parts service, or complete library is bundled.

Use Suspense for pending loads and an error boundary around the Canvas for failures. Errors name the model and unresolved part, including nested parts. Network errors, unavailable files, invalid responses and host restrictions can all prevent resolution. After supplying the missing resource or repairing the host, reset the error boundary and remount to retry. Different effective library URLs have isolated model caches. Requests are deduplicated for concurrent instances of the same model/library; unused scene resources are released after the last consumer.

The upstream resolver probes multiple directories, so a 404 for one candidate can precede successful resolution elsewhere. Large models make many requests on their first load. Brickinetic shares parsed model resources by source and effective parts-library path while consumers are mounted, then releases unused resources after a 1000 ms grace period. Three.js also caches parsed parts for the lifetime of each loader. Normal browser HTTP caching may reuse downloaded files, but its behavior depends on the browser and server headers. Brickinetic does not provide durable offline caching or enable Three.js's global cache. Self-contained MPDs need no external geometry requests, but the model and bundled color configuration must still be available locally for offline use. Syntax and extension support follows the installed Three.js loader; arbitrary LDraw extensions, including texture mapping, are not promised.

The supported Three.js range is deliberately limited to r186. A small compatibility adapter observes its dependency cache because this version can otherwise omit failed nested parts. Recheck that adapter before expanding the peer range. OMR demo sources and attribution are documented in the playground; part files retain their own license notices.

Easing is shared by both construction effects: `linear` (default), `smoothstep`, CSS-standard `ease`, `ease-in`, `ease-out`, `ease-in-out`, or a readonly cubic tuple `[x1, y1, x2, y2]`. Coordinates must be finite and X coordinates must be in [0, 1]; Y may overshoot, but evaluated construction progress is clamped. Endpoints are exact. Easing changes per-piece assembly entrance and explosion displacement, without changing ambient float/spin. `BrickEffectEasing` and `BrickEffectConfig` are exported. Explosion `distance` and `distanceMultiplier` are exclusive at both type and runtime levels.

### Effect playback

Use `effect={{ type: 'assembly', playback: { duration: 3, direction: 'forward', repeat: true, hold: 1 } }}` for automatic playback. `playback` is exclusive with `progress` and `controller`. Defaults are three seconds per leg, forward, once, no hold and unpaused. Duration must be positive and finite; hold must be finite and nonnegative. Reverse starts at 1 and ends at 0. Alternate completes 0→1→0, holding at the turnaround; repeated alternate holds both endpoints. Repeated forward/reverse holds at the destination before resetting. Completed playback retains its final pose.

`paused` freezes motion and remaining hold. `onProgress` optionally reports actual normalized progress; store it in a ref when observing frames. Playback starts after loading and excludes hidden-tab time. Changing source, effect type, driver, duration, direction, repeat or hold restarts playback; visual parameters and pause preserve progress. Remount the effect/model to replay; its source cache is reused. Demand mode requests frames while moving and one wake during a hold, then sleeps when paused/complete. Manual `frameloop='never'` stays consumer-advanced. Timers, visibility and preference listeners are cleaned up on unmount.

Automatic playback under reduced motion shows the assembled pose (assembly 1, explosion 0) without repetition. Manual explosion seeking remains spatial, and manual assembly seeking retains reveal stages with translation removed. Allowing motion again restarts automatic playback.

For manual rendering, initialize the consumer Canvas with `frameloop='never'`. In the supported R3F release, switching an actively scheduled demand Canvas to manual mode can deliver a queued RAF timestamp as a seconds delta; coordinate such transitions in the consumer. Brickinetic does not override the Canvas scheduler.
