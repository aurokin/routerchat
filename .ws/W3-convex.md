# W3 · Convex Modernization

**Goal:** every function declares `returns`, hand-rolled scaling code is replaced by official components, security smell fixed, schema simplified. Cloud data is wiped — no migrations needed.

**Wave:** 0 (security fix) → 1 (mechanical) → 2 (components).
**Status:** not started.
**Depends on:** W0 (Convex 1.38 bump).

## Current state (from audit)

- All ~30 Convex functions use modern object-form syntax (good).
- **Zero** `returns` validators across all functions.
- `messages.skill: v.any()` schema escape hatch.
- Hand-rolled cloud usage counters in `lib/cloud_usage.ts` (~260 LOC, lots of `as any`).
- Cascade deletes (`chats.remove`, `messages.deleteByChat`, `users.resetCloudData`, `users.clearAllForUser`) run inside a single mutation — **will hit the transaction budget on large accounts**. Real bug.
- `apiKey.getApiKey` is a **public query** that returns the plaintext decrypted API key — security smell.
- Indexes have redundant prefixes: `messages.by_chat` (covered by `by_chat_created`), `chats.by_user` (covered by `by_user_updated`), `attachments.by_user` (covered by `by_user_created`).

## Tasks

### Security fix (Wave 0 — land first)
- [ ] **`apiKey.getApiKey`**: rename to make intent explicit (`apiKey.getOwnDecryptedApiKey` or similar).
- [ ] Convert to `internalQuery` exposed via an `action` that re-checks identity.
- [ ] Add audit logging on each call (`internalMutation` writing to a new `apiKeyAccess` table or a Convex log).
- [ ] Add `returns: v.union(v.null(), v.string())` validator.
- [ ] Replace `console.error` with structured `ConvexError({ code, message })`.
- [ ] Update web client call site to use the new action.

### Mechanical (Wave 1)
- [ ] Add `returns` validator to all ~30 functions across `chats`, `messages`, `attachments`, `skills`, `users`, `apiKey`, `auth`. Use `v.id(...)`, `v.union(...)`, `v.object(...)` precisely.
- [ ] Replace `throw new Error(...)` with `ConvexError({ code: "...", message: "..." })` in every public mutation/query.
- [ ] Drop redundant indexes:
  - `messages.by_chat` (prefix of `by_chat_created`)
  - `chats.by_user` (prefix of `by_user_updated`)
  - `attachments.by_user` (prefix of `by_user_created`)
- [ ] Replace `messages.skill: v.any()` with `v.optional(v.union(v.object({...variant1}), v.object({...variant2})))` matching real shapes used by the client.
- [ ] `auth.ts:40-55`: replace `ctx: { db: any }` and `q: any` with proper `MutationCtx` typing.
- [ ] `auth.ts`: replace `q.filter(q.field())` with `withIndex("by_user", q => q.eq("userId", userId))`.
- [ ] `users.getById` & `users.rebuildUsageCountersFor*` → confirm `internalQuery`/`internalMutation` (already correct per audit).

### Convex component: aggregate
- [ ] Install `@convex-dev/aggregate`.
- [ ] Add `convex.config.ts` declaring the component.
- [ ] Re-implement cloud usage counters via the aggregate component (count + sum across users).
- [ ] Delete `packages/convex/convex/lib/cloud_usage.ts` entirely.
- [ ] Remove all `applyCloudUsageDelta` / `ensureCloudUsageCounters` / `rebuildUsageCountersForUser` / `rebuildUsageCountersForEmail` call sites.
- [ ] Remove counter fields from `users` table schema (`cloudChatCount`, `cloudMessageCount`, `cloudAttachmentCount`, etc.).
- [ ] Remove the rebuild operations from any docs / scratch notes.
- [ ] **No backfill needed** — cloud data wiped per locked decision.

### Convex component: rate-limiter
- [ ] Install `@convex-dev/rate-limiter`.
- [ ] Configure rate limiters per resource:
  - `createChat`: token-bucket, e.g. 60/hour per user.
  - `createMessage`: token-bucket, e.g. 600/hour per user.
  - `uploadAttachment`: token-bucket, e.g. 30/hour per user.
  - `createSkill`: token-bucket, e.g. 30/hour per user.
- [ ] Replace `LIMITS.maxChatsPerUser` / `maxMessagesPerUser` / `maxSkillsPerUser` count checks in mutations with rate-limiter calls.
- [ ] Slim `packages/convex/convex/lib/limits.ts` down to content-size validators only (string lengths, byte counts, list caps).
- [ ] Update README env var section: `ROUTERCHAT_MAX_CHATS_PER_USER` etc. become rate-limiter config rather than hard caps; document accordingly.

### Convex component: workpool (cascade delete fix)
- [ ] Install `@convex-dev/workpool`.
- [ ] Convert `chats.remove` to enqueue cascade-delete work for messages, attachments belonging to the chat.
- [ ] Convert `messages.deleteByChat` similarly.
- [ ] Convert `users.resetCloudData` to a workpool-driven sweep.
- [ ] Convert `users.clearAllForUser` likewise.
- [ ] Delete or shrink `packages/convex/convex/lib/batch.ts` (`drainBatches`) once workpool replaces it.
- [ ] Add basic UI feedback for "delete in progress" — these become async; surface state via a query.

### Version bumps (Wave 1, also in W0)
- [ ] `convex` 1.31 → 1.38.
- [ ] `@convex-dev/auth` 0.0.90 → 0.0.92.
- [ ] Re-codegen (`bunx convex codegen`).

## Files affected

- `packages/convex/convex/schema.ts` (drop counter fields, `messages.skill` union, redundant indexes)
- `packages/convex/convex/{auth,users,chats,messages,attachments,skills,apiKey}.ts` (returns, ConvexError, action wrapping)
- `packages/convex/convex/lib/cloud_usage.ts` (delete)
- `packages/convex/convex/lib/limits.ts` (slim)
- `packages/convex/convex/lib/batch.ts` (delete or slim)
- `packages/convex/convex/convex.config.ts` (new)
- `packages/convex/convex/_generated/*` (re-codegen)
- `apps/web/src/lib/sync/convex-adapter.ts` (call-site updates for renamed apiKey function)
- `apps/web/src/hooks/useApiKey.ts` (use action instead of query)
- README.md (limits section reframing)

## Validation

- [ ] `bun run typecheck` in `packages/convex` and `apps/web` clean.
- [ ] Convex tests (`packages/convex/convex/__tests__/*.test.ts`) updated and green.
- [ ] Manual smoke against a fresh dev deployment: signup → create chats/messages/attachments/skills → delete a chat with many messages (verify async cascade completes).
- [ ] `apiKey.getApiKey` is no longer a public query (`grep` the generated `api.d.ts` to confirm).

## Risks

- Aggregate component: schema change is destructive (counter fields removed). Confirm "no backfill" decision is locked before merging.
- Rate limiter token budgets need real-world tuning; start generous, ratchet down based on logs.
- Workpool changes cascade-delete from sync to async — UI must reflect "still cleaning up" or users will think the delete failed.
- Component versions evolve fast; pin exact versions in `package.json`.
