import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type {
    ConvexClient,
    ConvexStorageAdapter,
} from "@/lib/sync/convex-adapter";
import type {
    CloneOptions,
    CloneProgress,
    MigrationProgress,
} from "@/lib/sync/types";
import {
    cloneCloudToLocal,
    migrateLocalToCloud,
    migrateSkillsToCloud,
} from "@/lib/sync/migration";
import { waitForDeleteOperation } from "@/lib/sync/delete-operations";
import { getApiKey } from "@/lib/storage";

export async function runEnableCloudSyncMigration(params: {
    initialSync: boolean;
    convexClient: ConvexClient;
    convexUserId: Id<"users">;
    cloudAdapter: ConvexStorageAdapter;
    setMigrationProgress: (progress: MigrationProgress | null) => void;
}): Promise<void> {
    const {
        initialSync,
        convexClient,
        convexUserId,
        cloudAdapter,
        setMigrationProgress,
    } = params;

    if (initialSync) return;

    const resetOperationId = await convexClient.mutation(
        api.users.resetCloudData,
        {},
    );
    await waitForDeleteOperation(convexClient, resetOperationId, 5 * 60_000);
    await migrateLocalToCloud(cloudAdapter, setMigrationProgress);
    await migrateSkillsToCloud(convexClient, convexUserId);

    const localApiKey = getApiKey();
    if (localApiKey) {
        await convexClient.mutation(api.apiKey.setApiKey, {
            apiKey: localApiKey,
        });
    }

    await convexClient.mutation(api.users.setInitialSync, {
        initialSync: true,
    });
}

export async function runCloneCloudToLocal(params: {
    convexClient: ConvexClient;
    cloudAdapter: ConvexStorageAdapter;
    options?: CloneOptions;
    setCloneProgress: (progress: CloneProgress | null) => void;
}): Promise<void> {
    const { convexClient, cloudAdapter, options, setCloneProgress } = params;
    const cloudApiKey = await convexClient.action(
        api.apiKey.getDecryptedApiKey,
        {},
    );
    await cloneCloudToLocal(
        cloudAdapter,
        setCloneProgress,
        options,
        cloudApiKey,
    );
}
