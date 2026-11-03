# Brickinetic — Agent Conventions

## Product

Brickinetic is a TypeScript library for rendering
and animating LDraw models with React Three Fiber.

## Technology and workspace

- Use the pnpm workspace and Turborepo scripts defined in the root `package.json`.
- The public library lives in `packages/brickinetic`; the Vite playground lives in `apps/playground`.
- Write TypeScript and React components using the existing project and Biome conventions.
- Include every maintained TypeScript file in an editor-discoverable `tsconfig.json` project, directly or through references, with the appropriate Node or browser types. Keep checking and compilation configurations consistent.
- Use the shared root Biome configuration and pinned workspace dependency. Format changed files before finishing; run `pnpm format` for workspace formatting and `pnpm check` to verify formatting, imports, and lint rules.
- Fix TypeScript and Biome diagnostics rather than hiding them with `any`, suppression comments, or disabled rules. Any necessary exception MUST be narrow and explain the concrete constraint.
- Use `spec/` and `*.spec.ts` for behavioral specs. Keep type assertions in the same directory and include them in TypeScript checking.
- Preserve the library's ESM and TypeScript declaration outputs. React, React DOM, React Three Fiber, and Three.js are peer dependencies; do not bundle them into the library.
- Check the declared peer ranges and installed versions before changing integrations or dependencies. The current LDraw compatibility adapter depends on Three.js r186 internals and must be rechecked before expanding that range.
- Keep package imports safe in Node without browser globals or WebGL initialization.

## Playground styling and assets

- Use Tailwind CSS for playground styling. Prefer utility classes in JSX; use `@apply` in CSS for reusable groups when it improves clarity.
- Retain the existing Tailwind Vite integration and theme tokens. Avoid replacing Tailwind with a separate styling system or broad global element rules.
- Preserve accessible labels, keyboard operation, visible focus, reduced-motion support, and responsive layouts.
- Keep demonstration models and their provenance and license information in the playground. Keep spec fixtures in `spec/fixtures/`; do not distribute demo models as library runtime assets.

## Architecture

- Reuse Three.js, R3F, and Drei where appropriate.
- Do not implement a custom LDraw parser.
- Keep the public API minimal.
- Avoid speculative abstractions.
- Preserve future support for piece-level animation.
- Do not expand scope beyond the active OpenSpec change.
- Consumers own the React Three Fiber Canvas and scene. Preserve consumer transforms and render-loop choices.
- Resolve LDraw dependencies through the existing Three.js loader. Preserve embedded-file precedence, configurable parts-library paths, and informative errors for unresolved parts.
- Maintain resource isolation and cleanup, including caching by model source and effective parts-library path.

## Specifications

- Write specifications in English.
- Describe observable behavior, not implementation.
- Use SHALL/MUST for normative requirements.
- Include GIVEN/WHEN/THEN scenarios.
- Include error and edge cases.
- Put architecture decisions in design.md.
- Split implementation into verifiable tasks.

## Implementation

- Read relevant OpenSpec artifacts before coding.
- Verify external APIs and version compatibility.
- Prefer small, focused changes.
- Avoid unrelated refactors.
- Test behavioral changes.
- Validate rendering features in a real browser.
- Report commands executed and their results.
- Document technical limitations explicitly.
- Keep frame updates outside React state and clean up animation and preference subscriptions.
- Document changes to public types, default hosted resources, error and retry behavior, and relevant network or CORS requirements.
- Continue implementation through the authorized task list until its requirements are complete. Do not end a turn merely because a task is large, time-consuming, or has an ordinary implementation error; investigate, fix, and re-verify errors with available tools.
- Pause only when a blocker requires human intervention to make further progress, such as a missing product decision that cannot be inferred, unavailable credentials or external access, or an approval/permission that only the user can grant. A failing test, build, typecheck, formatter, or validation command is not by itself such a blocker; attempt a reasonable repair first.
- When a human-intervention blocker is found, state it plainly and precisely: what is blocked, the evidence and affected task, why available fixes or workarounds cannot resolve it, and exactly what intervention is needed. Report progress and command outcomes transparently; never imply that work is continuing after ending the turn.

## Definition of Done

- Requirements implemented.
- Acceptance scenarios verified.
- Formatting, lint, typecheck, tests, and build pass.
- Run `pnpm check` before finishing and report its result alongside the other applicable checks.
- Run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm smoke:node` when applicable; report results.
- Public API changes are documented.
- No unrelated functionality added.
