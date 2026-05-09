# W5 · Testing Infrastructure

**Goal:** real component coverage in Vitest, real E2E in Playwright, dead-code gate via Knip. Bun Test → Vitest migration across all workspaces.

**Wave:** 1 (Vitest migration, Knip wiring) → 2 (component tests, E2E happy paths).
**Status:** [x] complete — Wave 1 (Vitest + Knip) and Wave 2 (RTL + MSW + convex-test + Playwright + coverage) all shipped.
**Depends on:** W0 bumps. Parallelizable with W3 + W4.

## Current state (post-Wave-1)

- 747 unit tests now run under Vitest 4 (`vitest run`) — same Bun-driven entrypoint, just a different runner.
- Workspace-aware Vitest config: `vitest.workspace.ts` at the repo root, per-workspace `vitest.config.ts` in each of `apps/web`, `packages/shared`, `packages/convex`.
- Test scripts (`bun run test`) updated in all three workspaces to invoke `vitest run`.
- Knip wired with workspace-aware config; flags unused exports/types and runs in CI as `continue-on-error: true` (informational).
- Removed during Knip cleanup: `apps/web/src/components/chat/ImageViewer.tsx`, `apps/web/src/components/sync/MissingImagePlaceholder.tsx`, `apps/web/src/components/sync/index.ts`, `apps/web/src/lib/sync/index.ts`, `react-hook-form`, `zod`, `eslint-config-next`, `@fsouza/prettierd`.
- Zero E2E / browser / integration tests yet. No `playwright` deps.
- No coverage tooling beyond the `@vitest/coverage-v8` install (config not wired).

## Tasks

### Bun Test → Vitest 4 migration — landed

- [x] Install Vitest 4: `vitest` + `@vitest/coverage-v8` at the repo root.
- [x] Root `vitest.workspace.ts` listing each workspace as a test project.
- [x] Per-workspace `vitest.config.ts` (apps/web, packages/shared, packages/convex). Per-workspace `name` set so reports identify the project.
- [x] `apps/web` config carries the path aliases (`@`, `@shared`, `@convex`) so test files resolve the same way as the production build.
- [x] Test imports migrated: `from "bun:test"` → `from "vitest"` across all 129 files.
- [x] `mock(...)` → `vi.fn(...)`, `mock.module(...)` → `vi.mock(...)`, `ReturnType<typeof mock>` → `ReturnType<typeof vi.fn>` everywhere.
- [x] Workspace test scripts updated: `bun test` → `vitest run`. Root `bun run test` continues to work.
- [x] One CommonJS smoke test (`skeletons.test.ts`) converted from `require()` to `await import(...)` for ESM compatibility.
- [x] Verified: 747 tests pass under Vitest (589 web + 98 shared + 60 convex).
- [x] tsconfigs include `vitest.config.ts` so eslint's `projectService` covers them.

### Knip (dead-code detection) — landed

- [x] Installed `knip` at the root.
- [x] `knip.config.ts` with workspace-aware config: web, shared, convex.
- [x] Ran once, fixed real findings:
    - 4 orphan files deleted.
    - 4 unused dependencies removed (`react-hook-form`, `zod`, `eslint-config-next`, `@fsouza/prettierd`).
    - Tailwind 4 plugins (`tailwindcss`, `@tailwindcss/typography`) listed in `ignoreDependencies` — they're consumed via the CSS `@plugin` / `@import` directives that Knip can't see.
- [x] Root `bun run knip` script.
- [x] CI step added (`continue-on-error: true` for now — 30 unused-export/type findings remain that are mostly API-design "in case someone needs it" rather than true dead code; pruning them is a follow-up).

### Component tests (jsdom + React Testing Library) — landed

- [x] Installed `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- [x] Per-file `// @vitest-environment jsdom` comment for `*.test.tsx` (kept node as the workspace default so SSR-safety tests asserting `typeof window === "undefined"` keep passing).
- [x] `apps/web/vitest.setup.ts` imports `@testing-library/jest-dom/vitest` and runs `cleanup()` after each test.
- [x] Initial RTL coverage:
    - [x] `SearchToggle` — open/close/select/disabled.
    - [x] `ThinkingToggle` — selection + disabled.
    - [x] `ConfirmDialog` — open/close/buttons/keyboard (Escape, Enter).
    - [x] `AttachmentPreview` — empty/processing/render/remove/disabled.
- [-] Larger components (`MessageInput`, `MessageList`, `ModelSelector`, `Sidebar`, `ChatWindow`) deferred until the W6 splits land — heavy context dependencies make per-component tests fragile while the surrounding code is still 700–1000 LOC.

### MSW for fetch mocking — landed (infrastructure)

- [x] Installed `msw` in both `apps/web` and `packages/shared`.
- [x] OpenRouter MSW server with a 599 catch-all so unmocked calls fail loudly:
    - `apps/web/src/test-utils/msw.ts` (web)
    - `packages/shared/src/test-utils/msw.ts` (shared)
- [x] `vitest.setup.ts` wires `setupServer.listen() / resetHandlers / close` in beforeAll/afterEach/afterAll for both workspaces.
- [x] New canonical MSW-based test: `apps/web/src/lib/__tests__/openrouter-msw.test.ts` exercises `fetchModels` + `validateApiKey` through the real fetch path (handlers, attribution headers, status codes).
- [x] Existing 27-cast `apps/web/src/lib/__tests__/openrouter.test.ts` still uses its own `globalThis.fetch` override; the override now happens in `beforeEach` so MSW's `beforeAll` patch doesn't shadow it. Migration of those 27 cases to MSW is mechanical follow-up work — left for a focused pass to keep this loop's diff bounded.

### Convex testing — landed

- [x] Installed `convex-test` in `packages/convex`.
- [x] Two new runtime suites alongside the existing logic-mirror tests:
    - `convex/__tests__/users-runtime.test.ts` — auth gate (`getCurrentUserId` returns null without identity, `users.get` throws `UNAUTHENTICATED`), `setInitialSync` flips the user flag, `rebuildUsageCountersForEmail` recomputes from ground truth.
    - `convex/__tests__/apiKey-runtime.test.ts` — `setApiKey → hasApiKey → clearApiKey` round-trip, `getDecryptedApiKey` returns plaintext and writes a `read` row to `apiKeyAccess` (real schema validators, real index lookups).
- [x] Each suite uses `import.meta.glob("../**/*.{js,ts}")` so `convex-test` can find every Convex module + the `_generated` bundle.
- [-] Migration of the older logic-mirror tests in `convex/__tests__/{users,apiKey}.test.ts` to convex-test is follow-up work; they cover real edge cases the runtime tests haven't replicated yet.

### Playwright E2E (happy paths only) — landed

- [x] Installed `@playwright/test` + `@axe-core/playwright` in `apps/web`.
- [x] `apps/web/playwright.config.ts` — chromium project, `webServer: bun run dev`, `reuseExistingServer` locally / fresh-spawn in CI, base URL configurable via `PLAYWRIGHT_BASE_URL`.
- [x] `apps/web/e2e/local-only.spec.ts` — page loads, no console errors, no critical/serious axe violations.
- [x] `apps/web/e2e/settings.spec.ts` — `/settings` shell renders without authentication.
- [x] `bun run --cwd apps/web test:e2e` (and `test:e2e:install` for the chromium download).
- [x] CI: cache `~/.cache/ms-playwright`, install chromium, run E2E against the production build path. `OPENROUTER_TEST_API_KEY` flows from `secrets` for any future spec that needs it.
- [-] Cloud-sync + clone-to-local happy paths deferred — they need either a live Convex deployment or a Convex mock layer; both are out of scope for this loop.

### E2E test API key — landed

- [x] `apps/web/.env.test.local.example` documents the variable. The real key file is gitignored under the existing `.env*.local` pattern.
- [x] CI reads from `secrets.OPENROUTER_TEST_API_KEY` (referenced in the E2E step). Specs that don't need it skip seamlessly.

### Coverage — landed (report-only)

- [x] V8 coverage provider wired in all 3 workspaces with `text-summary` + `lcov` reporters.
- [x] Each workspace exposes `bun run coverage`; root `bun run coverage` runs all three.
- [x] First run baseline: shared 88% lines, web 28% lines, convex 34% lines (pure logic vs. UI; web climbs as more components get RTL coverage).
- [x] No threshold gating yet — informational only, intentional per the locked decision.

### Remaining Knip findings (Wave 2 cleanup)

- 16 unused exports + 14 unused types — mostly hooks (`useIsDesktop`, `useBreakpoint`), helper functions, and Convex-adapter type aliases that may be deletion candidates. Triage when the surrounding code lands in W6.

### Drop redundant tooling — landed

- [x] Test runtime no longer relies on `bun:test`. `@types/bun` is still pulled in for the runtime globals (Bun.serve etc.); we can drop it once those are migrated too, but it's not blocking.

## Files affected

- All `*.test.ts` / `*.test.tsx` files (~38): import + mock migration.
- New: `vitest.workspace.ts`, three `vitest.config.ts` files, `knip.config.ts`.
- `.github/workflows/ci.yml` — added `Knip` step.
- `package.json` (root + 3 workspaces) — script updates, dep cleanup.

## Validation

- [x] Vitest passes all migrated tests (747 / 747).
- [x] Typecheck clean across all 3 workspaces.
- [x] Lint clean (0 errors, warnings only).
- [x] Web build succeeds.
- [x] `bun run knip` runs and reports informational findings only.
- [ ] Component tests, E2E, coverage thresholds — deferred to Wave 2.

## Risks

- Knip ESM/CJS edge cases: `next.config.ts` and `middleware.ts` get picked up by the apps/web glob, but Knip's redundancy hints noted them as such — current config is intentionally explicit even when redundant (defense against future glob changes).
- Bun → Vitest migration left `@types/bun` in devDeps because the app itself still uses Bun's runtime globals; revisit only if it causes type pollution.

## Smoke-test API key drop

Still documented for the deferred Playwright phase. Place your OpenRouter test key at:

```
apps/web/.env.test.local
```

```
OPENROUTER_TEST_API_KEY=sk-or-...
```

Confirmed gitignored by `.env*.local`. CI will read from `secrets.OPENROUTER_TEST_API_KEY` once Wave 2 wires Playwright.
