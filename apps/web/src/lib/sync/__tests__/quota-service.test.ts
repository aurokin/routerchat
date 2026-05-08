import { describe, expect, it, mock } from "bun:test";
import type { StorageAdapter } from "@/lib/sync/storage-adapter";
import { CLOUD_IMAGE_QUOTA, LOCAL_IMAGE_QUOTA } from "@/lib/sync/types";

const localAdapter = {
    getImageStorageUsage: mock(async () => 256 * 1024 * 1024),
};

mock.module("@/lib/sync/local-adapter", () => ({
    getLocalStorageAdapter: () => localAdapter,
}));

const quota = await import("@/lib/sync/quota");

describe("quota service", () => {
    it("getLocalQuotaStatus uses local adapter usage", async () => {
        const status = await quota.getLocalQuotaStatus();
        expect(localAdapter.getImageStorageUsage).toHaveBeenCalledTimes(1);
        expect(status.used).toBe(256 * 1024 * 1024);
        expect(status.limit).toBe(LOCAL_IMAGE_QUOTA);
    });

    it("getCloudQuotaStatus uses provided adapter", async () => {
        const cloudAdapter = {
            getImageStorageUsage: mock(async () => 512 * 1024 * 1024),
        } as unknown as StorageAdapter;

        const status = await quota.getCloudQuotaStatus(cloudAdapter);
        expect(status.used).toBe(512 * 1024 * 1024);
        expect(status.limit).toBe(CLOUD_IMAGE_QUOTA);
    });
});
