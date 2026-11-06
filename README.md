# Brickinetic

A TypeScript React Three Fiber component for loading LDraw MPD models with automatic part resolution and declarative whole-model motion.

## Workspace

Use Node.js 22.12 or later. The library initializes the Three.js module before R3F to preserve Node 22.12 import compatibility. Behavioral specs run directly from TypeScript source with Node’s test runner and tsx. Type checking uses noEmit and does not depend on product builds.

- `pnpm install` installs workspace dependencies.
- `pnpm dev` starts the playground.
- `pnpm format` formats maintained files with the shared Biome configuration.
- `pnpm check` verifies formatting, import organization, and lint rules; `pnpm lint` runs lint rules alone.
- `pnpm typecheck` checks all maintained source, configuration and specs without compiling product output.
- `pnpm test` runs source behavioral specs through `node:test` and tsx, without an application build.
- `pnpm test:browser` runs Playwright Test specs under `apps/playground/spec` with a managed Vite server and an explicit library build. Install Chromium with `pnpm --filter @brickinetic/playground exec playwright install chromium`.
- `pnpm build` produces library ESM, declarations/assets and the static application.
- `pnpm smoke:node` builds the library and verifies its built public import in plain Node, without a TypeScript loader.
- The historical foundation benchmark and its production entry have been retired; browser specs validate correctness, not hardware performance.

See [packages/brickinetic/README.md](packages/brickinetic/README.md) for the component API.

## MVP loading

Pass an MPD URL to `BrickModel`. Embedded submodels load directly; external parts resolve through the default hosted LDraw library. An optional `partsLibraryPath` selects a custom or self-hosted library. Missing required parts fail the model with an identifiable, recoverable error: users must make the referenced part available and retry, because drawing a model with unresolved dependencies fails. External resolution requires network access and CORS permission; self-contained MPDs remain useful offline when the MPD and color configuration are also available locally. Browser HTTP caching may reuse parts, but Brickinetic does not guarantee offline availability or persist an offline parts cache.

The three OMR demonstration models belong to [the playground](apps/playground/README.md). The npm package distributes color configuration, not demonstration geometry or the full parts library.
