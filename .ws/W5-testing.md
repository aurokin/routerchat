# W5 · Testing Infrastructure

**Goal:** real component coverage in Vitest, real E2E in Playwright, dead-code gate via Knip. Bun Test → Vitest migration across all workspaces.

**Wave:** 1 (Vitest migration, Knip wiring) → 2 (component tests, E2E happy paths).
**Status:** not started.
**Depends on:** W0 bumps. Parallelizable with W3 + W4.

## Current state (from audit)

- 747 unit tests (~200ms) via `bun test`.
- Zero E2E / browser / integration tests. No `playwright` / `cypress` / `puppeteer` deps.
- No coverage tooling.
- No dead-code detection.
- Pre-commit `bun test` is commented out.

## Tasks

### Bun Test → Vitest 4 migration
- [ ] Install Vitest 4 + workspace config: `vitest`, `@vitest/coverage-v8`, `@vitest/ui` (devDep).
- [ ] Root-level `vitest.workspace.ts` listing each workspace as a test project.
- [ ] Per-workspace `vitest.config.ts` (or shared via the workspace file).
- [ ] Update test imports: `from "bun:test"` → `from "vitest"`.
- [ ] Update mocks: `mock(...)` from bun:test → `vi.fn()`/`vi.mock()`.
- [ ] Update test scripts: `bun test` → `vitest run`. Keep `bun run test` as the entrypoint name.
- [ ] Add `test:watch` script using `vitest`.
- [ ] Verify all 747 tests still pass under Vitest.
- [ ] Update `bun health` to invoke `vitest run` instead of `bun test`.

### Component tests (jsdom + React Testing Library)
- [ ] Install `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
- [ ] Configure Vitest project for `apps/web` with `environment: "jsdom"` for `*.test.tsx` files.
- [ ] Add a `setup.ts` importing `@testing-library/jest-dom` matchers.
- [ ] Write component tests for the highest-traffic surfaces (target Wave 2):
  - `MessageInput` (paste, attach, send)
  - `MessageList` (rendering, scroll behavior)
  - `ModelSelector` (search, favorites, recommended)
  - `Sidebar` (chat list, hover preview)
  - `ChatWindow` (streaming render, retry on error) — post-W6 split

### MSW for fetch mocking
- [ ] Install `msw`.
- [ ] `tests/mocks/handlers.ts`: shared handlers for OpenRouter endpoints.
- [ ] Vitest setup wires up MSW server.
- [ ] Playwright fixture wires up MSW node server-side (or browser-side via service worker).
- [ ] Replace all hand-rolled `as unknown as Response` casts in `openrouter.test.ts` (31 sites) with real MSW handlers.

### Convex testing
- [ ] Install `convex-test`.
- [ ] Add `packages/convex/vitest.config.ts` with a Convex test project.
- [ ] Migrate existing `convex/__tests__/*.test.ts` to use `convex-test`'s in-memory runtime.
- [ ] Cover at least: auth happy path, chat CRUD, message CRUD, attachment validation, encryption round-trip.

### Playwright E2E (happy paths only)
- [ ] Install `@playwright/test`, `@axe-core/playwright`.
- [ ] `playwright.config.ts` at repo root.
- [ ] `webServer` config: build apps/web (`next build` → `next start`) for stable runs.
- [ ] Three projects: `chromium`, `firefox`, `webkit` (or chromium-only for CI speed; expand later).
- [ ] Happy-path smoke specs in `e2e/`:
  - `local-only.spec.ts`: open app → enter API key → send message → verify streaming → reload, history persists.
  - `cloud-sync.spec.ts`: sign in (mocked at MSW boundary or via test harness) → enable cloud sync → send message → verify Convex round-trip.
  - `settings.spec.ts`: change theme, model default, search default, create skill, edit skill, delete skill.
  - `clone-to-local.spec.ts`: cloud-enabled → clone to local → verify local copy.
- [ ] One axe scan per route in each spec.
- [ ] CI: cache `~/.cache/ms-playwright` keyed on bun.lock + Playwright version.

### E2E test API key
- [ ] Add `apps/web/.env.test.local` (gitignored) for local runs:
  ```
  OPENROUTER_TEST_API_KEY=sk-or-...
  ```
- [ ] CI reads from `secrets.OPENROUTER_TEST_API_KEY`.
- [ ] Add `apps/web/.env.test.local.example` documenting the var.
- [ ] Confirm `.env*.local` gitignore covers it (it does, per existing `.gitignore`).

### Coverage
- [ ] Configure Vitest `v8` coverage provider.
- [ ] Output `coverage/lcov.info`.
- [ ] Report-only initially (no threshold). Print summary in CI.
- [ ] Skip Codecov / Coveralls integration unless requested.

### Knip (dead-code detection)
- [ ] Install `knip`.
- [ ] `knip.config.ts` at root with workspace-aware config (Next.js + Convex plugins).
- [ ] Run once locally; fix findings (orphan files, unused exports, unused deps).
- [ ] Add `bun run knip` to the root health script.
- [ ] Add knip job to CI (`continue-on-error: false`).

### Drop redundant tooling
- [ ] After migration, drop the `bun:test` reliance entirely.
- [ ] Keep `bunx prettier` for formatting (don't migrate format to Biome — Prettier 3 is fine).

## Files affected

- All `*.test.ts` files (~38 files): import + mock migration.
- Root: `vitest.workspace.ts`, `playwright.config.ts`, `knip.config.ts`, `tests/mocks/`.
- Per-workspace: `vitest.config.ts`, `package.json` scripts.
- New `e2e/` directory at root.
- `apps/web/.env.test.local.example` (new).
- `.github/workflows/ci.yml` (E2E job + Knip job).

## Validation

- [ ] Vitest passes all migrated tests.
- [ ] Component tests cover ≥5 high-traffic components.
- [ ] All 4 happy-path E2E specs pass locally with the test API key.
- [ ] Axe finds 0 critical violations on routes.
- [ ] Knip reports clean (no unused exports / orphan files / unused deps).
- [ ] CI green end-to-end.

## Risks

- Bun Test → Vitest migration is mechanical but tedious (38 files); use codemod or scripted sed-replace for the imports.
- jsdom is slower than happy-dom but more compatible; profile if test runtime balloons.
- E2E with a real OpenRouter key costs real money; cap streaming responses with `max_tokens: 64` in test prompts.
- Playwright on CI is the slowest stage; cache aggressively or it'll dominate PR feedback time.

## Smoke-test API key drop

Once W5 lands, place your OpenRouter test key at:

```
apps/web/.env.test.local
```

```
OPENROUTER_TEST_API_KEY=sk-or-...
```

Confirmed gitignored. CI reads from `secrets.OPENROUTER_TEST_API_KEY`.
