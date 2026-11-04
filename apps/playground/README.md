# Playground

The playground demonstrates the three original OMR models and whole-model motion. Choose a model from the selector; it loads immediately.

## Loading and errors

Models resolve external parts from the pinned hosted LDraw library. If a required part is missing, blocked by CORS, or otherwise unavailable, drawing that model fails and the viewport reports the model/part error. Make the missing resource available and retry.

Brickinetic shares parsed model resources by model URL and effective parts-library path while mounted consumers use them. Unused entries are released after a 1000 ms grace period; Three.js separately caches parsed parts per loader. The browser may reuse downloaded parts according to normal HTTP cache rules. There is no durable offline parts cache, so previously loaded models are not guaranteed to work offline. Self-contained MPDs avoid external part requests, but the MPD and LDraw color configuration must still be available locally.

## Motion and rendering

Reduced motion can follow the operating system, always disable motion, or allow motion regardless of the operating-system setting.

See the package [API documentation](../../packages/brickinetic/README.md) and [model provenance and licensing](public/models/README.md).
