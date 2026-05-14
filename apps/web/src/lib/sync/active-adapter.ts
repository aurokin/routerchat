"use client";

import { useMemo } from "react";
import type { Id } from "@convex/_generated/dataModel";
import {
    ConvexStorageAdapter,
    type ConvexClient,
} from "@/lib/sync/convex-adapter";
import { getLocalStorageAdapter } from "@/lib/sync/local-adapter";
import type { StorageAdapter } from "@/lib/sync/storage-adapter";
import type { SyncState } from "@/lib/sync/types";

export function useCloudAdapter(
    convexClient?: ConvexClient | null,
    convexUserId?: Id<"users"> | null,
    epoch: number = 0,
) {
    return useMemo(() => {
        void epoch;

        if (!convexClient || !convexUserId) {
            return null;
        }

        return new ConvexStorageAdapter(convexClient, convexUserId);
    }, [convexClient, convexUserId, epoch]);
}

export function useActiveStorageAdapter(params: {
    cloudAdapter: ConvexStorageAdapter | null;
    isConvexAvailable: boolean;
    syncState: SyncState;
    isAuthenticated: boolean;
}): StorageAdapter {
    const { cloudAdapter, isConvexAvailable, syncState, isAuthenticated } =
        params;

    return useMemo(() => {
        const canUseCloud =
            isConvexAvailable &&
            syncState === "cloud-enabled" &&
            isAuthenticated &&
            cloudAdapter;

        return canUseCloud ? cloudAdapter : getLocalStorageAdapter();
    }, [cloudAdapter, isConvexAvailable, isAuthenticated, syncState]);
}
