# Sync And Cloud Rules

## Required Parity Rules

- Storage parity: if you change data models, CRUD logic, or storage keys, update both adapters:
    - `apps/web/src/lib/sync/local-adapter.ts`
    - `apps/web/src/lib/sync/convex-adapter.ts`
    - Convex schema, mutations, and queries in `packages/convex/convex/`
- Sync migrations: when adding new synced fields, update the `initialSync` migration logic so local data copies to cloud on first enable.
- Local-first support: every feature must work in `local-only` mode unless explicitly cloud-only.
- Cloud fallback: cloud features must degrade gracefully when Convex is unavailable.
- Settings parity: changes to local settings or API key storage must be mirrored in Convex sync and `apps/web/src/hooks/useApiKey.ts`.

## Cloud Sync Notes

- Sync states: `local-only`, `cloud-enabled`, `cloud-disabled`.
- Auth: Google OAuth via Convex Auth. Cloud sync is available to any signed-in user (no payment).
- API key encryption lives in `packages/convex/convex/lib/encryption.ts` and `apps/web/src/hooks/useApiKey.ts`.
- `ENCRYPTION_KEY` is required in Convex for API key sync.
- Update `cloneCloudToLocal` when Convex data expands.

## Migration Runner Pattern

The shared migration runner lives in `packages/shared/src/core/sync/index.ts`.

- Key exports: `runMigration`, `runClone`, `MigrationConfig`, `CloneOptions`, `calculateMigrationProgress`.
- Migration phases: `preparing`, `chats`, `messages`, `attachments`, `complete`.
- The migration runner uses the `StorageAdapter` interface; platform adapters must implement all methods.
- The shared runner handles data transfer logic with progress callbacks.
