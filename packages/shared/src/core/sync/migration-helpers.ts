import type {
    StorageAdapter,
    MigrationConfig,
    MigrationProgressCallback,
    CloneProgressCallback,
    CloneConfig,
} from "./index";
import type { CloneOptions } from "./types";
import { runMigration, runClone } from "./index";

export function buildCloneConfig(options?: CloneOptions): CloneConfig {
    const textOnly = options?.textOnly ?? false;
    return {
        includeChats: true,
        includeMessages: true,
        includeAttachments: !textOnly,
        includeSkills: true,
    };
}

export async function runMigrationWithAdapters(params: {
    sourceAdapter: StorageAdapter;
    targetAdapter: StorageAdapter;
    onProgress: MigrationProgressCallback;
    config?: Partial<MigrationConfig>;
}): Promise<void> {
    const { sourceAdapter, targetAdapter, onProgress, config } = params;
    await runMigration({ sourceAdapter, targetAdapter, onProgress }, config);
}

export async function runCloneWithAdapters(params: {
    sourceAdapter: StorageAdapter;
    targetAdapter: StorageAdapter;
    onProgress: CloneProgressCallback;
    options?: CloneOptions;
}): Promise<void> {
    const { sourceAdapter, targetAdapter, onProgress, options } = params;
    await runClone({
        sourceAdapter,
        targetAdapter,
        onProgress,
        options: buildCloneConfig(options),
    });
}
