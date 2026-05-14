import { describe, it, expect, vi } from "vitest";
import { clearCloudImagesAndRefresh } from "@/lib/sync/clear-cloud-images";

describe("clearCloudImagesAndRefresh", () => {
    it("runs Convex mutation, clears caches, invalidates adapter, then refreshes quota", async () => {
        const events: string[] = [];

        const convexClient = {
            mutation: vi.fn(async () => {
                events.push("mutation");
                return "op-1";
            }),
            query: vi.fn(async () => {
                events.push("query");
                return { status: "finished" };
            }),
        } as any;

        const clearAttachmentCaches = vi.fn(async () => {
            events.push("clearCaches");
        });

        const onCloudImagesCleared = vi.fn(() => {
            events.push("invalidated");
        });

        const refreshQuotaStatus = vi.fn(async () => {
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
            "query",
            "clearCaches",
            "invalidated",
            "refresh",
        ]);
        expect(convexClient.mutation).toHaveBeenCalledTimes(1);
        expect(convexClient.query).toHaveBeenCalledTimes(1);
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
