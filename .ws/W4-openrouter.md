# W4 · OpenRouter Modernization

**Goal:** split the 809-LOC monolith, drop deprecated forms, ship the high-impact features (tool calling, prompt caching, cost reporting, structured outputs).

**Wave:** 1 (split + deprecation fixes) → 2 (features).
**Status:** not started.
**Depends on:** W0 (clean baseline). Parallelizable with W3.

## Current state (from audit)

- Single 809-LOC file: `packages/shared/src/core/openrouter/index.ts`.
- `apps/web/src/lib/openrouter.ts` is a 47-line re-export shim — keep, but `OPENROUTER_API_BASE:47` is dead code.
- **Three parallel SSE parsers** in the file (`consumeStreamText`, `createSseParser`, `sendMessageWithXhr` with its own copy).
- Endpoints used: `POST /chat/completions`, `GET /models`, `GET /key` (boolean only).
- Wired: streaming, `reasoning.effort` (with custom `xhigh`), `delta.reasoning_details` + legacy `delta.thinking`, image input (base64 only), legacy `plugins:[{id:"web", max_results}]`.
- Not used: tool calling, prompt caching, structured outputs, generation cost lookup, provider routing, fallback `models[]`, PDF input, image URL passthrough, attribution headers.
- Custom `effort: "xhigh"` is not in OpenRouter's documented enum.

## Tasks

### Split the monolith (Wave 1, no behavior change)
- [ ] New file structure under `packages/shared/src/core/openrouter/`:
  ```
  request-builder.ts   request body assembly + headers + attribution
  streaming.ts         single SSE parser (delete the 3 parallel impls)
  models.ts            GET /models, parameter detection
  generation.ts        GET /generation, GET /credits, GET /key (full info)
  types.ts             request/response types, reasoning_details, tool_calls
  cache-control.ts     prompt caching markers
  plugins/
    web-search.ts      modern openrouter:web_search server-tool
    file-parser.ts     PDF/document inputs
    tools.ts           function-call tool registry & loop
  index.ts             re-export façade
  ```
- [ ] Delete dead `OPENROUTER_API_BASE` constant in `apps/web/src/lib/openrouter.ts:47`.
- [ ] All existing tests remain green during the split (no behavior change).

### Deprecation fixes (Wave 1, surface-visible but minor)
- [ ] Migrate `plugins:[{id:"web", max_results}]` → `tools:[{type:"openrouter:web_search", parameters:{max_results, search_context_size, user_location}}]`.
- [ ] Surface `usage.server_tool_use.web_search_requests` in the cost UI.
- [ ] Map custom `reasoning.effort: "xhigh"` → documented `"high"` (Anthropic/Gemini/Qwen tiers also accept reasoning.max_tokens — handle both per provider).
- [ ] Remove `delta.thinking` legacy branch as primary path; keep as defensive fallback only.
- [ ] Add attribution headers `HTTP-Referer: https://github.com/aurokin/routerchat` (or app domain) and `X-Title: RouterChat` to every request.
- [ ] Add `stream_options.include_usage: true` to streaming requests.
- [ ] Capture final stream chunk's `usage` instead of fabricating zero-usage placeholder.
- [ ] Stop fabricating `id: "streaming"` — let the final chunk's id populate the response.

### High-impact features (Wave 2, ranked by user payoff)

#### 1. Tool calling
- [ ] `tools.ts`: tool registry interface (`ToolDefinition` with `name`, `description`, JSON schema).
- [ ] Request injection: when tools are configured, set `tools: [...]` and optional `tool_choice`, `parallel_tool_calls`.
- [ ] Streaming reconstruction: accumulate `delta.tool_calls[i].function.{name, arguments}` by index; partial JSON `arguments` arriving piecewise must be string-concat'd before `JSON.parse`.
- [ ] Tool-result message round-trip: `{role:"tool", tool_call_id, content}` with proper schema.
- [ ] `finish_reason:"tool_calls"` handler: loop instead of finishing.
- [ ] Built-in server-tool support: `openrouter:web_search`, `openrouter:web_fetch`, `openrouter:datetime`, `openrouter:image_generation`.
- [ ] UI surface: tool list in chat composer, per-call result preview, optional "approve before run" mode.
- [ ] Persist tool-call deltas + results on assistant messages so reload reproduces state.

#### 2. Prompt caching
- [ ] `cache-control.ts`: helpers to mark message-content blocks with `cache_control: {type:"ephemeral", ttl:"1h"}`.
- [ ] Strategy: cache long system prompts, cache historical doc context (file inputs), cache skill prompts.
- [ ] Provider-specific awareness:
  - Anthropic / Qwen: explicit breakpoints required.
  - OpenAI / Gemini / DeepSeek / Grok: auto-cache, no markers needed.
- [ ] Surface savings via `usage.prompt_tokens_details.cached_tokens` and `usage.cache_discount`.
- [ ] UI: "🟢 cached N tokens" badge per message; running session total saved.

#### 3. Generation cost reporting
- [ ] Persist `response.id` on every assistant message.
- [ ] `generation.ts`: `getGeneration(id)` calling `GET /generation?id=...`.
- [ ] Returned fields: `total_cost`, `cache_discount`, `native_tokens_{prompt,completion,reasoning,cached}`, `provider_name`, `latency`, `generation_time`.
- [ ] UI: per-message cost badge + provider chip; session aggregate cost.
- [ ] Capture `response.usage.cost` directly when available (newer responses include it inline).

#### 4. Structured outputs
- [ ] Support `response_format: {type:"json_schema", json_schema:{name, strict:true, schema}}` in request builder.
- [ ] Add new `SupportedParameter.StructuredOutputs` flag in `packages/shared/src/core/models/index.ts`.
- [ ] Internal use: skill auto-suggestion, model auto-selection, anything else where the app currently parses free-form text.
- [ ] Optional UI exposure: dev/power-user toggle to constrain output to a JSON schema.

#### 5. Reasoning fidelity
- [ ] Persist `reasoning_details[]` on assistant messages (full structured shape, not just text).
- [ ] Replay unmodified on subsequent turns when continuing a tool-use conversation (per docs, sequence must match).
- [ ] Handle `reasoning.encrypted` opaquely (passthrough only).
- [ ] Add `reasoning.exclude` toggle for users who want hidden reasoning.

#### 6. Provider routing
- [ ] Per-session settings UI: `provider.sort` (`price` | `throughput` | `latency`), `provider.allow_fallbacks`, `provider.zdr`, `provider.max_price`, `provider.only`, `provider.ignore`.
- [ ] Model suffixes: `:nitro` / `:floor` shortcuts.
- [ ] Fallback `models: [...]` array — let users set "if X fails, try Y, then Z".

#### 7. PDF / document inputs
- [ ] Accept `{type:"file", file:{filename, file_data}}` content blocks.
- [ ] `plugins/file-parser.ts`: parser plugin config (`{id:"file-parser", pdf:{engine:"native"|"mistral-ocr"|"cloudflare-ai"}}`). Default to `native` (free).
- [ ] Reuse parsed annotations across turns to avoid reparsing.
- [ ] Attachment validation: extend MIME allowlist to include `application/pdf`.

#### 8. Image URL passthrough
- [ ] `image_url.url` accepts plain HTTPS, not just data URIs.
- [ ] Fast-path attachments that are already cloud-hosted (Convex `_storage` URLs) without re-encoding.

#### 9. `/key` info pane
- [ ] Replace boolean `validateApiKey` with full `getKeyInfo` returning `label`, `usage`, `limit`, `is_free_tier`, `rate_limit.{requests, interval}`.
- [ ] Settings UI: render the key's permissions and current usage.

#### 10. `/credits` balance
- [ ] `generation.ts`: `getCredits()` calling `GET /credits`.
- [ ] Settings UI: show `total_credits - total_usage`; warn when < $1 to prevent 402s.
- [ ] Note: docs call this a Management API key endpoint; gate UI on key type if regular keys 401.

### Models metadata enrichment
- [ ] Pull `pricing` (prompt/completion per-token), `context_length`, `top_provider.context_length`, `architecture.input_modalities` for `audio` flag, `description`, `expiration_date`, `knowledge_cutoff` from `GET /models`.
- [ ] Surface in the model selector UI.

### Errors
- [ ] `packages/shared/src/core/errors/index.ts`: add 413 (payload too large) and 422 (unprocessable) per docs.

## Files affected

- `packages/shared/src/core/openrouter/*` (full restructure — see split layout above).
- `apps/web/src/lib/openrouter.ts` (drop dead constant; otherwise stable façade).
- `packages/shared/src/core/models/index.ts` (`SupportedParameter` enum extensions: `StructuredOutputs`, `Caching`, `File`).
- `packages/shared/src/core/errors/index.ts` (413, 422).
- `apps/web/src/components/chat/*` (tool-call surface, cost badges, cache badges, reasoning UI).
- `apps/web/src/components/settings/*` (key info pane, credits balance, provider routing).
- `packages/convex/convex/messages.ts` (persist `responseId`, `reasoning_details`, `tool_calls`).
- Schema additions on `messages` table.

## Validation

- [ ] All existing tests still pass after the split (Wave 1).
- [ ] New tests for each parser/builder unit added.
- [ ] Manual smoke per feature against a real OpenRouter key:
  - Tool calling: ask the model to use `openrouter:web_search`, verify result lands.
  - Prompt caching: send the same long system prompt twice; verify second has `cached_tokens > 0`.
  - Cost reporting: send a message; check the cost badge matches `/generation` lookup.
  - Structured outputs: request a constrained JSON; verify schema strictness rejects malformed.

## Risks

- Tool-call streaming partial-JSON accumulation has historical sharp edges; cover with unit tests for indexed `delta.tool_calls`.
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
