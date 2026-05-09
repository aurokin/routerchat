# W4 · OpenRouter Modernization

**Goal:** split the 815-LOC monolith, drop deprecated forms, ship the high-impact features (tool calling, prompt caching, cost reporting, structured outputs).

**Wave:** 1 (split + deprecation fixes) → 2 (features).
**Status:** [~] Wave 1 shipped (split + deprecation). Wave 2 features still open.
**Depends on:** W0 (clean baseline). Parallelizable with W3.

## Current state (post-split)

- Single 815-LOC file replaced by a 9-file structure under `packages/shared/src/core/openrouter/` (see Tasks ↓).
- The 3 parallel SSE parsers are now one (`createSseParser` in `streaming.ts`).
- Dead `OPENROUTER_API_BASE` constant in `apps/web/src/lib/openrouter.ts` removed.
- Web search migrated from deprecated `plugins:[{id:"web", max_results}]` to documented `tools:[{type:"openrouter:web_search", parameters:{...}}]`.
- Custom `reasoning.effort: "xhigh"` is folded to documented `"high"` at the request boundary; UI keeps `"xhigh"` as a distinct user-facing tier.
- Attribution headers `HTTP-Referer` and `X-Title` are now sent on every request.
- `stream_options.include_usage: true` is set on streaming requests so the final SSE chunk carries `usage`.
- Streaming responses now report the **real** `id`, `model`, `created`, `usage`, and `finish_reason` reported by the server. We no longer fabricate `id: "streaming"` or zero-usage placeholders.
- `delta.thinking` legacy branch demoted to defensive fallback only — modern providers send `delta.reasoning_details[]`.

## Tasks

### Split the monolith (Wave 1, no behavior change) — landed

- [x] New file structure under `packages/shared/src/core/openrouter/`:
    ```
    constants.ts          API base URL, attribution constants, web-search system guidance
    types.ts              all request/response types + ReasoningDetailChunk, helpers
    error.ts              OpenRouterApiErrorImpl class
    headers.ts            buildHeaders({apiKey, json}) — bearer + attribution
    streaming.ts          single SSE parser (consolidated 3 parallel impls)
    request-builder.ts    body assembly + buildMessageContent for attachments
    web-search.ts         modern openrouter:web_search server-tool builder
    reasoning.ts          ThinkingLevel → ReasoningEffort mapping, xhigh→high fold
    models.ts             GET /models with vision/text-modality filtering
    key.ts                validateApiKey
    send-message.ts       sendMessage orchestrator + XHR fallback
    index.ts              re-export façade
    ```
- [x] Dead `OPENROUTER_API_BASE` constant in `apps/web/src/lib/openrouter.ts:47` removed.
- [x] All existing tests remain green after the split (assertions updated for the new tools-based shape and real-id streaming behavior).

### Deprecation fixes (Wave 1, surface-visible but minor) — landed

- [x] Migrated `plugins:[{id:"web", max_results}]` → `tools:[{type:"openrouter:web_search", parameters:{max_results, search_context_size}}]`.
- [-] Surface `usage.server_tool_use.web_search_requests` in the cost UI — type plumbing in place (`UsageDetails.server_tool_use`); UI surface deferred to W4 Wave 2 alongside cost reporting.
- [x] Map custom `reasoning.effort: "xhigh"` → documented `"high"` at the request boundary. The UI tier `"xhigh"` is preserved as a distinct user choice.
- [x] Demote `delta.thinking` legacy branch from primary path to defensive fallback (only consulted when `delta.reasoning_details` is absent).
- [x] Add attribution headers `HTTP-Referer: https://github.com/aurokin/routerchat` and `X-Title: RouterChat` to every request (chat completions, models, key, XHR fallback).
- [x] Add `stream_options.include_usage: true` to streaming requests.
- [x] Capture final stream chunk's `usage` (and `id`, `model`, `created`, `finish_reason`) instead of fabricating zero-usage placeholders.
- [x] Stop fabricating `id: "streaming"` — the response carries whatever id the server emitted (empty string when none was streamed).

### High-impact features (Wave 2, ranked by user payoff) — DEFERRED

The Wave 2 feature set carries substantial UI scope (cost badges, tool-call UI, structured-output toggles, provider-routing settings, PDF input handling, key-info pane). They're individually large and need real OpenRouter smoke tests, so they're tracked separately and will land in follow-up commits as each feature's UI design solidifies.

- [ ]   1. Tool calling
- [ ]   2. Prompt caching
- [ ]   3. Generation cost reporting (foundation laid: `UsageDetails.cost`, `cache_discount`, `prompt_tokens_details`; needs `getGeneration` helper + UI)
- [ ]   4. Structured outputs
- [ ]   5. Reasoning fidelity (persist + replay `reasoning_details[]`)
- [ ]   6. Provider routing
- [ ]   7. PDF / document inputs
- [ ]   8. Image URL passthrough
- [ ]   9. `/key` info pane (replace boolean `validateApiKey` with full `getKeyInfo`)
- [ ]   10. `/credits` balance

### Models metadata enrichment — DEFERRED

- [ ] Pull `pricing`, `context_length`, `top_provider.context_length`, `architecture.input_modalities` for `audio` flag, `description`, `expiration_date`, `knowledge_cutoff` from `GET /models`.
- [ ] Surface in the model selector UI.

### Errors — DEFERRED

- [ ] `packages/shared/src/core/errors/index.ts`: add 413 (payload too large) and 422 (unprocessable) per docs.

## Files affected

- `packages/shared/src/core/openrouter/*` — full restructure (12 new files, original `index.ts` shrunk to a re-export façade).
- `apps/web/src/lib/openrouter.ts` — dropped dead constant; otherwise stable façade.
- `apps/web/src/lib/__tests__/openrouter.test.ts` — assertions updated for `tools[]` shape + real-id streaming.
- `packages/shared/src/core/__tests__/openrouter.test.ts` — same.

## Validation

- [x] All 747 existing tests still pass (assertions updated where the wire shape genuinely changed).
- [x] `bun run typecheck` clean across all 3 workspaces.
- [x] `bun run lint` — 0 errors, 168 warnings (pre-existing tracked debt).
- [x] `bun run --cwd apps/web build` — production build succeeds.
- [ ] Manual smoke per feature against a real OpenRouter key — pending (requires running app + valid key).

## Risks

- Tool-call streaming partial-JSON accumulation has historical sharp edges; cover with unit tests for indexed `delta.tool_calls` when feature lands.
- Prompt caching has provider-specific behavior; UI must not over-promise.
- Reasoning sequence preservation is required for tool-use round-trips; if we drop a single chunk, follow-up requests fail.
- Generation `/generation` lookup is async (eventual consistency, ~1-3s lag); UI shouldn't block on it.

## Cited docs

- https://openrouter.ai/docs/api/reference/parameters
- https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- https://openrouter.ai/docs/api/api-reference/generations/get-generation
- https://openrouter.ai/docs/guides/features/tool-calling
- https://openrouter.ai/docs/guides/features/structured-outputs
- https://openrouter.ai/docs/guides/features/server-tools/web-search
- https://openrouter.ai/docs/guides/best-practices/prompt-caching
- https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
- https://openrouter.ai/docs/guides/overview/multimodal/pdfs
- https://openrouter.ai/docs/guides/routing/provider-selection
