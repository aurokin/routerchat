# RouterChat Refactor Plan

Working set of implementation plans for the post-OSS-launch refactor. These files are the source of truth — update checkboxes and notes as work lands.

**Lifecycle:** committed to track progress; **delete the entire `.ws/` directory before final ship verification** (this is a manual cleanup step at the end).

## Locked decisions

| Decision                          | Choice                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| Spirit                            | Both at once — ambitious (quality + features in parallel)                                      |
| Internal breaking changes         | Free hand. Schema/storage/request shapes can change.                                           |
| Convex components                 | `aggregate`, `rate-limiter`, `workpool`. (Skip `agent` for now.)                               |
| Test runner                       | Vitest everywhere. Bun Test gets fully migrated.                                               |
| Major version bumps               | Yes — TS 5→6, ESLint 9→10, lucide-react 0→1, uuid 13→14, tailwind-merge 2→3. Convex 1.31→1.38. |
| Cloud data preservation           | None. Wipe any existing data. No backfill scripts.                                             |
| State management                  | React 19 `use()` where it simplifies. No state-library adoption unless explicit win.           |
| OpenRouter tool calling           | Yes, full minimum viable tool calling in Wave 2.                                               |
| `@convex-dev/agent`               | Defer. Re-evaluate after tool calling lands.                                                   |
| E2E coverage                      | Happy paths only.                                                                              |
| Convex provider console-noise fix | Pull forward into Wave 1 alongside type-safety cleanup.                                        |
| Bun Test → Vitest migration       | Yes, full migration.                                                                           |

## Workstream index

| ID  | File                  | Status                                                                                      |
| --- | --------------------- | ------------------------------------------------------------------------------------------- |
| W0  | `W0-housekeeping.md`  | [x] complete                                                                                |
| W1  | `W1-quality-gates.md` | [x] complete                                                                                |
| W2  | `W2-type-safety.md`   | [x] complete                                                                                |
| W3  | `W3-convex.md`        | [~] mechanical + security shipped; components deferred (need live deployment)               |
| W4  | `W4-openrouter.md`    | [~] split + deprecation shipped; Wave 2 features deferred (UI scope)                        |
| W5  | `W5-testing.md`       | [x] complete (Wave 1 Vitest + Knip; Wave 2 RTL + MSW + convex-test + Playwright + coverage) |
| W6  | `W6-architecture.md`  | [~] Convex provider fix + helper cleanup shipped; component splits deferred                 |

## Sequencing

**Wave 0 — foundations (must land first):**

- W0 housekeeping (repo verify, major version bumps).
- W1 quality gates (CI, Lefthook, branch protection).
- W3 security fix (`apiKey.getApiKey` hardening).
- W2 strictness flip + ESLint wiring.

**Wave 1 — parallelizable cleanup:**

- W2 cleanup of every `as any` site.
- W3 mechanical (`returns` validators, `ConvexError`, redundant indexes, `messages.skill`).
- W3 version bumps (Convex 1.38, auth 0.0.92).
- W4 split monolith into new file structure (no behavior change yet).
- W5 Vitest migration + Knip wiring.
- W6 Convex provider console-noise fix (pulled forward per locked decision).

**Wave 2 — features and components:**

- W3 components: aggregate, rate-limiter, workpool.
- W4 deprecation fixes + features (caching → cost reporting → tool calling → structured outputs → reasoning fidelity → provider routing → PDF input).
- W5 Playwright happy-path E2E + axe.
- W5 RTL component tests for high-traffic components.

**Wave 3 — architecture polish:**

- W6 component splits (settings page, ChatWindow, FirstRunTutorialModal).
- W6 SyncContext reducer extraction.
- W6 ChatContext → React 19 `use()` where it simplifies.
- W6 Storage adapter typing fix.

## Status legend (use in workstream files)

- `[ ]` not started
- `[~]` in progress
- `[x]` done
- `[!]` blocked (note why)
- `[-]` dropped / decided against (note why)

## E2E smoke API key

Playwright happy-path smoke tests will read a real OpenRouter API key from a gitignored file. Drop the key at:

```
apps/web/.env.test.local
```

```
# apps/web/.env.test.local
OPENROUTER_TEST_API_KEY=sk-or-...
```

The file is gitignored via the existing `.env*.local` pattern. CI uses `secrets.OPENROUTER_TEST_API_KEY` (we'll wire that up in W5).
