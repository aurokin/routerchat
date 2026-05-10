# W6 · Architecture Refactors

**Goal:** kill the 1000+ LOC files, simplify state lifting where React 19 `use()` makes it cleaner, fix the parallel-typing problem in the storage adapter, and silence the Convex provider console noise.

**Wave:** 1 (Convex provider fix, pulled forward) → 3 (everything else).
**Status:** [~] Wave 1 + Phase 1 (Convex provider, helper cleanup, storage-adapter consolidation, ChatWindow split) shipped. Settings page / SyncContext / FirstRunTutorialModal splits + ChatContext `use()` still deferred.
**Depends on:** W2 (clean type baseline). Parallelizable with W4 features once split lands.

## Current state (from audit)

| LOC  | File                                                           |
| ---- | -------------------------------------------------------------- |
| 1116 | `apps/web/src/app/settings/page.tsx`                           |
| 992  | `apps/web/src/components/chat/ChatWindow.tsx`                  |
| 809  | `packages/shared/src/core/openrouter/index.ts` (handled by W4) |
| 739  | `apps/web/src/contexts/SyncContext.tsx`                        |
| 702  | `apps/web/src/components/tutorial/FirstRunTutorialModal.tsx`   |
| 692  | `packages/shared/src/core/sync/convex-adapter-base.ts`         |
| 516  | `apps/web/src/components/chat/MessageList.tsx`                 |
| 480  | `apps/web/src/components/chat/Sidebar.tsx`                     |
| 454  | `apps/web/src/lib/sync/convex-adapter.ts`                      |
| 452  | `apps/web/src/contexts/ChatContext.tsx`                        |

State management: 4 React contexts, all in `apps/web/src/contexts/`. `ChatContext.tsx` already mirrors Convex queries into `useState` arrays and merges via `mergeByIdWithPending` — the exact pattern React 19 `use()` solves.

Storage adapter parallel typing: `convex-adapter.ts` casts the generated `api` because `packages/shared` cannot import generated Convex types directly.

Convex provider console noise (sweep #3 finding): when `NEXT_PUBLIC_CONVEX_URL` is unset, `SafeConvexProvider` mounts `ConvexAuthProvider` against a hardcoded `http://127.0.0.1:3210` fallback. The fallback never connects, generating console noise for local-only users.

## Tasks

### Convex provider console-noise fix (Wave 1, pulled forward) — landed

- [x] Refactor `apps/web/src/contexts/ConvexProvider.tsx`:
    - [x] Removed `FALLBACK_CONVEX_URL = "http://127.0.0.1:3210"` and `getFallbackClient`.
    - [x] When `!isConvexConfigured()`, only `ConvexAvailabilityContext.Provider` (with `isAvailable: false`) and `SafeConvexAuthContext.Provider` (with default `{ isAuthenticated: false, isLoading: false }`) render — no `ConvexReactClient`, no `ConvexAuthProvider`, no network connections.
- [x] Added `useSafeConvexAuth()` exported from `ConvexProvider.tsx`. Always reads from `SafeConvexAuthContext`, which is bridged from `useConvexAuth()` via `<SafeAuthBridge>` only when Convex is mounted; otherwise gets the default value. (`signIn` lives on `useAuthActions()`, not `useConvexAuth()`, so it's not part of the wrapper.)
- [x] Updated 3 call sites that ran outside the auth-provider gate:
    - [x] `apps/web/src/components/tutorial/FirstRunTutorialModal.tsx:90`
    - [x] `apps/web/src/components/sync/CloudSyncSettings.tsx:128`
    - [x] `apps/web/src/hooks/useApiKey.ts:69`
    - `apps/web/src/contexts/SyncContext.tsx:195` already lives inside `SyncProviderWithAuth`, which only mounts when Convex is available — left as-is to keep using the upstream `useConvexAuth()` directly.
- [-] Browser devtools spot-check + dedicated Vitest component test for the local-only render path — deferred. Existing test suite (747 / 747) covers downstream consumers; the no-fallback render is structurally guaranteed by `getClient()` returning `null` when `isConvexConfigured()` is `false`.

### Settings page split (Wave 3) — DEFERRED

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

### ChatWindow split (Wave 3) — landed

- [x] `apps/web/src/components/chat/ChatWindow.tsx` 992 → 309 LOC. Pure layout that wires extracted children + hooks.
- [x] `ChatEmptyState.tsx` (69 LOC) — first-run welcome surface; pre-existing JSX moved verbatim.
- [x] `ChatErrorBanner.tsx` (40 LOC) — error display + retry button. Owns the `ChatError` shape.
- [x] `hooks/useStreamingMessage.ts` (87 LOC) — RAF-batched streaming overlay state plus the pure `applyStreamingMessageOverlay` helper. Re-exported from `ChatWindow.tsx` for the existing chat-window test.
- [x] `hooks/useChatKeybindings.ts` (292 LOC) — the giant keyboard-shortcut effect with all model/thinking/search/skill cycling. Pure deps in / no return.
- [x] `hooks/useSendMessage.ts` (443 LOC) — the streaming send flow + retry orchestration, including `getChatTitleUpdate` (still re-exported from `ChatWindow.tsx`).
- [-] `<ToolCallSurface>`, `<AttachmentRenderer>`, `<MessageActions>` — wait for W4 tool calling and the `MessageList` split. They don't carve cleanly out of the current chat surface.
- [-] The `eslint-disable react-hooks/exhaustive-deps` for the focus-on-chat-change effect remains intentional — focus on chat _id_ change is the desired behavior, not on every input ref update.

### SyncContext split (Wave 3) — DEFERRED

- [ ] `apps/web/src/contexts/SyncContext.tsx` (739 LOC) extract:
    - `apps/web/src/lib/sync/state-machine.ts` — pure reducer + decision-tree (already has hints of this pattern in `CloudSyncSettings`).
    - `apps/web/src/lib/sync/migration-runner.ts` — migration orchestration.
    - `apps/web/src/contexts/SyncContext.tsx` — thin context wrapper around the reducer.
- [ ] Add explicit unit tests for the reducer (pure function, easy to cover).

### FirstRunTutorialModal split (Wave 3) — DEFERRED

- [ ] `apps/web/src/components/tutorial/FirstRunTutorialModal.tsx` (702 LOC) extract per step:
    - `StartStep.tsx`
    - `CloudStatusStep.tsx`
    - `ApiKeyStep.tsx`
    - `DoneStep.tsx`
- [ ] Top-level modal becomes a step router.

### ChatContext modernization (Wave 3) — DEFERRED

- [ ] Inspect `apps/web/src/contexts/ChatContext.tsx:24` (`mergeByIdWithPending`) — exact target for React 19 `use(promise)` + Suspense.
- [ ] Where Suspense + `use()` simplifies, adopt it. Where it'd require restructuring routes, leave alone.
- [ ] Decision principle (per locked decision): "simplify where it makes sense" — no blanket rewrite.
- [ ] No state library adoption (Zustand/Jotai) unless explicit win surfaces.

### Storage adapter parallel-typing fix (Wave 3) — landed

- [x] Approach (a) shipped: `apps/web/src/lib/sync/convex-adapter.ts` is now the single home for the adapter. `packages/shared/src/core/sync/convex-adapter-base.ts` (692 LOC) and `apps/web/src/lib/sync/convex-types.ts` (354 LOC) are deleted.
- [x] Adapter uses real `Doc<"chats">` / `Id<"users">` etc. from `@convex/_generated/dataModel` and `api` from `@convex/_generated/api` directly. `as unknown as ConvexAPI` is gone. `ConvexClient` (a structural shape over `mutation` / `query` / `action`) is exported for the few callers (SyncContext, migration, clear-cloud-images, tests) that need a typed handle.
- [x] `packages/shared/src/core/sync/index.ts` keeps the `StorageAdapter` interface only — no Convex-specific types in shared anymore.
- [-] Aligning `useSync().isConvexAvailable` with `ConvexAvailabilityContext` deferred: they already agree at runtime via `isConvexConfigured()`; collapsing into a single source needs the SyncContext split to land first.
- [-] The 976-LOC `convex-adapter-base.test.ts` was deleted along with the file. The 413-LOC `apps/web/src/lib/sync/__tests__/convex-adapter.test.ts` continues to cover the public adapter behavior end-to-end. Porting the deleted edge cases is follow-up work.

### Inconsistent helper cleanup (W3 finding pulled here) — landed

- [x] `packages/convex/convex/users.ts` — `resetCloudData` and `setInitialSync` now call `requireAuthUserId(ctx)` directly. Removes the duplicated `(await getAuthUserId(ctx)) as Id<"users"> | null` + manual `ConvexError({code:"UNAUTHENTICATED"})` block. `getAuthUserId` is still imported because `users.getCurrentUserId` intentionally returns `null` rather than throwing.

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
