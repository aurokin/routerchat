"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useMemo,
    useSyncExternalStore,
} from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type {
    SyncState,
    SyncMetadata,
    QuotaStatus,
    MigrationProgress,
    CloneProgress,
    CloneOptions,
} from "@/lib/sync/types";
import { DEFAULT_SYNC_METADATA } from "@/lib/sync/types";
import type { Id } from "@convex/_generated/dataModel";
import { type ConvexClient } from "@/lib/sync/convex-adapter";
import {
    useActiveStorageAdapter,
    useCloudAdapter,
} from "@/lib/sync/active-adapter";
import {
    runCloneCloudToLocal,
    runEnableCloudSyncMigration,
} from "@/lib/sync/migration-runner";
import { useQuotaStatus } from "@/lib/sync/quota-status";
import {
    applySyncStateChange,
    convexAvailabilityStore,
    resolveStoredSyncState,
    shouldDisableCloudOnSignOut,
} from "@/lib/sync/state-machine";
import * as storage from "@/lib/storage";
import type { StorageAdapter } from "@/lib/sync/storage-adapter";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

/**
 * Sync Context Type
 *
 * Provides access to sync state, actions, and the current storage adapter.
 */
interface SyncContextType {
    // State
    syncState: SyncState;
    isConvexAvailable: boolean;
    isAuthenticated: boolean;
    syncMetadata: SyncMetadata;

    // Storage adapter (use this for all data operations)
    storageAdapter: StorageAdapter;

    // Quota info
    localQuotaStatus: QuotaStatus;
    cloudQuotaStatus: QuotaStatus | null;
    cloudStorageUsage: {
        bytes: number;
        messageCount: number;
        sessionCount: number;
    } | null;

    // Actions
    enableCloudSync: () => Promise<void>;
    disableCloudSync: () => Promise<void>;
    clearCloudImages: () => Promise<void>;
    cloneToLocal: (options?: CloneOptions) => Promise<void>;
    refreshQuotaStatus: () => Promise<void>;

    // Loading state
    isInitialSyncLoaded: boolean;

    // Migration state
    isMigrating: boolean;
    migrationProgress: MigrationProgress | null;

    // Clone state
    isCloning: boolean;
    cloneProgress: CloneProgress | null;
}

const SyncContext = createContext<SyncContextType | null>(null);

/**
 * Sync Provider
 *
 * Manages the sync state machine and provides access to the appropriate
 * storage adapter based on the current sync state.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
    const convexAvailability = useSyncExternalStore(
        convexAvailabilityStore.subscribe,
        convexAvailabilityStore.getSnapshot,
        convexAvailabilityStore.getServerSnapshot,
    );

    if (!convexAvailability.isChecked) {
        return <LoadingScreen />;
    }

    if (!convexAvailability.isAvailable) {
        return (
            <SyncProviderBase isConvexAvailable={false}>
                {children}
            </SyncProviderBase>
        );
    }

    return (
        <SyncProviderWithAuth
            isConvexAvailable={convexAvailability.isAvailable}
        >
            {children}
        </SyncProviderWithAuth>
    );
}

function SyncProviderWithAuth({
    children,
    isConvexAvailable,
}: {
    children: React.ReactNode;
    isConvexAvailable: boolean;
}) {
    const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
    const convexClient: ConvexClient = useConvex();
    const userId = useQuery(api.users.getCurrentUserId, {});
    const user = useQuery(api.users.get, userId ? { id: userId } : "skip");

    return (
        <SyncProviderBase
            isConvexAvailable={isConvexAvailable}
            convexClient={convexClient}
            convexUserId={userId ?? null}
            initialSync={user?.initialSync}
            isAuthenticated={isAuthenticated}
            isAuthLoading={isAuthLoading}
        >
            {children}
        </SyncProviderBase>
    );
}

function SyncProviderBase({
    children,
    isConvexAvailable,
    convexClient,
    convexUserId,
    initialSync,
    isAuthenticated = false,
    isAuthLoading = false,
}: {
    children: React.ReactNode;
    isConvexAvailable: boolean;
    convexClient?: ConvexClient | null;
    convexUserId?: Id<"users"> | null;
    initialSync?: boolean;
    isAuthenticated?: boolean;
    isAuthLoading?: boolean;
}) {
    // Core state
    const [syncState, setSyncStateInternal] = useState<SyncState>("local-only");
    const [syncMetadata, setSyncMetadataInternal] = useState<SyncMetadata>(
        DEFAULT_SYNC_METADATA,
    );
    const [isStorageHydrated, setIsStorageHydrated] = useState(false);

    const [cloudAdapterEpoch, setCloudAdapterEpoch] = useState(0);
    const invalidateCloudAdapter = useCallback(() => {
        setCloudAdapterEpoch((prev) => prev + 1);
    }, []);

    const cloudAdapter = useCloudAdapter(
        convexClient,
        convexUserId,
        cloudAdapterEpoch,
    );
    const storageAdapter = useActiveStorageAdapter({
        cloudAdapter,
        isConvexAvailable,
        syncState,
        isAuthenticated,
    });
    const {
        localQuotaStatus,
        cloudQuotaStatus,
        cloudStorageUsage,
        refreshQuotaStatus,
        clearCloudImages,
    } = useQuotaStatus({
        cloudAdapter,
        convexClient,
        isAuthenticated,
        onCloudImagesCleared: invalidateCloudAdapter,
    });

    // Migration state
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationProgress, setMigrationProgress] =
        useState<MigrationProgress | null>(null);

    // Clone state
    const [isCloning, setIsCloning] = useState(false);
    const [cloneProgress, setCloneProgress] = useState<CloneProgress | null>(
        null,
    );

    // Initialize state from localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;

        const storedState = storage.getSyncState();
        const storedMetadata = storage.getSyncMetadata();
        const resolved = resolveStoredSyncState({
            isConvexAvailable,
            storedState,
            storedMetadata,
        });

        setSyncStateInternal(resolved.syncState);
        setSyncMetadataInternal(resolved.syncMetadata);

        setIsStorageHydrated(true);
    }, [isConvexAvailable]);

    // Update sync state and persist
    const updateSyncState = useCallback((newState: SyncState) => {
        setSyncStateInternal(newState);
        storage.setSyncState(newState);

        const updatedMetadata = storage.updateSyncMetadata(
            applySyncStateChange({
                previousMetadata: storage.getSyncMetadata(),
                nextState: newState,
            }),
        );
        setSyncMetadataInternal(updatedMetadata);
    }, []);

    // Disable cloud sync when signed out
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isAuthLoading) return;

        if (
            shouldDisableCloudOnSignOut({
                isAuthLoading,
                isAuthenticated,
                syncState,
            })
        ) {
            updateSyncState("cloud-disabled");
        }
    }, [isAuthLoading, isAuthenticated, syncState, updateSyncState]);

    // Enable cloud sync (local-only -> cloud-enabled)
    const enableCloudSync = useCallback(async () => {
        if (!isConvexAvailable) {
            throw new Error("Convex is not configured");
        }

        if (syncState !== "local-only" && syncState !== "cloud-disabled") {
            throw new Error(
                `Cannot enable cloud sync from state: ${syncState}`,
            );
        }

        if (!isAuthenticated) {
            throw new Error("Sign in required for cloud sync");
        }

        if (initialSync === undefined) {
            return;
        }

        if (!cloudAdapter || !convexClient) {
            throw new Error("Cloud storage is not available");
        }

        setIsMigrating(true);
        setMigrationProgress({
            phase: "chats",
            current: 0,
            total: 0,
            percentage: 0,
        });

        try {
            if (!convexUserId) {
                throw new Error("User not loaded");
            }

            await runEnableCloudSyncMigration({
                initialSync,
                convexClient,
                convexUserId,
                cloudAdapter,
                setMigrationProgress,
            });

            updateSyncState("cloud-enabled");
            storage.updateSyncMetadata({
                migrationCompletedAt: Date.now(),
            });
        } catch (error) {
            console.error("Migration failed:", error);
            throw error;
        } finally {
            setIsMigrating(false);
            setMigrationProgress(null);
        }
    }, [
        cloudAdapter,
        convexClient,
        convexUserId,
        initialSync,
        isAuthenticated,
        isConvexAvailable,
        syncState,
        updateSyncState,
    ]);

    // Disable cloud sync (cloud-enabled -> cloud-disabled)
    const disableCloudSync = useCallback(async () => {
        if (syncState !== "cloud-enabled") {
            throw new Error(
                `Cannot disable cloud sync from state: ${syncState}`,
            );
        }

        setIsCloning(true);
        setCloneProgress({
            phase: "chats",
            current: 0,
            total: 0,
            percentage: 0,
        });

        try {
            updateSyncState("cloud-disabled");
        } catch (error) {
            console.error("Failed to disable cloud sync:", error);
            throw error;
        } finally {
            setIsCloning(false);
            setCloneProgress(null);
        }
    }, [syncState, updateSyncState]);

    // Clone cloud data to local (without changing sync state)
    const cloneToLocal = useCallback(
        async (options?: CloneOptions) => {
            if (syncState !== "cloud-enabled") {
                throw new Error(
                    "Clone to local only available when cloud sync is enabled",
                );
            }

            if (!isAuthenticated) {
                throw new Error("Sign in required for clone to local");
            }

            setIsCloning(true);
            setCloneProgress({
                phase: "chats",
                current: 0,
                total: 0,
                percentage: 0,
            });

            if (!cloudAdapter) {
                throw new Error("Cloud storage is not available");
            }

            if (!convexClient) {
                throw new Error("Convex is not configured");
            }

            try {
                await runCloneCloudToLocal({
                    convexClient,
                    cloudAdapter,
                    options,
                    setCloneProgress,
                });
                await refreshQuotaStatus();
            } catch (error) {
                console.error("Clone to local failed:", error);
                throw error;
            } finally {
                setIsCloning(false);
                setCloneProgress(null);
            }
        },
        [
            cloudAdapter,
            convexClient,
            isAuthenticated,
            refreshQuotaStatus,
            syncState,
        ],
    );

    const isInitialSyncLoaded = !isConvexAvailable || initialSync !== undefined;

    // During refresh, prevent loading local data when cloud sync is enabled by
    // gating the app behind a full-screen loader until cloud availability is
    // resolved and the cloud adapter is ready.
    const shouldBlockChildren =
        !isStorageHydrated ||
        (isConvexAvailable &&
            syncState === "cloud-enabled" &&
            (isAuthLoading || !isAuthenticated || !cloudAdapter));

    const contextValue = useMemo(
        () => ({
            syncState,
            isConvexAvailable,
            isAuthenticated,
            syncMetadata,
            storageAdapter,
            localQuotaStatus,
            cloudQuotaStatus,
            cloudStorageUsage,
            clearCloudImages,
            enableCloudSync,
            disableCloudSync,
            cloneToLocal,
            refreshQuotaStatus,
            isInitialSyncLoaded,
            isMigrating,
            migrationProgress,
            isCloning,
            cloneProgress,
        }),
        [
            syncState,
            isConvexAvailable,
            isAuthenticated,
            syncMetadata,
            storageAdapter,
            localQuotaStatus,
            cloudQuotaStatus,
            cloudStorageUsage,
            clearCloudImages,
            enableCloudSync,
            disableCloudSync,
            cloneToLocal,
            refreshQuotaStatus,
            isInitialSyncLoaded,
            isMigrating,
            migrationProgress,
            isCloning,
            cloneProgress,
        ],
    );

    return (
        <SyncContext.Provider value={contextValue}>
            {shouldBlockChildren ? <LoadingScreen /> : children}
        </SyncContext.Provider>
    );
}

/**
 * Hook to access sync context
 */
export function useSync(): SyncContextType {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error("useSync must be used within a SyncProvider");
    }
    return context;
}

/**
 * Hook to check if cloud sync is available (Convex configured + signed in)
 */
export function useIsCloudSyncAvailable(): boolean {
    const { isConvexAvailable, isAuthenticated } = useSync();
    return isConvexAvailable && isAuthenticated;
}

/**
 * Hook to get the current storage adapter
 */
export function useStorageAdapter(): StorageAdapter {
    const { storageAdapter } = useSync();
    return storageAdapter;
}
