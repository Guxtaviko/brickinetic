# Brickinetic — Agent Conventions

## Product
Brickinetic is a TypeScript library for rendering
and animating LDraw models with React Three Fiber.

## Architecture
- Reuse Three.js, R3F, and Drei where appropriate.
- Do not implement a custom LDraw parser.
- Keep the public API minimal.
- Avoid speculative abstractions.
- Preserve future support for piece-level animation.
- Do not expand scope beyond the active OpenSpec change.

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

## Definition of Done
- Requirements implemented.
- Acceptance scenarios verified.
- Typecheck, tests, and build pass.
- Public API changes are documented.
- No unrelated functionality added.
