import { api } from "@convex/_generated/api";
import type { ConvexClient } from "@/lib/sync/convex-adapter";
import { waitForDeleteOperation } from "@/lib/sync/delete-operations";

export async function clearCloudImagesAndRefresh({
    convexClient,
    clearAttachmentCaches,
    onCloudImagesCleared,
    refreshQuotaStatus,
}: {
    convexClient: ConvexClient | null | undefined;
    clearAttachmentCaches: () => Promise<void>;
    onCloudImagesCleared?: () => void;
    refreshQuotaStatus: () => Promise<void>;
}): Promise<void> {
    if (!convexClient) {
        throw new Error("Convex not configured");
    }

    const operationId = await convexClient.mutation(
        api.attachments.clearAllForUser,
        {},
    );
    await waitForDeleteOperation(convexClient, operationId, 5 * 60_000);
    await clearAttachmentCaches();
    onCloudImagesCleared?.();
    await refreshQuotaStatus();
}
