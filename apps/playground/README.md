# Brickinetic site

One Fumadocs + React Router + Vite + Tailwind application serves the live homepage (`/`), the full tool (`/playground`), and MDX guides/API reference (`/docs/*`). Node 22.22 or later is required for site tooling; the built library retains its plain-Node 22.12 import contract.

Run `pnpm dev` from the workspace root. API tables are generated from TypeScript declarations before site development/build. WebGL code is imported after browser hydration, so prerendering does not initialize a renderer. Documentation is compiled with Fumadocs MDX and search is exported as a static browser-search index.

`pnpm build` produces static files under `apps/playground/dist/client`. Host that directory, preserving route directory indexes and the extensionless `/api/search` JSON resource. `__spa-fallback.html` can serve unknown client routes; the documented routes have their own prerendered HTML. No runtime server is required. `pnpm --filter @brickinetic/playground preview` previews that output.

`pnpm test:browser` builds products and manages three test servers: the real site, a spec-only Vite fixture server for behavioral rendering, and the static production preview. The fixture pages are not production routes or artifacts. Browser tests cover real demo models, error/retry, effects, lifecycle, deep links and static search. Chromium software rendering establishes correctness, not hardware performance.

Demo models and provenance/license files stay under `public/models`; spec fixtures stay under `spec/fixtures`. Do not redistribute demo models as library assets.
