# W6 · Architecture Refactors

**Goal:** kill the 1000+ LOC files, simplify state lifting where React 19 `use()` makes it cleaner, fix the parallel-typing problem in the storage adapter, and silence the Convex provider console noise.

**Wave:** 1 (Convex provider fix, pulled forward) → 3 (everything else).
**Status:** not started.
**Depends on:** W2 (clean type baseline). Parallelizable with W4 features once split lands.

## Current state (from audit)

| LOC | File |
|---|---|
| 1116 | `apps/web/src/app/settings/page.tsx` |
| 992 | `apps/web/src/components/chat/ChatWindow.tsx` |
| 809 | `packages/shared/src/core/openrouter/index.ts` (handled by W4) |
| 739 | `apps/web/src/contexts/SyncContext.tsx` |
| 702 | `apps/web/src/components/tutorial/FirstRunTutorialModal.tsx` |
| 692 | `packages/shared/src/core/sync/convex-adapter-base.ts` |
| 516 | `apps/web/src/components/chat/MessageList.tsx` |
| 480 | `apps/web/src/components/chat/Sidebar.tsx` |
| 454 | `apps/web/src/lib/sync/convex-adapter.ts` |
| 452 | `apps/web/src/contexts/ChatContext.tsx` |

State management: 4 React contexts, all in `apps/web/src/contexts/`. `ChatContext.tsx` already mirrors Convex queries into `useState` arrays and merges via `mergeByIdWithPending` — the exact pattern React 19 `use()` solves.

Storage adapter parallel typing: `convex-adapter.ts` casts the generated `api` because `packages/shared` cannot import generated Convex types directly.

Convex provider console noise (sweep #3 finding): when `NEXT_PUBLIC_CONVEX_URL` is unset, `SafeConvexProvider` mounts `ConvexAuthProvider` against a hardcoded `http://127.0.0.1:3210` fallback. The fallback never connects, generating console noise for local-only users.

## Tasks

### Convex provider console-noise fix (Wave 1, pulled forward)
- [ ] Refactor `apps/web/src/contexts/ConvexProvider.tsx`:
  - Remove `FALLBACK_CONVEX_URL = "http://127.0.0.1:3210"` and `getFallbackClient`.
  - When `!isConvexConfigured()`, render only `<ConvexAvailabilityContext.Provider value={{ isAvailable: false }}>` — do **not** mount `ConvexAuthProvider` or any client.
- [ ] Create `useSafeConvexAuth()` hook that returns `{ isAuthenticated: false, isLoading: false, signIn: undefined }` when Convex is unavailable, otherwise delegates to `useConvexAuth()`.
- [ ] Update 4 call sites:
  - `apps/web/src/contexts/SyncContext.tsx:195`
  - `apps/web/src/components/tutorial/FirstRunTutorialModal.tsx:90`
  - `apps/web/src/components/sync/CloudSyncSettings.tsx:128`
  - `apps/web/src/hooks/useApiKey.ts:66`
- [ ] Verify in browser devtools: zero network errors when `NEXT_PUBLIC_CONVEX_URL` is unset.
- [ ] Cover with a Vitest component test: render `<SafeConvexProvider>` without env var → no fallback client constructed.

### Settings page split (Wave 3)
- [ ] `apps/web/src/app/settings/page.tsx` (1116 LOC) → thin orchestrator + per-section components in `app/settings/_components/`:
  - `SettingsApiKey.tsx`
  - `SettingsModels.tsx` (default model, favorites, recommended)
  - `SettingsSync.tsx` (cloud sync, clone-to-local)
  - `SettingsSkills.tsx`
  - `SettingsTheme.tsx`
  - `SettingsLocalData.tsx` (export, clear, storage usage)
  - `SettingsAccount.tsx` (sign-in/out, key info pane post-W4)
- [ ] Each component is < 300 LOC.
- [ ] Tabs / accordion stays in the orchestrator.

### ChatWindow split (Wave 3)
- [ ] `apps/web/src/components/chat/ChatWindow.tsx` (992 LOC) extract:
  - `<MessageStream>` — streaming render + reasoning display
  - `<ToolCallSurface>` — tool calls + results (post-W4 tool calling)
  - `<AttachmentRenderer>` — image/PDF preview
  - `<MessageActions>` — copy, retry, edit
  - `<EmptyState>` — first-run prompt
- [ ] Each < 250 LOC.
- [ ] `ChatWindow` becomes a layout/router for these.
- [ ] Resolve the existing `eslint-disable react-hooks/exhaustive-deps` at line 342 as part of the split.

### SyncContext split (Wave 3)
- [ ] `apps/web/src/contexts/SyncContext.tsx` (739 LOC) extract:
  - `apps/web/src/lib/sync/state-machine.ts` — pure reducer + decision-tree (already has hints of this pattern in `CloudSyncSettings`).
  - `apps/web/src/lib/sync/migration-runner.ts` — migration orchestration.
  - `apps/web/src/contexts/SyncContext.tsx` — thin context wrapper around the reducer.
- [ ] Add explicit unit tests for the reducer (pure function, easy to cover).

### FirstRunTutorialModal split (Wave 3)
- [ ] `apps/web/src/components/tutorial/FirstRunTutorialModal.tsx` (702 LOC) extract per step:
  - `StartStep.tsx`
  - `CloudStatusStep.tsx`
  - `ApiKeyStep.tsx`
  - `DoneStep.tsx`
- [ ] Top-level modal becomes a step router.

### ChatContext modernization (Wave 3)
- [ ] Inspect `apps/web/src/contexts/ChatContext.tsx:24` (`mergeByIdWithPending`) — exact target for React 19 `use(promise)` + Suspense.
- [ ] Where Suspense + `use()` simplifies, adopt it. Where it'd require restructuring routes, leave alone.
- [ ] Decision principle (per locked decision): "simplify where it makes sense" — no blanket rewrite.
- [ ] No state library adoption (Zustand/Jotai) unless explicit win surfaces.

### Storage adapter parallel-typing fix (Wave 3)
- [ ] Decide between two approaches:
  - **(a) Move convex-adapter fully into `apps/web/`**: `packages/shared` exports a pure `StorageAdapter` interface; `apps/web` implements both local and convex adapters with full generated-type access. Simpler, drops the `convex-adapter-base.ts` parallel.
  - **(b) Export branded ID types from `packages/convex/_generated`**: shared package consumes them via `@convex-types`. Preserves current 2-package structure but adds a generated-types boundary.
- [ ] Recommendation: (a) — RouterChat is web-only since the mobile app was deleted. Drops 692 LOC + eliminates every `as unknown as ConvexAPI` cast.
- [ ] Confirm decision before executing.
- [ ] Migrate `apps/web/src/lib/sync/convex-adapter.ts` + `packages/shared/src/core/sync/convex-adapter-base.ts` → consolidated `apps/web/src/lib/sync/convex-adapter.ts`.
- [ ] Strip parallel typing from `packages/shared/src/core/sync/storage-adapter.ts` — keep just the interface.
- [ ] Update `useSync().isConvexAvailable` and `ConvexAvailabilityContext` to be the single source of truth (cross-link with the provider fix above).

### Inconsistent helper cleanup (W3 finding pulled here)
- [ ] `packages/convex/convex/users.ts:98-101,217-220` — `resetCloudData` and `setInitialSync` use raw `getAuthUserId` + manual null-check. Replace with `requireAuthUserId` for consistency.

## Files affected

- `apps/web/src/contexts/ConvexProvider.tsx` (refactor, drop fallback).
- `apps/web/src/hooks/useSafeConvexAuth.ts` (new).
- `apps/web/src/contexts/{SyncContext,ChatContext}.tsx` (split + use()).
- `apps/web/src/lib/sync/{state-machine,migration-runner,convex-adapter}.ts` (new + consolidated).
- `packages/shared/src/core/sync/convex-adapter-base.ts` (delete).
- `packages/shared/src/core/sync/storage-adapter.ts` (slim).
- `apps/web/src/app/settings/page.tsx` + new `app/settings/_components/`.
- `apps/web/src/components/chat/ChatWindow.tsx` + new sibling components.
- `apps/web/src/components/tutorial/FirstRunTutorialModal.tsx` + per-step files.

## Validation

- [ ] Every refactored file < 500 LOC (target).
- [ ] Zero `as any` / `as unknown as` in `convex-adapter.ts` post-restructure.
- [ ] Browser devtools console clean when running local-only.
- [ ] All E2E happy-path specs (W5) pass post-refactor.
- [ ] No regressions in unit + component test suites.

## Risks

- Splitting big components risks prop-drilling explosions; check ergonomics before each split.
- React 19 `use(promise)` in client components requires Suspense boundaries; verify rendering boundaries don't trigger thrash.
- Storage adapter consolidation drops the abstraction that allowed mobile reuse — explicit accept (mobile is gone).
- SyncContext reducer extraction may break the tutorial's auto-enable race fix shipped in sweep #3; verify regression tests cover.
