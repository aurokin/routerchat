# Railway Deploy (RouterChat)

This doc describes how `apps/web` can be deployed on Railway.

## Topology

A typical deployment uses two environments:

- `production` environment
    - Service: `routerchat-web`
    - Branch: `master`
    - Domain: your production domain (e.g. `www.example.com`)

- `preview` environment
    - Service: `routerchat-web-preview`
    - Branch: `preview`
    - Domain: your preview domain (e.g. `preview.example.com`)

Convex (when cloud sync is enabled):

- Local dev backend: `dev:<your-dev-deployment>`
- Preview backend: `dev:<your-preview-deployment>`
- Production backend: `prod:<your-production-deployment>`

## Railway Service Commands (Monorepo)

Use `--cwd` for both build and start commands.

- Build: `bun run --cwd apps/web build`
- Start: `bun run --cwd apps/web start`

## Runtime Versions

Pin runtime versions in `.tool-versions` to keep builds stable.

- Node: `22.22.0`
- Bun: `1.3.8`

## Required Railway Environment Variables

Cloud sync is optional. If you are running RouterChat as local-only, no Railway env vars are required for the web service. If you want cloud sync, set:

- `NEXT_PUBLIC_CONVEX_URL=https://<convex-deployment>.convex.cloud`
- Optional: `CANONICAL_HOST=<your-canonical-host>` to redirect non-canonical hosts.

### Set variables via CLI

Recommended: keep local, gitignored `.env.*.local` files in the repo root and apply via scripts.

- Railway vars file: `.env.railway.<env>.local` (applied by `bun run railway:env -- --env <env>`)
- Template: `.env.railway.preview.local.example` / `.env.railway.prod.local.example`

```bash
# Apply preview vars
bun run railway:env -- --env preview

# Apply prod vars
bun run railway:env -- --env prod

# Apply everything that exists for this environment (Railway + Convex)
bun run env:apply -- --env preview --validate
```

## Domains and DNS

Custom domains are attached in Railway; DNS is managed in your registrar of choice. See Railway's docs for the latest required records.

## Troubleshooting

### "No packages matched the filter"

If you see this in Railway build logs:

```
error: No packages matched the filter
```

It means the build/start commands are using `bun run --filter=...` and Bun is not matching.
Switch Railway service commands to `bun run --cwd apps/web ...`.

### Preview stuck at "Loading..." with CSP nonce errors

If your deployment is stuck at **Loading...** and the browser console shows CSP errors like `Content-Security-Policy ... blocked an inline script`, the web app is likely being served from static output while middleware is generating per-request CSP nonces.

Fix:

- Ensure the web app is rendered per-request so Next can attach the nonce to its inline scripts:
    - `apps/web/src/app/layout.tsx` exports `dynamic = "force-dynamic"`
- Redeploy the Railway service after the code change.

Temporary workaround (debug only): set `DISABLE_CSP=true` and redeploy. The other security headers stay in place. Setting `DISABLE_CSP` in production via `bun run railway:env -- --env prod` is refused; use the preview script with `--allow-disable-csp` while debugging.

## Convex env vars and codegen

### Convex environment variables

Convex backend behavior depends on Convex-managed env vars (not Railway vars). The core set used by RouterChat is:

- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- `JWKS`, `JWT_PRIVATE_KEY`
- `ENCRYPTION_KEY`
- `SITE_URL`

Optional anti-abuse knobs (`ROUTERCHAT_MAX_*`) are documented in `README.md`.

`SITE_URL` must match the public base URL for the deployment (used to validate auth redirects).

### Convex codegen in the deploy cycle

- Local development: `bun run --cwd packages/convex dev` runs codegen automatically.
- Deploys: Railway does not need to run Convex codegen as long as `packages/convex/convex/_generated/*` is committed.
- When Convex functions/schema change: run `bun run --cwd packages/convex codegen` and commit the updated `_generated` files.

## Convex deploy automation (GitHub Actions)

This repo includes GitHub Actions workflows to deploy Convex on branch pushes.

- `preview` branch: runs `convex dev --once` against the preview deployment.
- `master` branch: runs `convex deploy` against the production deployment.

Required GitHub Secrets:

- `CONVEX_DEPLOY_KEY_PREVIEW`: deployment key for the preview deployment.
- `CONVEX_DEPLOY_KEY_PROD`: deployment key for the production deployment.

The workflows disable Convex codegen (`--codegen=disable`); generated files must be committed locally.
