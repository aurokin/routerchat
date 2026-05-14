import type { SyncMetadata, SyncState } from "@/lib/sync/types";
import { DEFAULT_SYNC_METADATA } from "@/lib/sync/types";
import { isConvexConfigured } from "@/lib/sync/config";

type ConvexAvailabilitySnapshot = {
    isAvailable: boolean;
    isChecked: boolean;
};

export const convexAvailabilityStore = (() => {
    const SERVER_SNAPSHOT: ConvexAvailabilitySnapshot = {
        isAvailable: false,
        isChecked: false,
    };
    let snapshot: ConvexAvailabilitySnapshot = {
        isAvailable: false,
        isChecked: false,
    };
    let initialized = false;
    const listeners = new Set<() => void>();

    const setSnapshot = (next: ConvexAvailabilitySnapshot) => {
        if (
            next.isAvailable === snapshot.isAvailable &&
            next.isChecked === snapshot.isChecked
        ) {
            return;
        }

        snapshot = next;
        listeners.forEach((listener) => listener());
    };

    const evaluate = () => {
        setSnapshot({
            isAvailable: isConvexConfigured() === true,
            isChecked: true,
        });
    };

    const ensureInitialized = () => {
        if (initialized || typeof window === "undefined") {
            return;
        }

        initialized = true;
        queueMicrotask(evaluate);
    };

    return {
        subscribe(listener: () => void) {
            ensureInitialized();
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot() {
            ensureInitialized();
            return snapshot;
        },
        getServerSnapshot(): ConvexAvailabilitySnapshot {
            return SERVER_SNAPSHOT;
        },
    };
})();

export function resolveStoredSyncState(params: {
    isConvexAvailable: boolean;
    storedState: SyncState;
    storedMetadata: SyncMetadata;
}): { syncState: SyncState; syncMetadata: SyncMetadata } {
    if (!params.isConvexAvailable) {
        return {
            syncState: "local-only",
            syncMetadata: {
                ...params.storedMetadata,
                syncState: "local-only",
            },
        };
    }

    return {
        syncState: params.storedState,
        syncMetadata: params.storedMetadata,
    };
}

export function applySyncStateChange(params: {
    previousMetadata?: SyncMetadata;
    nextState: SyncState;
    now?: number;
}): SyncMetadata {
    const base = params.previousMetadata ?? DEFAULT_SYNC_METADATA;
    return {
        ...base,
        syncState: params.nextState,
        lastSyncAt: params.now ?? Date.now(),
    };
}

export function shouldDisableCloudOnSignOut(params: {
    isAuthLoading: boolean;
    isAuthenticated: boolean;
    syncState: SyncState;
}): boolean {
    return (
        !params.isAuthLoading &&
        !params.isAuthenticated &&
        params.syncState === "cloud-enabled"
    );
}
