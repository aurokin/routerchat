# W3 · Convex Modernization

**Goal:** every function declares `returns`, hand-rolled scaling code is replaced by official components, security smell fixed, schema simplified. Cloud data is wiped — no migrations needed.

**Wave:** 0 (security fix) → 1 (mechanical) → 2 (components).
**Status:** [~] Wave 0 + Wave 1 shipped. Wave 2 (components) deferred — requires live Convex deployment for codegen.
**Depends on:** W0 (Convex 1.38 bump).

## Current state (from audit)

- All ~30 Convex functions use modern object-form syntax (good).
- ~~**Zero** `returns` validators across all functions.~~ → **All public + internal functions now declare `returns`.**
- ~~`messages.skill: v.any()` schema escape hatch.~~ → **Tightened to `v.union(v.null(), <skill snapshot object>)`.**
- Hand-rolled cloud usage counters in `lib/cloud_usage.ts` (~290 LOC, lots of `as any`). → **`as any` cleaned up; full component replacement deferred.**
- Cascade deletes (`chats.remove`, `messages.deleteByChat`, `users.resetCloudData`, `users.clearAllForUser`) run inside a single mutation — **will hit the transaction budget on large accounts**. Real bug. → **Still present; workpool migration deferred.**
- ~~`apiKey.getApiKey` is a **public query** that returns the plaintext decrypted API key — security smell.~~ → **Replaced with `apiKey.getDecryptedApiKey` action: re-checks identity, audits each access via `apiKeyAccess` table.**
- ~~Indexes have redundant prefixes: `messages.by_chat`, `chats.by_user`, `attachments.by_user`.~~ → **Dropped.**

## Tasks

### Security fix (Wave 0 — landed)

- [x] **`apiKey.getApiKey` → `apiKey.getDecryptedApiKey`**: renamed and converted from public query to action.
- [x] Action re-checks identity via `getAuthUserId` and never exposes plaintext via reactive subscription.
- [x] Internal `getEncryptedApiKey` query + internal `recordApiKeyAccess` mutation back the action.
- [x] New `apiKeyAccess` table (append-only) records each read with `kind` (`read` | `read_failed`) and optional `reason`.
- [x] `returns` validator: `v.union(v.null(), v.string())`.
- [x] Replaced `console.error` paths with structured `ConvexError({ code, message })` for failures, and audit log entries for the success / failure breadcrumb.
- [x] Web client updated:
    - `apps/web/src/hooks/useApiKey.ts` now uses `useQuery(hasApiKey)` + `useAction(getDecryptedApiKey)` and caches the plaintext in component state instead of subscribing to it.
    - `apps/web/src/contexts/SyncContext.tsx` clone-to-local now calls the action.

### Mechanical (Wave 1 — landed)

- [x] `returns` validator added to **all** ~30 functions across `chats`, `messages`, `attachments`, `skills`, `users`, `apiKey`. Used precise `v.id(...)`, `v.union(...)`, `v.object(...)` shapes; doc validators reused per file.
- [x] Replaced `throw new Error(...)` with `ConvexError({ code, message, ...metadata })` in every public mutation/query and in the helpers (`lib/authz.ts`, `lib/limits.ts`, `lib/cloud_usage.ts`). Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `LIMIT_REACHED`, `STORAGE_LIMIT_REACHED`, `ATTACHMENT_*`, `ENCRYPTION_NOT_CONFIGURED`, `FIELD_TOO_LONG`, `FIELD_REQUIRED`, `PAGINATION_STALLED`, `PAGINATION_OVERFLOW`, `STORAGE_NOT_FOUND`.
- [x] Dropped redundant indexes:
    - `messages.by_chat` (prefix of `by_chat_created`) — call sites switched to `by_chat_created`.
    - `chats.by_user` (prefix of `by_user_updated`) — call sites switched to `by_user_updated`.
    - `attachments.by_user` (prefix of `by_user_created`) — call sites switched to `by_user_created`.
- [x] Replaced `messages.skill: v.any()` with `v.optional(v.union(v.null(), v.object({ id, name, description, prompt, createdAt })))` matching the real `Skill` snapshot shape used by the client.
- [x] `auth.ts`: replaced `ctx: { db: any }` and `q: any` helpers with proper `GenericMutationCtx<DataModel>` typing.
- [x] `auth.ts`: replaced `q.filter(q.field())` with `withIndex("by_user_updated"|"by_user", ...)`.
- [x] `users.ts`, `lib/cloud_usage.ts`, `lib/batch.ts`: `as any` callbacks replaced with proper `Doc<...>` types throughout.

### Convex component: aggregate (Wave 2 — DEFERRED)

- [-] **Deferred until next session with active Convex deployment.** Convex codegen for components (`api.components.*`) requires bundling against a live deployment; the OSS workflow has no shared dev deployment to run codegen against. Once `bunx convex dev` connects to a real deployment, this lands cleanly.
- [ ] Install `@convex-dev/aggregate`.
- [ ] Add `convex.config.ts` declaring the component (with named instances per content table).
- [ ] Re-implement cloud usage counters via `TableAggregate` (count + sum, namespaced by `userId`).
- [ ] Delete `packages/convex/convex/lib/cloud_usage.ts` entirely.
- [ ] Remove all `applyCloudUsageDelta` / `ensureCloudUsageCounters` / `rebuildUsageCountersForUser` / `rebuildUsageCountersForEmail` call sites.
- [ ] Remove counter fields from `users` table schema (`cloudChatCount`, `cloudMessageCount`, `cloudAttachmentCount`, etc.).

### Convex component: rate-limiter (Wave 2 — DEFERRED)

- [-] **Deferred for the same codegen reason as aggregate.**
- [ ] Install `@convex-dev/rate-limiter`.
- [ ] Configure rate limiters per resource (token-bucket per user).
- [ ] Replace `LIMITS.maxChatsPerUser` / `maxMessagesPerUser` / `maxSkillsPerUser` count checks in mutations with rate-limiter calls.
- [ ] Slim `packages/convex/convex/lib/limits.ts` down to content-size validators only.

### Convex component: workpool — cascade delete fix (Wave 2 — DEFERRED)

- [-] **Deferred for the same codegen reason as aggregate.**
- [ ] Install `@convex-dev/workpool`.
- [ ] Convert `chats.remove` to enqueue cascade-delete work for messages, attachments belonging to the chat.
- [ ] Convert `messages.deleteByChat`, `users.resetCloudData`, `users.clearAllForUser` likewise.
- [ ] Delete `packages/convex/convex/lib/batch.ts` (`drainBatches`) once workpool replaces it.
- [ ] Add UI feedback for "delete in progress" — these become async; surface state via a query.

### Version bumps (Wave 1)

- [x] `convex` 1.31 → 1.38 (landed in W0).
- [x] `@convex-dev/auth` 0.0.90 → 0.0.92 (landed in W0).
- [x] No re-codegen needed for the mechanical work (schema-driven types flow through TypeScript automatically); component codegen is what's blocked.

## Files affected

- `packages/convex/convex/schema.ts` — added `apiKeyAccess`, tightened `messages.skill`, dropped redundant indexes, kept counter fields pending aggregate adoption.
- `packages/convex/convex/{auth,users,chats,messages,attachments,skills,apiKey}.ts` — full rewrite for `returns`, `ConvexError`, action wrapping.
- `packages/convex/convex/lib/{authz,limits,cloud_usage,batch}.ts` — `ConvexError` migration + type cleanup.
- `apps/web/src/hooks/useApiKey.ts` — switched from reactive query to one-shot action with `hasApiKey` reactive presence flag.
- `apps/web/src/contexts/SyncContext.tsx` — clone-to-local action call.
- `apps/web/src/lib/sync/convex-types.ts` — added `action` method to `ConvexClientInterface`.
- `apps/web/src/lib/sync/__tests__/convex-adapter.test.ts` — mock client now exposes `action`.
- `packages/convex/convex/__tests__/authz-isolation.test.ts` — updated assertions for `ConvexError` `code` payload (`NOT_FOUND` / `FORBIDDEN`).

## Validation

- [x] `bun run typecheck` clean across all 3 workspaces.
- [x] `bun run lint` — 0 errors, 168 warnings (pre-existing tracked debt).
- [x] `bun run test` — all 747 tests pass.
- [x] `bun run --cwd apps/web build` — production build succeeds.
- [ ] Manual smoke against a fresh dev deployment — pending Wave 2 (need `bunx convex dev` to bring up a deployment for the component pieces and to exercise the new audit table).
- [x] `apiKey.getApiKey` is no longer a public query — confirmed by `grep`: only `getDecryptedApiKey` action and `hasApiKey` query remain in the public surface.

## Risks

- Aggregate / rate-limiter / workpool component adoption requires a live Convex dev deployment for codegen. Once available, the deferred tasks should land in a single follow-up commit; nothing in the current code is in a half-finished state.
- Rate limiter token budgets need real-world tuning; start generous, ratchet down based on logs.
- Workpool changes will move cascade-delete from sync to async — UI must reflect "still cleaning up" or users will think the delete failed.
- Component versions evolve fast; pin exact versions in `package.json` once added.
