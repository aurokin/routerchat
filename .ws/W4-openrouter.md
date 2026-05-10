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
- [x]   2. Prompt caching — opt-in `promptCacheEnabled` setting (default off). When on, the request builder emits a single leading system message containing the skill prompt (and search guidance, when search is on) inside a typed-array content block carrying `cache_control: {type: "ephemeral"}`. The send hook strips the inlined skill from the outgoing user content so the cache prefix stays stable across turns; storage shape is unchanged. Cached-token deltas already render in the per-chat usage summary.
- [x]   3. Generation cost reporting — `MessageUsage` persisted on assistant messages; `ChatUsageSummary` aggregates and renders per-chat tokens, optional cost, and cached tokens. `toMessageUsage()` adapts the wire-format `usage` payload to the storage shape. `getGeneration` deferred — inline `usage` from `stream_options.include_usage` already covers the per-chat aggregate use case.
- [~] 4. Structured outputs — wire layer landed: new `ResponseFormat` union (`{type:"json_object"}` | `{type:"json_schema", json_schema:{name, strict?, schema}}`), `response_format?:` on `ChatCompletionRequest`, `responseFormat?:` on `BuildRequestOptions` + `SendMessageOptions`. Callers can opt in programmatically. UI design (per-skill toggle? per-message override? schema editor?) deferred to a follow-up workstream — `useSendMessage` does not yet thread `responseFormat`, so the chat path is unchanged at runtime. JSON parsing stays consumer-side: OpenRouter returns the JSON as a string in `choices[0].message.content`, no library-side parse.
- [x]   5. Reasoning fidelity — full `reasoning_details[]` arrays are now merged across streamed chunks (by `id`, appending text and finalizing format/signature), persisted on assistant messages, and replayed on every follow-up turn. `OpenRouterMessage.reasoning_details` is the wire-format field; the request builder passes it through on assistant messages. Encrypted Anthropic chunks round-trip unchanged so cross-turn reasoning continuity survives.
- [x]   6. Provider routing — new `ProviderPreferences` wire type (`{ sort?: "price" | "throughput" | "latency" }`) on `ChatCompletionRequest`; intentionally narrow, future fields (`order`, `ignore`, `max_price`, etc.) can land additively. Per-user `providerSort` UI setting persists to localStorage (not cloud-synced — matches `promptCacheEnabled` pattern); default `"default"` → no `provider` field emitted (preserves current load-balancing behavior). Settings page exposes a 4-button radiogroup: Default / Cheapest / Fastest / Lowest latency. Request builder takes a `providerSort?: ProviderSort` option; send hook converts the UI sentinel `"default"` → `undefined` at the boundary.
- [~] 7. PDF / document inputs — wire layer landed: new `FileContent` block (`{type:"file", file:{filename, file_data}}`) in the `MessageContent` union (snake_case `file_data` matches the HTTP body), new `FileParserPlugin` / `OpenRouterPlugin` types, and `plugins?: OpenRouterPlugin[]` on `ChatCompletionRequest` (omitted when empty so OpenRouter picks native-or-default automatically). Threaded through `BuildRequestOptions` and `SendMessageOptions`. `buildMessageContent` return type narrowed to `string | Array<TextContent | ImageUrlContent>` to keep its surface stable until the e2e workstream lands. End-to-end PDF attachments through the composer deferred — needs widening `Attachment.type` from `"image"` to `"image" | "file"`, a Convex schema migration of `attachments`, file-picker accepting `.pdf`, non-image preview/render, parser-engine UI control, and per-message PDF size/quota story.
- [x]   8. Image URL passthrough — `Attachment.url` (and `PendingAttachment.url`) carry a remote https/http image URL; `buildMessageContent` prefers the URL over a base64 data URI so the provider fetches the bytes. New `parseImageUrlFromClipboardEvent` clipboard helper matches a single trimmed http(s) URL with a recognised image extension (png/jpg/jpeg/gif/webp/bmp/svg, optional `?query`) and a 2048-char cap; rejects multi-line text, `javascript:`/`data:`/`file:` protocols, and URLs whose extension only appears in the query or fragment. `MessageInput.handlePaste` falls through to URL detection after binary-clipboard check, gated to local-only mode (cloud sync of URL attachments deferred — would require Convex schema migration). `MessageList`/`MessageAttachments`/`AttachmentPreview`/gallery prefer `attachment.url` when set; "Removed" placeholder only triggers when both `data` and `url` are absent. `useSendMessage` propagates the field through both the persistence mapping and the live wire-request mapping.
- [x]   9. `/key` info pane — new `getKeyInfo(apiKey, { signal? })` calls `GET /key`, normalizes the wire envelope into a typed `KeyInfo` (`label` / `usage` / `limit` / `limitRemaining` / `isFreeTier` / `rateLimit?`), and returns `null` on non-OK / network / non-JSON responses. Settings API key card now shows the live metadata on mount (auto-fetch, abortable) and after Validate. Old boolean `validateApiKey` retained for the tutorial liveness path. Race condition between Validate ↔ Clear addressed via a single in-flight `AbortController` ref.
- [x]   10. `/credits` balance — new `getCredits(apiKey, { signal? })` hits `GET /credits`, returns a typed `CreditsInfo` (`totalCredits` / `totalUsage`). Settings card now shows "$N remaining · $X used of $Y" in the valid-key pane, fetched in parallel with `getKeyInfo` via the same `AbortController`. Tri-state (`CreditsInfo | false | null`) distinguishes "tried and failed" (renders "unavailable") from "$0/$0" (renders zeros), addressing the silent-partial-failure ambiguity.

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
