/**
 * Quota Service
 *
 * Manages storage quotas for images and handles auto-purge when limits are exceeded.
 * Delegates to shared core implementation.
 */

export * from "@shared/core/quota";

import { calculateQuotaStatus } from "@shared/core/sync/quota";
import { CLOUD_IMAGE_QUOTA, LOCAL_IMAGE_QUOTA } from "@shared/core/quota";
import type { StorageAdapter } from "@shared/core/sync";
import { getLocalStorageAdapter } from "./local-adapter";
import type { QuotaStatus } from "./types";

/**
 * Get local storage quota status.
 */
export async function getLocalQuotaStatus(): Promise<QuotaStatus> {
    const localAdapter = getLocalStorageAdapter();
    const used = await localAdapter.getImageStorageUsage();
    return calculateQuotaStatus(used, LOCAL_IMAGE_QUOTA);
}

/**
 * Get cloud storage quota status.
 */
export async function getCloudQuotaStatus(
    cloudAdapter: StorageAdapter,
): Promise<QuotaStatus> {
    const used = await cloudAdapter.getImageStorageUsage();
    return calculateQuotaStatus(used, CLOUD_IMAGE_QUOTA);
}
