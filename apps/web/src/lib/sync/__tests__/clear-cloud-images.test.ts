import { describe, it, expect, mock } from "bun:test";
import { clearCloudImagesAndRefresh } from "@/lib/sync/clear-cloud-images";

describe("clearCloudImagesAndRefresh", () => {
    it("runs Convex mutation, clears caches, invalidates adapter, then refreshes quota", async () => {
        const events: string[] = [];

        const convexClient = {
            mutation: mock(async () => {
                events.push("mutation");
            }),
        } as any;

        const clearAttachmentCaches = mock(async () => {
            events.push("clearCaches");
        });

        const onCloudImagesCleared = mock(() => {
            events.push("invalidated");
        });

        const refreshQuotaStatus = mock(async () => {
            events.push("refresh");
        });

        await clearCloudImagesAndRefresh({
            convexClient,
            clearAttachmentCaches,
            onCloudImagesCleared,
            refreshQuotaStatus,
        });

        expect(events).toEqual([
            "mutation",
            "clearCaches",
            "invalidated",
            "refresh",
        ]);
        expect(convexClient.mutation).toHaveBeenCalledTimes(1);
        expect(clearAttachmentCaches).toHaveBeenCalledTimes(1);
        expect(onCloudImagesCleared).toHaveBeenCalledTimes(1);
        expect(refreshQuotaStatus).toHaveBeenCalledTimes(1);
    });

    it("throws when Convex is not configured", async () => {
        await expect(
            clearCloudImagesAndRefresh({
                convexClient: null,
                clearAttachmentCaches: async () => {},
                refreshQuotaStatus: async () => {},
            }),
        ).rejects.toThrow("Convex not configured");
    });
});
