import type { QuotaStatus } from "../quota";

export type SyncState = "local-only" | "cloud-enabled" | "cloud-disabled";

export interface SyncMetadata {
    syncState: SyncState;
    lastSyncAt: number | null;
    cloudUserId: string | null;
    migrationCompletedAt: number | null;
}

export const DEFAULT_SYNC_METADATA: SyncMetadata = {
    syncState: "local-only",
    lastSyncAt: null,
    cloudUserId: null,
    migrationCompletedAt: null,
};

export interface MigrationProgress {
    phase: "preparing" | "chats" | "messages" | "attachments" | "complete";
    current: number;
    total: number;
    currentTable?: string;
    percentage: number;
}

export interface CloneProgress {
    phase: "preparing" | "chats" | "messages" | "attachments" | "complete";
    current: number;
    total: number;
    currentTable?: string;
    percentage: number;
}

export interface CloneOptions {
    textOnly?: boolean;
}

export type { QuotaStatus };
