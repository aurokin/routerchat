# W2 · Type-Safety Cleanup

**Goal:** delete every non-test `as any` / `as unknown as`, turn on the strictest viable TypeScript settings, make ESLint actually do type-aware work.

**Wave:** 0–1 (strictness flip in Wave 0; cleanup work in Wave 1).
**Status:** not started.
**Depends on:** W0 (TS 6 bump must land first).

## Current state (from audit)

- 196 hits for `@ts-ignore | @ts-expect-error | as unknown as | as any | : any` across `src` (test files dominate, but ~50 are non-test).
- The strictest `tsconfig.json` is at the **repo root** and is **unused** by build/test (workspaces don't extend it).
- `apps/web/tsconfig.json` has `noImplicitAny: false` (line 16) — actively undermines `strict`.
- All workspaces target `ES2017`, missing `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Nobody enables `exactOptionalPropertyTypes`.
- ESLint flat configs in each workspace; `typescript-eslint` is installed as a devDep but **not registered as a plugin**. `packages/shared` and `packages/convex` ship `rules: {}`.

## Tasks

### tsconfig flip
- [ ] Each workspace `tsconfig.json` `extends` root `tsconfig.json`.
- [ ] Enable `noUncheckedIndexedAccess`.
- [ ] Enable `exactOptionalPropertyTypes`.
- [ ] Enable `noImplicitOverride`.
- [ ] Enable `noFallthroughCasesInSwitch`.
- [ ] Remove `noImplicitAny: false` from `apps/web/tsconfig.json:16`.
- [ ] Bump `target` to `ES2022` (matches Bun + modern Node + Next 16).
- [ ] Add `@total-typescript/ts-reset` package; import in entry points (`apps/web/src/app/layout.tsx`, `packages/shared/src/index.ts`, `packages/convex/convex/index.ts` if needed).

### Shared ESLint config package
- [ ] Create `packages/eslint-config-routerchat/` workspace.
- [ ] Export a flat-config base re-used by all three workspaces.
- [ ] Wire `typescript-eslint` with `parserOptions.projectService: true` (replaces `project: ...`, faster, multi-tsconfig friendly).
- [ ] Plugins: `next/core-web-vitals` (apps/web only), `eslint-plugin-import-x` (Rust resolver), `eslint-plugin-sonarjs` (cognitive complexity), `eslint-plugin-jsx-a11y`.
- [ ] Rules to enable as **error**:
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/no-floating-promises`
  - `@typescript-eslint/consistent-type-imports`
  - `@typescript-eslint/no-misused-promises`
  - `@typescript-eslint/await-thenable`
  - `import-x/no-cycle` (depth: 5)
  - `import-x/no-unresolved`
- [ ] Rules to enable as **warn**:
  - `@typescript-eslint/no-non-null-assertion`
  - `sonarjs/cognitive-complexity` (threshold 15)
  - `complexity` (threshold 10)
- [ ] Existing per-workspace flat configs `extends` the shared base.

### Hotspot cleanup (concrete file list)
- [ ] `packages/convex/convex/users.ts:110-208` — 12 `(message: any) | ctx as any | userId: any` hits. Replace with typed `MutationCtx`/`QueryCtx` and `Doc<"users">`/`Id<"users">`.
- [ ] `packages/convex/convex/lib/cloud_usage.ts:47-259` — 10 `(user as any)[FIELD]` hits. **Vanishes when W3 swaps to `@convex-dev/aggregate`.** Cross-link with W3.
- [ ] `packages/convex/convex/auth.ts:40-55` — `ctx: { db: any }`, `(q: any)`. Replace with `MutationCtx` and typed query builder.
- [ ] `apps/web/src/lib/sync/convex-adapter.ts:32` + 11 cast sites (lines 185–391). The parallel-typing problem; addressed properly in W6 (storage adapter typing fix). For W2, eliminate as many casts as possible without restructure.
- [ ] `apps/web/src/contexts/SyncContext.tsx:196` — `useConvex() as unknown as ConvexClientInterface`. Sibling of the convex-adapter parallel-typing problem.
- [ ] `apps/web/src/components/chat/ModelSelector.tsx:290,344` — keyboard-event-as-mouse-event coercion. Investigate; likely a real handler-typing bug, not a cast.

### eslint-disable cleanup (4 sites)
- [ ] `apps/web/src/components/chat/MessageInput.tsx:292,299` — `react-hooks/exhaustive-deps`. Investigate root cause; either fix deps or convert to a justified `// eslint-disable-line @reason: ...` with explanation.
- [ ] `apps/web/src/components/chat/ChatWindow.tsx:342` — same.
- [ ] `apps/web/src/components/chat/Sidebar.tsx:177` — `react-hooks/set-state-in-effect`.

## Files affected

- All `tsconfig.json` files (root + 3 workspaces, possibly +1 new).
- All `eslint.config.mjs` files (3 workspaces).
- `packages/eslint-config-routerchat/` (new workspace).
- Root `package.json` (add `@total-typescript/ts-reset`, the new shared eslint package).
- Hotspot files listed above.

## Validation

- [ ] After tsconfig flip + ts-reset: `bun run typecheck` per workspace passes.
- [ ] After ESLint wire-up: `bun run lint` per workspace passes (or, if too noisy initially, ratchet by per-rule warnings → errors).
- [ ] `grep -rE "as any|as unknown as|: any" src/` returns < 5 hits in non-test code (target: 0).
- [ ] Cross-check: every `// eslint-disable-*` comment carries a `@reason: ...` justification.

## Risks

- `exactOptionalPropertyTypes` is the noisiest flag — it changes how `?:` properties interact with explicit `undefined`. Expect a triage pass; it surfaces real bugs.
- Type-aware ESLint with `projectService` adds CPU cost on lint runs; budget for slower local lint.
- The convex-adapter typing problem is structural (W6) — W2 is best-effort cleanup, not a full fix.
