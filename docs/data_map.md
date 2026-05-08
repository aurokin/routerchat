# RouterChat Data Map

This document maps all data stored in the application, describing what data is stored, its purpose, and where it persists.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RouterChat Application                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Client Layer                                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │   │
│  │  │   Chat UI   │  │  Settings   │  │     Components              │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┬───────────────┘  │   │
│  └─────────┼────────────────┼────────────────────────┼──────────────────┘   │
│            │                │                        │                       │
│            ▼                ▼                        ▼                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Storage Adapter Layer                            │   │
│  │              (Unified interface: StorageAdapter)                     │   │
│  │                                                                   │   │
│  │  ┌───────────────────────────────┐  ┌───────────────────────────┐  │   │
│  │  │   LocalStorageAdapter         │  │   ConvexStorageAdapter    │  │   │
│  │  │   (IndexedDB + localStorage)  │  │   (Cloud - signed-in)     │  │   │
│  │  └───────────────┬───────────────┘  └─────────────┬─────────────┘  │   │
│  └──────────────────┼─────────────────────────────────┼────────────────┘   │
│                     │                                 │                     │
│            ┌────────┴────────┐              ┌────────┴────────┐           │
│            │   IndexedDB     │              │     Convex      │           │
│            │   (Browser)     │              │   (Cloud DB)    │           │
│            └─────────────────┘              └─────────────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Platform implementations**

- **Web**: `LocalStorageAdapter` → IndexedDB + localStorage
- **Cloud**: `ConvexStorageAdapter` → Convex DB + `_storage` files

## Storage Locations Summary (Web)

| Data Type          | Web Local Storage                        | Cloud Storage                          | Syncs?    |
| ------------------ | ---------------------------------------- | -------------------------------------- | --------- |
| **Chats**          | IndexedDB `chats`                        | Convex `chats`                         | Yes       |
| **Messages**       | IndexedDB `messages`                     | Convex `messages`                      | Yes       |
| **Attachments**    | IndexedDB `attachments`                  | Convex `_storage` + `attachments`      | Yes       |
| **Skills**         | localStorage `routerchat-skills`         | Convex `skills` (localId preserved)    | Yes       |
| **Skill Settings** | localStorage (separate local/cloud keys) | **NOT STORED IN CONVEX**               | No        |
| **API Key**        | localStorage (plaintext)                 | Convex `users` (encrypted AES-256-GCM) | Optional  |
| **UI Preferences** | localStorage                             | Not stored                             | No        |
| **Sync State**     | localStorage                             | Not stored                             | No        |
| **User Profile**   | Not stored                               | Convex `users`                         | Auth only |

---

## Local vs Convex: Clear Distinctions

### Data Ownership Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Data Ownership Model                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    LOCAL-ONLY DATA                                   │   │
│  │  (Always stored in browser, never synced to cloud)                  │   │
│  │                                                                       │   │
│  │  • UI Preferences (theme, default model, thinking, search)          │   │
│  │  • Skill Settings (local-only + cloud-enabled stored locally)        │   │
│  │    - Each mode keeps its own local preferences                       │   │
│  │  • Sync State (local-only/cloud-enabled/cloud-disabled)             │   │
│  │  • Sync Metadata (last sync time, migration status)                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SYNCED DATA                                       │   │
│  │  (Stored in both local and cloud, cloud is authoritative)           │   │
│  │                                                                       │   │
│  │  • Chats              → Convex `chats` (preserves localId)          │   │
│  │  • Messages           → Convex `messages` (preserves localId)       │   │
│  │  • Attachments        → Convex `_storage` + `attachments`           │   │
│  │  • Skills             → Convex `skills` (preserves localId)         │   │
│  │    - Skills preserve localId so cross-device references work        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CLOUD-ONLY DATA                                   │   │
│  │  (Stored only in Convex, not in local browser)                      │   │
│  │                                                                       │   │
│  │  • User Profile (name, email, image from OAuth)                     │   │
│  │  • Encrypted API Key (encrypted in Convex, not in local)            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Variable/Field Ownership Reference

#### `chats` - SYNCED

| Field         | Local (IndexedDB) | Cloud (Convex)        | Notes       |
| ------------- | ----------------- | --------------------- | ----------- |
| `id`          | ✓ (UUID)          | → stored as `localId` | Primary key |
| `title`       | ✓                 | ✓                     |             |
| `modelId`     | ✓                 | ✓                     |             |
| `thinking`    | ✓                 | ✓                     |             |
| `searchLevel` | ✓                 | ✓                     |             |
| `createdAt`   | ✓                 | ✓                     |             |
| `updatedAt`   | ✓                 | ✓                     |             |
| `userId`      | ✗                 | ✓ (Convex Id)         | Cloud-only  |
| `_id`         | ✗                 | ✓ (Convex Id)         | Cloud-only  |

#### `messages` - SYNCED

| Field            | Local (IndexedDB)   | Cloud (Convex)          | Notes                           |
| ---------------- | ------------------- | ----------------------- | ------------------------------- |
| `id`             | ✓ (UUID)            | → stored as `localId`   | Primary key                     |
| `sessionId`      | ✓ (local chat UUID) | → references by localId |                                 |
| `role`           | ✓                   | ✓                       |                                 |
| `content`        | ✓                   | ✓                       |                                 |
| `contextContent` | ✓                   | ✓                       |                                 |
| `thinking`       | ✓                   | ✓                       |                                 |
| `skill`          | ✓ (cloned object)   | ✓ (serialized)          |                                 |
| `modelId`        | ✓                   | ✓                       |                                 |
| `thinkingLevel`  | ✓                   | ✓                       |                                 |
| `searchLevel`    | ✓                   | ✓                       |                                 |
| `attachmentIds`  | ✓                   | ✓                       | Array of local attachment UUIDs |
| `createdAt`      | ✓                   | ✓                       |                                 |
| `userId`         | ✗                   | ✓ (Convex Id)           | Cloud-only                      |
| `chatId`         | ✗                   | ✓ (Convex Id)           | Cloud-only                      |
| `_id`            | ✗                   | ✓ (Convex Id)           | Cloud-only                      |

#### `skills` - SYNCED

| Field         | Local (localStorage) | Cloud (Convex)        | Notes       |
| ------------- | -------------------- | --------------------- | ----------- |
| `id`          | ✓ (UUID)             | → stored as `localId` | Primary key |
| `name`        | ✓                    | ✓                     |             |
| `description` | ✓                    | ✓                     |             |
| `prompt`      | ✓                    | ✓                     |             |
| `createdAt`   | ✓                    | ✓                     |             |
| `userId`      | ✗                    | ✓ (Convex Id)         | Cloud-only  |
| `_id`         | ✗                    | ✓ (Convex Id)         | Cloud-only  |

**Note**: Skills sync to Convex but preserve `localId`. This means the same skill created on different devices will have the same `localId` after cloning, allowing cross-device references to work.

#### `skillSettings` - LOCAL ONLY (MODE-SEPARATED)

| Field               | Local (localStorage)                                                                                            | Cloud (Convex) | Notes              |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | -------------- | ------------------ |
| `defaultSkillId`    | Local key `routerchat-default-skill` (local-only), `routerchat-cloud-default-skill` (cloud-enabled)             | ✗              | Can be null        |
| `selectedSkillId`   | Local key `routerchat-selected-skill-id` (local-only), `routerchat-cloud-selected-skill-id` (cloud-enabled)     | ✗              | Can be null        |
| `selectedSkillMode` | Local key `routerchat-selected-skill-mode` (local-only), `routerchat-cloud-selected-skill-mode` (cloud-enabled) | ✗              | Defaults to "auto" |

**Rationale for Local-Only, Mode-Separated**:

- Skill preferences are device-specific and should not sync.
- Local-only and cloud-enabled modes keep independent preferences.
- Convex complexity is reduced by removing the `skillSettings` table.

**Mode Switching Behavior**:

- Switching modes reads/writes the corresponding key set.
- No automatic copy between modes; each mode keeps its last-used settings.
- Legacy `routerchat-selected-skill` only migrates into local-only keys.

**Null Behavior**:
| Setting | When null | UI Behavior |
|---------|-----------|-------------|
| `defaultSkillId` | No default | User must explicitly select |
| `selectedSkillId` | No selection | Auto mode with no specific skill |
| `selectedSkillMode` | Defaults to "auto" | Auto mode active |


#### `users` - CLOUD ONLY

| Field                           | Local | Cloud (Convex)                | Notes              |
| ------------------------------- | ----- | ----------------------------- | ------------------ |
| `name`                          | ✗     | ✓                             | From OAuth         |
| `image`                         | ✗     | ✓                             | From OAuth         |
| `email`                         | ✗     | ✓                             | From OAuth         |
| `emailVerificationTime`         | ✗     | ✓                             |                    |
| `phone`                         | ✗     | ✓                             |                    |
| `phoneVerificationTime`         | ✗     | ✓                             |                    |
| `isAnonymous`                   | ✗     | ✓                             |                    |
| `initialSync`                   | ✗     | ✓                             | Migration flag     |
| `encryptedApiKey`               | ✗     | ✓ (encrypted)                 | AES-256-GCM        |
| `apiKeyNonce`                   | ✗     | ✓ (encrypted)                 |                    |
| `apiKeyUpdatedAt`               | ✗     | ✓                             |                    |
| `createdAt`                     | ✗     | ✓                             |                    |
| `updatedAt`                     | ✗     | ✓                             |                    |
| `_id`                           | ✗     | ✓                             | Convex primary key |

#### UI Preferences - LOCAL ONLY

| Key                           | Storage      | Value Type                | Description        |
| ----------------------------- | ------------ | ------------------------- | ------------------ |
| `routerchat-theme`            | localStorage | "light"\|"dark"\|"system" | Theme preference   |
| `routerchat-default-model`    | localStorage | string                    | Default model ID   |
| `routerchat-favorite-models`  | localStorage | string[]                  | Favorite model IDs |
| `routerchat-default-thinking` | localStorage | ThinkingLevel             | Default thinking   |
| `routerchat-default-search`   | localStorage | SearchLevel               | Default search     |

#### API Key Storage

| Field                | Local (localStorage) | Cloud (Convex)  | Notes           |
| -------------------- | -------------------- | --------------- | --------------- |
| `routerchat-api-key` | ✓ (plaintext)        | ✗               | Local mode only |
| `encryptedApiKey`    | ✗                    | ✓ (AES-256-GCM) | Cloud mode only |
| `apiKeyNonce`        | ✗                    | ✓               | Cloud mode only |

#### Sync State - LOCAL ONLY

| Key                        | Storage      | Value Type   | Description                                     |
| -------------------------- | ------------ | ------------ | ----------------------------------------------- |
| `routerchat-sync-state`    | localStorage | SyncState    | "local-only"\|"cloud-enabled"\|"cloud-disabled" |
| `routerchat-sync-metadata` | localStorage | SyncMetadata | JSON object                                     |

---

## Local Storage (Browser)

### 1. IndexedDB - `routerchat` Database

**Purpose**: Primary local storage for chat data, messages, and image attachments.

**Database Version**: 4

#### 1.1 `chats` Object Store

| Field         | Type          | Local | Cloud       | Description                 |
| ------------- | ------------- | ----- | ----------- | --------------------------- |
| `id`          | string        | ✓     | → `localId` | Local UUID (primary key)    |
| `title`       | string        | ✓     | ✓           | Chat title                  |
| `modelId`     | string        | ✓     | ✓           | OpenRouter model identifier |
| `thinking`    | ThinkingLevel | ✓     | ✓           | Thinking config             |
| `searchLevel` | SearchLevel   | ✓     | ✓           | Search enabled              |
| `createdAt`   | number        | ✓     | ✓           | Unix timestamp              |
| `updatedAt`   | number        | ✓     | ✓           | Unix timestamp              |

**Indexes**:

- `by-updated`: Sorts by `updatedAt` descending

**Operations** (`apps/web/src/lib/db.ts`):

- `createChat(chat)` - Save new chat
- `getChat(id)` - Retrieve chat by ID
- `getAllChats()` - Get all chats, sorted by updated date
- `updateChat(chat)` - Update existing chat
- `deleteChat(id)` - Delete chat and cascade delete messages/attachments

#### 1.2 `messages` Object Store

| Field            | Type                              | Local | Cloud        | Description                       |
| ---------------- | --------------------------------- | ----- | ------------ | --------------------------------- |
| `id`             | string                            | ✓     | → `localId`  | Local UUID (primary key)          |
| `sessionId`      | string                            | ✓     | → by localId | Reference to parent chat          |
| `role`           | "user" \| "assistant" \| "system" | ✓     | ✓            | Message author                    |
| `content`        | string                            | ✓     | ✓            | Displayed content                 |
| `contextContent` | string                            | ✓     | ✓            | Actual content sent to API        |
| `thinking`       | string \| undefined               | ✓     | ✓            | Model reasoning                   |
| `skill`          | Skill \| null                     | ✓     | ✓            | Snapshot of skill at message time |
| `modelId`        | string \| undefined               | ✓     | ✓            | Model used                        |
| `thinkingLevel`  | ThinkingLevel \| undefined        | ✓     | ✓            | Thinking config snapshot          |
| `searchLevel`    | SearchLevel \| undefined          | ✓     | ✓            | Search config snapshot            |
| `attachmentIds`  | string[] \| undefined             | ✓     | ✓            | References to attachments         |
| `createdAt`      | number                            | ✓     | ✓            | Unix timestamp                    |

**Indexes**:

- `by-session`: Sorts by `sessionId`
- `by-created`: Sorts by `createdAt`

#### 1.3 `attachments` Object Store

| Field       | Type                | Local | Cloud        | Description                 |
| ----------- | ------------------- | ----- | ------------ | --------------------------- |
| `id`        | string              | ✓     | → `localId`  | Local UUID (primary key)    |
| `messageId` | string              | ✓     | → by localId | Reference to parent message |
| `type`      | "image"             | ✓     | ✓            | Attachment type             |
| `mimeType`  | ImageMimeType       | ✓     | ✓            | JPEG/PNG/GIF/WebP           |
| `data`      | string              | ✓     | → `_storage` | Base64-encoded image        |
| `width`     | number              | ✓     | ✓            | Image width                 |
| `height`    | number              | ✓     | ✓            | Image height                |
| `size`      | number              | ✓     | ✓            | File size in bytes          |
| `createdAt` | number              | ✓     | ✓            | Unix timestamp              |
| `purgedAt`  | number \| undefined | ✓     | ✓            | Soft-delete marker          |

**Indexes**:

- `by-message`: Sorts by `messageId`
- `by-created`: Sorts by `createdAt` ascending

**Storage Limits**:

- Max image size: 4MB per image
- Max session storage: 50MB per conversation
- Max total storage: 500MB

---

### 2. localStorage Keys

#### 2.1 Authentication & API Keys

| Key                  | Local | Cloud | Type   | Description                    |
| -------------------- | ----- | ----- | ------ | ------------------------------ |
| `routerchat-api-key` | ✓     | ✗     | string | OpenRouter API key (plaintext) |

#### 2.2 UI Preferences (LOCAL ONLY)

| Key                           | Local | Cloud | Type                      | Description        |
| ----------------------------- | ----- | ----- | ------------------------- | ------------------ |
| `routerchat-theme`            | ✓     | ✗     | "light"\|"dark"\|"system" | Theme preference   |
| `routerchat-default-model`    | ✓     | ✗     | string                    | Default model ID   |
| `routerchat-favorite-models`  | ✓     | ✗     | string[]                  | Favorite model IDs |
| `routerchat-default-thinking` | ✓     | ✗     | ThinkingLevel             | Default thinking   |
| `routerchat-default-search`   | ✓     | ✗     | SearchLevel               | Default search     |

#### 2.3 Skills (SYNCED)

| Key                 | Local | Cloud    | Type    | Description  |
| ------------------- | ----- | -------- | ------- | ------------ |
| `routerchat-skills` | ✓     | → Convex | Skill[] | Saved skills |

#### 2.4 Skill Settings (LOCAL ONLY - per mode)

| Key                                    | Local | Cloud | Type             | Description                           |
| -------------------------------------- | ----- | ----- | ---------------- | ------------------------------------- |
| `routerchat-default-skill`             | ✓     | ✗     | string \| null   | Default skill ID (local-only mode)    |
| `routerchat-selected-skill-id`         | ✓     | ✗     | string \| null   | Selected skill (local-only mode)      |
| `routerchat-selected-skill-mode`       | ✓     | ✗     | "auto"\|"manual" | Mode (local-only mode)                |
| `routerchat-cloud-default-skill`       | ✓     | ✗     | string \| null   | Default skill ID (cloud-enabled mode) |
| `routerchat-cloud-selected-skill-id`   | ✓     | ✗     | string \| null   | Selected skill (cloud-enabled mode)   |
| `routerchat-cloud-selected-skill-mode` | ✓     | ✗     | "auto"\|"manual" | Mode (cloud-enabled mode)             |

**Note**: Skill settings never sync to Convex; each mode keeps its own local keys.

#### 2.5 Cloud Sync State (LOCAL ONLY)

| Key                        | Local | Cloud | Type         | Description          |
| -------------------------- | ----- | ----- | ------------ | -------------------- |
| `routerchat-sync-state`    | ✓     | ✗     | SyncState    | Current sync mode    |
| `routerchat-sync-metadata` | ✓     | ✗     | SyncMetadata | Sync metadata object |

**SyncMetadata Structure**:

```typescript
{
  syncState: "local-only" | "cloud-enabled" | "cloud-disabled",
  lastSyncAt: number | null,
  cloudUserId: string | null,
  migrationCompletedAt: number | null
}
```

---

## Convex Cloud Storage

### Convex Schema (`packages/convex/convex/schema.ts`)

```
┌─────────────────────────────────────────────────────────────────┐
│                        users table                    [CLOUD]   │
├─────────────────────────────────────────────────────────────────┤
│ _id: Id<users>                                    [Convex only]│
│ name?: string                                     [Convex only]│
│ image?: string                                    [Convex only]│
│ email?: string                                    [Convex only]│
│ emailVerificationTime?: number                    [Convex only]│
│ phone?: string                                    [Convex only]│
│ phoneVerificationTime?: number                    [Convex only]│
│ isAnonymous?: boolean                             [Convex only]│
│ initialSync: boolean                              [Convex only]│
│ encryptedApiKey?: string          [Cloud only - encrypted]      │
│ apiKeyNonce?: string           [Cloud only - encrypted]         │
│ apiKeyUpdatedAt?: number                          [Convex only]│
│ createdAt?: number                                [Convex only]│
│ updatedAt?: number                                [Convex only]│
└─────────────────────────────────────────────────────────────────┘
        │
        │ SYNCED (preserves localId)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                        chats table                    [SYNCED]  │
├─────────────────────────────────────────────────────────────────┤
│ _id: Id<chats>                                     [Convex only]│
│ userId: Id<users>                                  [Convex only]│
│ localId?: string                              [LOCAL → CLOUD]│
│ title: string                                    [SYNCED]       │
│ modelId: string                                  [SYNCED]       │
│ thinking: string                                 [SYNCED]       │
│ searchLevel: string                              [SYNCED]       │
│ createdAt: number                                [SYNCED]       │
│ updatedAt: number                                [SYNCED]       │
└─────────────────────────────────────────────────────────────────┘
        │
        │ SYNCED (preserves localId)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                       messages table                  [SYNCED]  │
├─────────────────────────────────────────────────────────────────┤
│ _id: Id<messages>                                  [Convex only]│
│ userId: Id<users>                                  [Convex only]│
│ chatId: Id<chats>                                  [Convex only]│
│ localId?: string                              [LOCAL → CLOUD]│
│ role: "user" | "assistant" | "system"            [SYNCED]       │
│ content: string                                  [SYNCED]       │
│ contextContent: string                           [SYNCED]       │
│ thinking?: string                                [SYNCED]       │
│ skill?: any                                      [SYNCED]       │
│ modelId?: string                                 [SYNCED]       │
│ thinkingLevel?: string                           [SYNCED]       │
│ searchLevel?: string                             [SYNCED]       │
│ attachmentIds?: string[]                         [SYNCED]       │
│ createdAt: number                                [SYNCED]       │
└─────────────────────────────────────────────────────────────────┘
        │
        │ SYNCED (preserves localId, file in _storage)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      attachments table               [SYNCED]  │
├─────────────────────────────────────────────────────────────────┤
│ _id: Id<attachments>                               [Convex only]│
│ userId: Id<users>                                  [Convex only]│
│ messageId: Id<messages>                            [Convex only]│
│ localId?: string                              [LOCAL → CLOUD]│
│ type: "image"                                     [SYNCED]       │
│ mimeType: string                                  [SYNCED]       │
│ storageId: Id<_storage>              [Cloud file storage ref]   │
│ width: number                                     [SYNCED]       │
│ height: number                                    [SYNCED]       │
│ size: number                                      [SYNCED]       │
│ purgedAt?: number                                 [SYNCED]       │
│ createdAt: number                                 [SYNCED]       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        skills table                   [SYNCED]  │
├─────────────────────────────────────────────────────────────────┤
│ _id: Id<skills>                                    [Convex only]│
│ userId: Id<users>                                  [Convex only]│
│ localId?: string                              [LOCAL → CLOUD]│
│ name: string                                    [SYNCED]       │
│ description: string                              [SYNCED]       │
│ prompt: string                                   [SYNCED]       │
│ createdAt: number                                [SYNCED]       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   skillSettings (removed)        [NO TABLE]   │
│                 (Settings live in localStorage)               │
└─────────────────────────────────────────────────────────────────┘
```

### Convex File Storage

Images are stored in Convex's built-in file storage (`_storage` table) and referenced by `attachments.storageId`.

---

## Data Flow Diagrams

### Sync State Machine

```
                              ┌─────────────────┐
                              │                 │
                              │   local-only    │◄─────────────────────────┐
                              │  (Default)      │                          │
                              │                 │                          │
                              └────────┬────────┘                          │
                                       │                                   │
                                       │ User enables                      │
                                       │ cloud sync                        │
                                       │ (requires                          │
                                       │  sign-in)                         │
                                       ▼                                   │
                              ┌─────────────────┐                          │
                              │                 │                          │
                    ┌────────►│ cloud-enabled   │─────────┐                │
                    │         │                 │         │                 │
                    │         └────────┬────────┘         │                 │
                    │                  │                  │                 │
                    │                  │ User disables    │                 │
                    │                  │ cloud sync       │                 │
                    │                  ▼                  │                 │
                    │         ┌─────────────────┐         │                 │
                    │         │                 │         │                 │
                    │         │ cloud-disabled  │─────────┘                 │
                    │         │ (graceful       │                           │
                    │         │  degradation)   │                           │
                    │         │                 │                           │
                    │         └─────────────────┘                           │
                    │                                                      │
                    │ User re-enables                                      │
                    │ cloud sync                                           │
                    │ (restores cloud-mode        │                 │
                    │  skill settings)            │                 │
                    └──────────────────────────────────────────────────────┘

Skill Settings Behavior:
┌──────────────────────────────────────────────────────────────────────┐
│ local-only  → cloud-enabled:  Switch to cloud-specific local keys    │
│ cloud-enabled → cloud-disabled: Switch back to local-only keys       │
│ cloud-disabled → cloud-enabled: Restore cloud-specific local keys    │
│                                                                      │
│ Key: Settings stay local, but each mode has its own key set          │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Skill Settings (Mode-Separated)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Skill Settings Data Flow                           │
│                   (Stored locally per sync mode)                        │
└─────────────────────────────────────────────────────────────────────────┘

User changes skill selection
        │
        ▼
┌──────────────────────────┐
│  StorageAdapter          │
│  upsertSkillSettings()   │
└──────────┬───────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐  ┌────────────────────────┐
│ Local  │  │ Convex                 │
│        │  │                        │
│ Calls: │  │ Calls:                 │
│        │  │ storage (cloud keys)   │
│ storage│  │                        │
│ .setX()│  │                        │
└────────┘  └────────────────────────┘
            │
            ▼
    ┌──────────────────────────────────────┐
    │  localStorage                        │
    │                                      │
    │ local-only keys:                     │
    │  - routerchat-default-skill          │
    │  - routerchat-selected-skill-id      │
    │  - routerchat-selected-skill-mode    │
    │                                      │
    │ cloud-enabled keys:                  │
    │  - routerchat-cloud-default-skill    │
    │  - routerchat-cloud-selected-skill-id│
    │  - routerchat-cloud-selected-skill-  │
    │    mode                              │
    └──────────────────────────────────────┘

Mode Switch:
┌─────────────────────────────────────────┐
│  Switching modes picks the matching     │
│  key set without overwriting the other  │
└─────────────────────────────────────────┘
```

---

## Storage Adapters

### StorageAdapter Interface

```typescript
interface StorageAdapter {
    // Chats - SYNCED
    createChat(chat: ChatSession): Promise<string>;
    getChat(id: string): Promise<ChatSession | undefined>;
    getAllChats(): Promise<ChatSession[]>;
    updateChat(chat: ChatSession): Promise<void>;
    deleteChat(id: string): Promise<void>;

    // Messages - SYNCED
    createMessage(message: Message): Promise<string>;
    updateMessage(message: Message): Promise<void>;
    getMessagesByChat(chatId: string): Promise<Message[]>;
    deleteMessagesByChat(chatId: string): Promise<void>;
    deleteMessage(id: string): Promise<void>;

    // Attachments - SYNCED
    saveAttachment(attachment: Attachment): Promise<string>;
    saveAttachments(attachments: Attachment[]): Promise<string[]>;
    getAttachment(id: string): Promise<Attachment | undefined>;
    getAttachmentsByMessage(messageId: string): Promise<Attachment[]>;
    deleteAttachment(id: string): Promise<void>;
    deleteAttachmentsByMessage(messageId: string): Promise<void>;

    // Storage Stats
    getImageStorageUsage(): Promise<number>;
    getStorageUsage(): Promise<{ bytes; messageCount; sessionCount }>;

    // Skills - SYNCED
    getSkills(): Promise<Skill[]>;
    createSkill(skill: Skill): Promise<string>;
    updateSkill(skill: Skill): Promise<void>;
    deleteSkill(id: string): Promise<void>;

    // Skill Settings - LOCAL ONLY (mode-separated)
    getSkillSettings(): Promise<SkillSettings>;
    upsertSkillSettings(settings: SkillSettingsUpdate): Promise<void>;
}
```

### LocalStorageAdapter (`apps/web/src/lib/sync/local-adapter.ts`)

- **Chats/Messages/Attachments**: Writes to IndexedDB via `db.ts`
- **Skills**: Writes to localStorage via `storage.ts`
- **Skill Settings**: Reads/writes local-only keys in localStorage
- Used in `local-only` and `cloud-disabled` states

### ConvexStorageAdapter (`apps/web/src/lib/sync/convex-adapter.ts`)

- **Chats/Messages/Attachments/Skills**: Writes to Convex, preserves `localId`
- **Skill Settings**: Reads/writes cloud-specific localStorage keys
- Maintains ID mapping cache (localId ↔ ConvexId)
- Used only in `cloud-enabled` state with a signed-in user.

---

## Migration: Skill Settings to Local-Only (Mode-Separated)


**Summary**:

- `skillSettings` table removed from Convex schema
- ConvexStorageAdapter uses cloud-specific localStorage keys
- LocalStorageAdapter continues using local-only keys
- No Convex migration or purge; settings remain local only

---

## Quota Management

### Local Quota

| Resource        | Limit |
| --------------- | ----- |
| Total IndexedDB | 500MB |
| Per Image       | 4MB   |
| Per Session     | 50MB  |

### Cloud Quota

| Resource      | Limit |
| ------------- | ----- |
| Image Storage | 1GB   |

---

## Data Security

### API Key Encryption

| Mode          | Storage                  | Encryption  |
| ------------- | ------------------------ | ----------- |
| Local-only    | localStorage (plaintext) | None        |
| Cloud-enabled | Convex `users` table     | AES-256-GCM |

---

## Parity Requirements

Changes to data models MUST update:

1. `apps/web/src/lib/sync/local-adapter.ts` - Local implementation
2. `apps/web/src/lib/sync/convex-adapter.ts` - Cloud implementation
3. `packages/convex/convex/schema.ts` - Cloud schema
4. `packages/convex/convex/*.ts` - Cloud mutations/queries

**Note**: Skill settings are LOCAL-ONLY, so no Convex parity is required for them.

---

## File Locations Summary

| Purpose                   | Local Files                                | Cloud Files                                |
| ------------------------- | ------------------------------------------ | ------------------------------------------ |
| IndexedDB schema          | `apps/web/src/lib/db.ts`                   | -                                          |
| localStorage helpers      | `apps/web/src/lib/storage.ts`              | -                                          |
| Storage adapter interface | `apps/web/src/lib/sync/storage-adapter.ts` | -                                          |
| Local adapter             | `apps/web/src/lib/sync/local-adapter.ts`   | -                                          |
| Cloud adapter             | `apps/web/src/lib/sync/convex-adapter.ts`  | -                                          |
| Cloud schema              | -                                          | `packages/convex/convex/schema.ts`         |
| Cloud API                 | -                                          | `packages/convex/convex/*.ts`              |
| Encryption                | -                                          | `packages/convex/convex/lib/encryption.ts` |
| Sync context              | `apps/web/src/contexts/SyncContext.tsx`    | -                                          |
| Migration logic           | `apps/web/src/lib/sync/migration.ts`       | -                                          |
| Types                     | `apps/web/src/lib/types.ts`                | `apps/web/src/lib/sync/convex-types.ts`    |

---

## Legend

| Symbol        | Meaning                                              |
| ------------- | ---------------------------------------------------- |
| ✓             | Stored in this location                              |
| ✗             | NOT stored in this location                          |
| →             | Data flows/transfers to this location                |
| [SYNCED]      | Data exists in both local and cloud                  |
| [LOCAL]       | Data exists only in local storage                    |
| [CLOUD]       | Data exists only in cloud storage                    |
| [Convex only] | Field only exists in Convex, not in local equivalent |
