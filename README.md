# Brickinetic

A TypeScript React Three Fiber component for loading LDraw MPD models with automatic part resolution and declarative whole-model motion.

## Workspace

Use Node.js 22.12 or later. The library initializes the Three.js module before R3F to preserve Node 22.12 import compatibility. Scripts and behavioral specs are checked with strict TypeScript and compiled to ignored `.compiled/` directories before execution.

- `pnpm install` installs workspace dependencies.
- `pnpm dev` starts the playground.
- `pnpm format` formats maintained files with the shared Biome configuration.
- `pnpm check` verifies formatting, import organization, and lint rules; `pnpm lint` runs lint rules alone.
- `pnpm build`, `pnpm typecheck`, and `pnpm test` run workspace tasks through Turborepo.

See [packages/brickinetic/README.md](packages/brickinetic/README.md) for the component API.

## MVP loading

Pass an MPD URL to `BrickModel`. Embedded submodels load directly; external parts resolve through the default hosted LDraw library. An optional `partsLibraryPath` selects a custom or self-hosted library. Missing required parts fail the model with an identifiable, recoverable error: users must make the referenced part available and retry, because drawing a model with unresolved dependencies fails. External resolution requires network access and CORS permission; self-contained MPDs remain useful offline when the MPD and color configuration are also available locally. Browser HTTP caching may reuse parts, but Brickinetic does not guarantee offline availability or persist an offline parts cache.

The three OMR demonstration models belong to [the playground](apps/playground/README.md). The npm package distributes color configuration, not demonstration geometry or the full parts library.
