"use client";

import React, {
    createContext,
    useContext,
    useEffect,
    useState,
    useCallback,
    useMemo,
    useRef,
    useSyncExternalStore,
} from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { isConvexConfigured } from "@/lib/sync/config";
import type {
    SyncState,
    SyncMetadata,
    QuotaStatus,
    MigrationProgress,
    CloneProgress,
    CloneOptions,
} from "@/lib/sync/types";
import {
    LOCAL_IMAGE_QUOTA,
    QUOTA_WARNING_80,
    QUOTA_WARNING_95,
} from "@shared/core/quota";
import { DEFAULT_SYNC_METADATA } from "@/lib/sync/types";
import type { ConvexClientInterface, ConvexId } from "@/lib/sync/convex-types";
import {
    ConvexStorageAdapter,
    clearCloudAttachmentCaches,
} from "@/lib/sync/convex-adapter";
import { clearCloudImagesAndRefresh } from "@/lib/sync/clear-cloud-images";
import {
    migrateLocalToCloud,
    migrateSkillsToCloud,
    cloneCloudToLocal,
} from "@/lib/sync/migration";
import { getCloudQuotaStatus } from "@/lib/sync/quota";
import * as storage from "@/lib/storage";
import { getApiKey } from "@/lib/storage";
import { getLocalStorageAdapter } from "@/lib/sync/local-adapter";
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

type ConvexAvailabilitySnapshot = {
    isAvailable: boolean;
    isChecked: boolean;
};

const convexAvailabilityStore = (() => {
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
    const convexClient = useConvex() as unknown as ConvexClientInterface;
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

function useCloudAdapter(
    convexClient?: ConvexClientInterface | null,
    convexUserId?: ConvexId<"users"> | null,
    epoch: number = 0,
) {
    return useMemo(() => {
        // `epoch` is intentionally used as a cache-buster to force creating a
        // fresh adapter instance after destructive operations (e.g. clearing
        // cloud images) so attachment effects re-run.
        void epoch;

        if (!convexClient || !convexUserId) {
            return null;
        }

        return new ConvexStorageAdapter(convexClient, convexUserId);
    }, [convexClient, convexUserId, epoch]);
}

function useActiveStorageAdapter({
    cloudAdapter,
    isConvexAvailable,
    syncState,
    isAuthenticated,
}: {
    cloudAdapter: ConvexStorageAdapter | null;
    isConvexAvailable: boolean;
    syncState: SyncState;
    isAuthenticated: boolean;
}) {
    return useMemo((): StorageAdapter => {
        const canUseCloud =
            isConvexAvailable &&
            syncState === "cloud-enabled" &&
            isAuthenticated &&
            cloudAdapter;

        return canUseCloud ? cloudAdapter : getLocalStorageAdapter();
    }, [cloudAdapter, isConvexAvailable, isAuthenticated, syncState]);
}

function useQuotaStatus({
    cloudAdapter,
    convexClient,
    isAuthenticated,
    onCloudImagesCleared,
}: {
    cloudAdapter: ConvexStorageAdapter | null;
    convexClient?: ConvexClientInterface | null;
    isAuthenticated: boolean;
    onCloudImagesCleared?: () => void;
}) {
    const hasEnsuredUsageCountersRef = useRef(false);
    const [localQuotaStatus, setLocalQuotaStatus] = useState<QuotaStatus>({
        used: 0,
        limit: LOCAL_IMAGE_QUOTA,
        percentage: 0,
        isWarning80: false,
        isWarning95: false,
        isExceeded: false,
    });
    const [cloudQuotaStatus, setCloudQuotaStatus] =
        useState<QuotaStatus | null>(null);
    const [cloudStorageUsage, setCloudStorageUsage] = useState<{
        bytes: number;
        messageCount: number;
        sessionCount: number;
    } | null>(null);

    useEffect(() => {
        if (!convexClient || !cloudAdapter || !isAuthenticated) {
            hasEnsuredUsageCountersRef.current = false;
            return;
        }

        if (hasEnsuredUsageCountersRef.current) return;
        hasEnsuredUsageCountersRef.current = true;

        void convexClient
            .mutation(api.users.ensureUsageCounters, {})
            .catch((error) => {
                hasEnsuredUsageCountersRef.current = false;
                console.error("Failed to ensure cloud usage counters:", error);
            });
    }, [cloudAdapter, convexClient, isAuthenticated]);

    const refreshLocalQuotaStatus = useCallback(async () => {
        try {
            const adapter = getLocalStorageAdapter();
            const used = await adapter.getImageStorageUsage();
            const limit = LOCAL_IMAGE_QUOTA;
            const percentage = used / limit;

            setLocalQuotaStatus({
                used,
                limit,
                percentage,
                isWarning80: percentage >= QUOTA_WARNING_80,
                isWarning95: percentage >= QUOTA_WARNING_95,
                isExceeded: percentage >= 1,
            });
        } catch (error) {
            console.error("Failed to refresh local quota status:", error);
        }
    }, []);

    const refreshCloudQuotaStatus = useCallback(async () => {
        if (!cloudAdapter || !isAuthenticated) {
            setCloudQuotaStatus(null);
            return;
        }

        try {
            const status = await getCloudQuotaStatus(cloudAdapter);
            setCloudQuotaStatus(status);
        } catch (error) {
            console.error("Failed to refresh cloud quota status:", error);
        }
    }, [cloudAdapter, isAuthenticated]);

    const refreshCloudStorageUsage = useCallback(async () => {
        if (!cloudAdapter || !isAuthenticated) {
            setCloudStorageUsage(null);
            return;
        }

        try {
            const usage = await cloudAdapter.getStorageUsage();
            setCloudStorageUsage(usage);
        } catch (error) {
            console.error("Failed to refresh cloud storage usage:", error);
        }
    }, [cloudAdapter, isAuthenticated]);

    const refreshQuotaStatus = useCallback(async () => {
        await Promise.all([
            refreshLocalQuotaStatus(),
            refreshCloudQuotaStatus(),
            refreshCloudStorageUsage(),
        ]);
    }, [
        refreshLocalQuotaStatus,
        refreshCloudQuotaStatus,
        refreshCloudStorageUsage,
    ]);

    const clearCloudImages = useCallback(async () => {
        await clearCloudImagesAndRefresh({
            convexClient,
            clearAttachmentCaches: clearCloudAttachmentCaches,
            onCloudImagesCleared,
            refreshQuotaStatus,
        });
    }, [convexClient, onCloudImagesCleared, refreshQuotaStatus]);

    useEffect(() => {
        queueMicrotask(() => {
            void refreshQuotaStatus();
        });
    }, [refreshQuotaStatus]);

    return {
        localQuotaStatus,
        cloudQuotaStatus,
        cloudStorageUsage,
        refreshQuotaStatus,
        clearCloudImages,
    };
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
    convexClient?: ConvexClientInterface | null;
    convexUserId?: ConvexId<"users"> | null;
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

        // If Convex is not available, force local-only mode
        if (!isConvexAvailable) {
            setSyncStateInternal("local-only");
            setSyncMetadataInternal({
                ...storedMetadata,
                syncState: "local-only",
            });
        } else {
            setSyncStateInternal(storedState);
            setSyncMetadataInternal(storedMetadata);
        }

        setIsStorageHydrated(true);
    }, [isConvexAvailable]);

    // Update sync state and persist
    const updateSyncState = useCallback((newState: SyncState) => {
        setSyncStateInternal(newState);
        storage.setSyncState(newState);

        const updatedMetadata = storage.updateSyncMetadata({
            syncState: newState,
        });
        setSyncMetadataInternal(updatedMetadata);
    }, []);

    // Disable cloud sync when signed out
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isAuthLoading) return;

        if (!isAuthenticated && syncState === "cloud-enabled") {
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
            if (!initialSync) {
                if (!convexUserId) {
                    throw new Error("User not loaded");
                }

                await convexClient.mutation(api.users.resetCloudData, {});
                await migrateLocalToCloud(cloudAdapter, setMigrationProgress);
                await migrateSkillsToCloud(convexClient, convexUserId);

                // Migrate API key to cloud (if user has one locally)
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
                const cloudApiKey = await convexClient.query(
                    api.apiKey.getApiKey,
                    {},
                );
                await cloneCloudToLocal(
                    cloudAdapter,
                    setCloneProgress,
                    options,
                    cloudApiKey,
                );
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
