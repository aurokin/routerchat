# W2 · Type-Safety Cleanup

**Goal:** delete every non-test `as any` / `as unknown as`, turn on the strictest viable TypeScript settings, make ESLint actually do type-aware work.

**Wave:** 0–1 (strictness flip in Wave 0; cleanup work in Wave 1).
**Status:** [x] complete (`as any` hotspots intentionally deferred to W3/W6 where they evaporate cleanly).
**Depends on:** W0 (TS 6 bump must land first).

## Current state (from audit)

- 196 hits for `@ts-ignore | @ts-expect-error | as unknown as | as any | : any` across `src` (test files dominate, but ~50 are non-test).
- The strictest `tsconfig.json` is at the **repo root** and is **unused** by build/test (workspaces don't extend it).
- `apps/web/tsconfig.json` has `noImplicitAny: false` (line 16) — actively undermines `strict`.
- All workspaces target `ES2017`, missing `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. Nobody enables `exactOptionalPropertyTypes`.
- ESLint flat configs in each workspace; `typescript-eslint` is installed as a devDep but **not registered as a plugin**. `packages/shared` and `packages/convex` ship `rules: {}`.

## Tasks

### tsconfig flip

- [-] Workspace tsconfigs do NOT extend root yet — root uses `verbatimModuleSyntax` + `allowImportingTsExtensions` which would cascade many edits. Deferred; flags applied directly per workspace instead.
- [x] Enabled `noUncheckedIndexedAccess` in all 3 workspace tsconfigs.
- [-] `exactOptionalPropertyTypes` deferred — even noisier than `noUncheckedIndexedAccess`; tackle in a follow-up wave once the codebase has settled.
- [x] Enabled `noImplicitOverride` in all 3 workspace tsconfigs.
- [x] Enabled `noFallthroughCasesInSwitch` in all 3 workspace tsconfigs.
- [x] Removed `noImplicitAny: false` from `apps/web/tsconfig.json`.
- [x] Bumped `target` to `ES2022` across all workspaces; `lib` bumped to `ES2022` for shared/convex.
- [x] Added `@total-typescript/ts-reset` via `apps/web/src/lib/ts-reset.d.ts`. Surfaced 5 latent bugs (JSON.parse → unknown propagating to typed sites in `storage.ts`, `db.ts`, `openrouter/index.ts`, `ChatWindow.tsx`); all fixed with proper type assertions or guards.

### Surfaced strictness errors — fixed

- [x] **Source code (16 errors fixed):**
    - `apps/web/src/app/chat/page.tsx`: replaced `chats[0].id` with destructured `const first = chats[0]; if (!first) ...`.
    - `apps/web/src/lib/imageProcessing.ts`: `dataUrl.split(",")[1]` → `dataUrl.split(",")[1] ?? ""`.
    - `apps/web/src/components/chat/ImageGalleryDialog.tsx` + `ImageViewer.tsx`: added `if (!currentImage) return null` guards.
    - `packages/shared/src/core/defaults/index.ts`: `if (!message || message.role !== "user")`.
    - `packages/shared/src/core/quota/index.ts`: `sorted[0]?.id ?? null`.
    - `packages/shared/src/core/text/index.ts`: `(lines[end - 1] ?? "").trim()`.
- [x] **Test files (~95 errors fixed):** automated batch script added non-null assertions (`arr[i]!`) to indexed accesses where the test had already validated length via `expect(...).toHaveLength(N)`. Will be revisited cleanly during W5 Vitest migration.
- [x] Manual fixes for spread-of-possibly-undefined patterns (`{...arr[0]!, ...}`) in `db.test.ts` and `chat.test.ts`.

### ESLint config wiring

- [-] Shared `packages/eslint-config-routerchat/` package skipped — overhead not worth it for 3 workspaces with diverging needs (web has react/jsx-a11y; convex/shared don't). Configs inlined per workspace instead.
- [x] Wired `typescript-eslint` with `parserOptions.projectService: true` in all 3 workspaces.
- [x] `apps/web` plugins: react, react-hooks, jsx-a11y, import-x, sonarjs, @typescript-eslint.
- [x] `packages/shared` and `packages/convex` plugins: import-x, sonarjs, @typescript-eslint.
- [-] `next/core-web-vitals` not extended — its rules duplicate what react/react-hooks already cover; revisit if real Next-specific issues surface.
- [x] All type-aware rules enabled as **warn** (not error) during the refactor — ratchet to error per-rule once the relevant cleanup lands. Current rules:
    - `@typescript-eslint/no-explicit-any` — 50+ existing sites; tracked as warnings.
    - `@typescript-eslint/no-floating-promises` — many React event-handler sites; tracked as warnings.
    - `@typescript-eslint/no-misused-promises` (with `checksVoidReturn: false`).
    - `@typescript-eslint/await-thenable`.
    - `@typescript-eslint/consistent-type-imports` — auto-fixable.
    - `sonarjs/cognitive-complexity` threshold 25 (will tighten to 15 post-W6 splits).
    - `import-x/no-cycle` depth 5.
    - `jsx-a11y/*` recommended set with hot rules demoted to warn.
- [x] **Lint output:** 202 warnings, 0 errors across all 3 workspaces. Health green.

### Hotspot cleanup — deferred to W3 / W6

The bulk of remaining `as any` sites disappear cleanly when their owning workstreams land:

- [-] `packages/convex/convex/lib/cloud_usage.ts` (10 sites) — file deleted in W3 when `@convex-dev/aggregate` lands.
- [-] `packages/convex/convex/users.ts` cascade-iteration callbacks — refactored in W3 alongside workpool migration.
- [-] `packages/convex/convex/{chats,messages,attachments}.ts` iteration callbacks — same.
- [-] `apps/web/src/lib/sync/convex-adapter.ts` (12 sites) — eliminated in W6 by consolidating into a single `apps/web` adapter that imports generated Convex types directly.
- [-] `apps/web/src/contexts/SyncContext.tsx:196` — same; W6 adapter consolidation removes the parallel-typing problem.
- [-] `apps/web/src/components/chat/ModelSelector.tsx:290,344` keyboard-event-as-mouse-event coercion — pulled into W6 ChatWindow split since it's a tracked real-bug suspect.
- [-] `packages/convex/convex/auth.ts:40-55` typed-as-any helpers — addressed in W3 mechanical pass.
- [-] eslint-disable comments (`MessageInput.tsx`, `ChatWindow.tsx`, `Sidebar.tsx`) — tackled during W6 component splits when the surrounding code is restructured.

The `@typescript-eslint/no-explicit-any` warning will surface these on every CI run, so they remain visible until cleared.

## Files affected

- All `tsconfig.json` files (root + 3 workspaces, possibly +1 new).
- All `eslint.config.mjs` files (3 workspaces).
- `packages/eslint-config-routerchat/` (new workspace).
- Root `package.json` (add `@total-typescript/ts-reset`, the new shared eslint package).
- Hotspot files listed above.

## Validation

- [x] tsconfig flip + ts-reset: `bun run typecheck` per workspace passes.
- [x] ESLint wire-up: `bun run lint` passes (warnings only, 0 errors).
- [-] `as any` count goal deferred to W3/W6 closure — they're tracked as ESLint warnings until then.
- [-] eslint-disable justification audit deferred to W6 splits.

## Risks

- `exactOptionalPropertyTypes` is the noisiest flag — it changes how `?:` properties interact with explicit `undefined`. Expect a triage pass; it surfaces real bugs.
- Type-aware ESLint with `projectService` adds CPU cost on lint runs; budget for slower local lint.
- The convex-adapter typing problem is structural (W6) — W2 is best-effort cleanup, not a full fix.
