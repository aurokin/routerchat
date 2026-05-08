/**
 * Migration Service
 *
 * Handles data migration between local and cloud storage.
 * - migrateLocalToCloud: One-time migration when enabling cloud sync
 * - cloneCloudToLocal: Export cloud data to local for backup/offline use
 * - Uses shared core migration runner for platform-agnostic migration logic
 */

import type { Skill } from "@/lib/types";
import type {
    CloneOptions,
    MigrationProgressCallback,
    CloneProgressCallback,
} from "./types";
import { type StorageAdapter, getDataSummary } from "@shared/core/sync";
import {
    runMigrationWithAdapters,
    runCloneWithAdapters,
} from "@shared/core/sync/migration-helpers";
import { api } from "@convex/_generated/api";
import * as storage from "@/lib/storage";
import { getLocalStorageAdapter } from "./local-adapter";
import type { ConvexClientInterface, ConvexId } from "./convex-types";

/**
 * Migrate all local data to cloud storage.
 *
 * This is a one-time migration that happens when a user first enables cloud sync.
 * After migration, cloud becomes the authoritative source.
 */
export async function migrateLocalToCloud(
    cloudAdapter: StorageAdapter,
    onProgress: MigrationProgressCallback,
    localAdapterOverride?: StorageAdapter,
): Promise<void> {
    const localAdapter = localAdapterOverride ?? getLocalStorageAdapter();

    await runMigrationWithAdapters({
        sourceAdapter: localAdapter,
        targetAdapter: cloudAdapter,
        onProgress,
        config: {
            includeChats: true,
            includeMessages: true,
            includeAttachments: true,
            includeSkills: false,
            includeSkillSettings: false,
            clearTargetFirst: true,
        },
    });
}

export async function migrateSkillsToCloud(
    client: ConvexClientInterface,
    userId: ConvexId<"users">,
): Promise<void> {
    const skills: Skill[] = storage.getSkills();

    for (const skill of skills) {
        await client.mutation(api.skills.create, {
            userId,
            localId: skill.id,
            name: skill.name,
            description: skill.description,
            prompt: skill.prompt,
            createdAt: skill.createdAt,
        });
    }
}

/**
 * Clone all cloud data to local storage.
 *
 * Creates a local backup of cloud data. Cloud remains authoritative.
 */
export async function cloneCloudToLocal(
    cloudAdapter: StorageAdapter,
    onProgress: CloneProgressCallback,
    options: CloneOptions = {},
    cloudApiKey?: string | null,
): Promise<void> {
    const localAdapter = getLocalStorageAdapter();
    const { textOnly = false } = options;
    const shouldSyncApiKey = cloudApiKey !== undefined;

    await runCloneWithAdapters({
        sourceAdapter: cloudAdapter,
        targetAdapter: localAdapter,
        onProgress,
        options: { textOnly },
    });

    if (shouldSyncApiKey) {
        storage.clearApiKey();
        if (cloudApiKey) {
            storage.setApiKey(cloudApiKey);
        }
    }
}

/**
 * Get migration summary statistics.
 */
export interface MigrationSummary {
    chats: number;
    messages: number;
    attachments: number;
    totalBytes: number;
}

export async function getLocalDataSummary(): Promise<MigrationSummary> {
    const localAdapter = getLocalStorageAdapter();
    const summary = await getDataSummary(localAdapter);
    return summary;
}
