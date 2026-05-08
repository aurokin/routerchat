/**
 * Cloud Sync Module
 *
 * Exports all sync-related types, utilities, and services.
 */

// Types and constants from shared core
export type {
    SyncState,
    SyncMetadata,
    MigrationProgress,
    CloneProgress,
    CloneOptions,
    MigrationProgressCallback,
    CloneProgressCallback,
} from "@shared/core/sync";

export { DEFAULT_SYNC_METADATA } from "@shared/core/sync";

// Quota constants and types from shared core
export {
    CLOUD_IMAGE_QUOTA,
    LOCAL_IMAGE_QUOTA,
    QUOTA_WARNING_80,
    QUOTA_WARNING_95,
    type QuotaStatus,
    type ConversationStorageUsage,
} from "@shared/core/quota";

// Configuration utilities
export { isConvexConfigured, getConvexUrl, isServer } from "./config";

// Storage adapter
export type {
    StorageAdapter,
    SkillSettings,
    SkillSettingsUpdate,
} from "@shared/core/sync";
export { LocalStorageAdapter, getLocalStorageAdapter } from "./local-adapter";
export { ConvexStorageAdapter } from "./convex-adapter";
