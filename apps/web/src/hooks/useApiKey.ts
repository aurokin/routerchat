"use client";

import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@convex/_generated/api";
import { useIsConvexAvailable } from "@/contexts/ConvexProvider";
import { useSync } from "@/contexts/SyncContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    getApiKey as getLocalApiKey,
    setApiKey as setLocalApiKey,
    clearApiKey as clearLocalApiKey,
} from "@/lib/storage";

interface UseApiKeyReturn {
    /** The current API key (from cloud if cloud-enabled, otherwise local) */
    apiKey: string | null;
    /** Whether the API key is being loaded from cloud */
    isLoading: boolean;
    /** Set the API key (saves to active storage: local or cloud) */
    setApiKey: (key: string) => Promise<void>;
    /** Clear the API key (from active storage: local or cloud) */
    clearApiKey: () => Promise<void>;
    /** Whether the API key is using cloud storage */
    isCloudSynced: boolean;
}

export function isApiKeyCloudEnabled(params: {
    isConvexAvailable: boolean;
    isAuthenticated: boolean;
    syncState: string;
}): boolean {
    return (
        params.isConvexAvailable &&
        params.isAuthenticated &&
        params.syncState === "cloud-enabled"
    );
}

export function resolveApiKeyValue(params: {
    isCloudEnabled: boolean;
    cloudApiKey: string | null | undefined;
    localApiKey: string | null;
}): string | null {
    return params.isCloudEnabled
        ? (params.cloudApiKey ?? null)
        : params.localApiKey;
}

export function isApiKeyLoadingState(params: {
    isCloudEnabled: boolean;
    cloudApiKey: string | null | undefined;
}): boolean {
    return params.isCloudEnabled && params.cloudApiKey === undefined;
}

/**
 * Hook to manage the OpenRouter API key
 *
 * Local storage and cloud (Convex) are separate databases:
 * - Local mode: API key stored in localStorage only
 * - Cloud mode: API key stored in Convex (encrypted)
 * - Users can explicitly copy cloud data to local via settings
 */
export function useApiKey(): UseApiKeyReturn {
    const isConvexAvailable = useIsConvexAvailable();
    const { isAuthenticated } = useConvexAuth();
    const { syncState } = useSync();

    const [localApiKey, setLocalApiKeyState] = useState<string | null>(() =>
        getLocalApiKey(),
    );

    // Determine if cloud sync is active for API key
    const isCloudEnabled = isApiKeyCloudEnabled({
        isConvexAvailable,
        isAuthenticated,
        syncState,
    });

    // Keep local key state in sync when switching to local mode or when
    // localStorage is updated from another tab.
    useEffect(() => {
        if (typeof window === "undefined") return;
        let isActive = true;

        const syncFromStorage = () => {
            if (!isActive) return;
            setLocalApiKeyState(getLocalApiKey());
        };

        // Defer to avoid synchronous setState in effect body (lint rule) and
        // reduce the risk of cascading renders.
        if (!isCloudEnabled) {
            Promise.resolve().then(syncFromStorage);
        }

        window.addEventListener("storage", syncFromStorage);
        return () => {
            isActive = false;
            window.removeEventListener("storage", syncFromStorage);
        };
    }, [isCloudEnabled]);

    // Cloud API key query (only fetched when cloud sync is enabled)
    const cloudApiKey = useQuery(
        api.apiKey.getApiKey,
        isCloudEnabled ? undefined : "skip",
    );

    // Cloud API key mutations
    const setCloudApiKeyMutation = useMutation(api.apiKey.setApiKey);
    const clearCloudApiKeyMutation = useMutation(api.apiKey.clearApiKey);

    // Determine the effective API key based on active storage mode
    const apiKey = useMemo(
        () =>
            resolveApiKeyValue({
                isCloudEnabled,
                cloudApiKey,
                localApiKey,
            }),
        [cloudApiKey, isCloudEnabled, localApiKey],
    );

    const isLoading = isApiKeyLoadingState({ isCloudEnabled, cloudApiKey });

    // Set API key - saves to the active storage (local or cloud)
    const setApiKey = useCallback(
        async (key: string) => {
            if (isCloudEnabled) {
                try {
                    await setCloudApiKeyMutation({ apiKey: key });
                } catch (error) {
                    console.error("Failed to save API key to cloud:", error);
                    throw error;
                }
            } else {
                setLocalApiKey(key);
                setLocalApiKeyState(key);
            }
        },
        [isCloudEnabled, setCloudApiKeyMutation],
    );

    // Clear API key - clears from the active storage (local or cloud)
    const clearApiKey = useCallback(async () => {
        if (isCloudEnabled) {
            try {
                await clearCloudApiKeyMutation();
            } catch (error) {
                console.error("Failed to clear API key from cloud:", error);
                throw error;
            }
        } else {
            clearLocalApiKey();
            setLocalApiKeyState(null);
        }
    }, [isCloudEnabled, clearCloudApiKeyMutation]);

    return useMemo(
        () => ({
            apiKey,
            isLoading,
            setApiKey,
            clearApiKey,
            isCloudSynced: isCloudEnabled,
        }),
        [apiKey, isLoading, setApiKey, clearApiKey, isCloudEnabled],
    );
}
