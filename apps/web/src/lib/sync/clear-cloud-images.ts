import { api } from "@convex/_generated/api";
import type { ConvexClientInterface } from "@/lib/sync/convex-types";

export async function clearCloudImagesAndRefresh({
    convexClient,
    clearAttachmentCaches,
    onCloudImagesCleared,
    refreshQuotaStatus,
}: {
    convexClient: ConvexClientInterface | null | undefined;
    clearAttachmentCaches: () => Promise<void>;
    onCloudImagesCleared?: () => void;
    refreshQuotaStatus: () => Promise<void>;
}): Promise<void> {
    if (!convexClient) {
        throw new Error("Convex not configured");
    }

    await convexClient.mutation(api.attachments.clearAllForUser, {});
    await clearAttachmentCaches();
    onCloudImagesCleared?.();
    await refreshQuotaStatus();
}
