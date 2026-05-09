"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import {
    useIsConvexAvailable,
    useSafeConvexAuth,
} from "@/contexts/ConvexProvider";
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
 *
 * The cloud-side decrypted key is fetched via a server action (not a reactive
 * query) so each read is auditable and the plaintext is never subscribable.
 */
export function useApiKey(): UseApiKeyReturn {
    const isConvexAvailable = useIsConvexAvailable();
    const { isAuthenticated } = useSafeConvexAuth();
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

        if (!isCloudEnabled) {
            Promise.resolve().then(syncFromStorage);
        }

        window.addEventListener("storage", syncFromStorage);
        return () => {
            isActive = false;
            window.removeEventListener("storage", syncFromStorage);
        };
    }, [isCloudEnabled]);

    // Reactive flag for whether a cloud key exists (no plaintext exposure).
    const hasCloudKey = useQuery(
        api.apiKey.hasApiKey,
        isCloudEnabled ? {} : "skip",
    );

    const getDecryptedApiKey = useAction(api.apiKey.getDecryptedApiKey);
    const setCloudApiKeyMutation = useMutation(api.apiKey.setApiKey);
    const clearCloudApiKeyMutation = useMutation(api.apiKey.clearApiKey);

    // `undefined` = not loaded yet; `null` = no key; string = loaded key.
    const [cloudApiKey, setCloudApiKey] = useState<string | null | undefined>(
        undefined,
    );

    // Fetch the decrypted key when we know one exists; reset when not.
    useEffect(() => {
        if (!isCloudEnabled) {
            setCloudApiKey(undefined);
            return;
        }
        if (hasCloudKey === undefined) {
            // hasApiKey query still loading
            return;
        }
        if (hasCloudKey === false) {
            setCloudApiKey(null);
            return;
        }

        let cancelled = false;
        setCloudApiKey(undefined);
        getDecryptedApiKey({})
            .then((value) => {
                if (cancelled) return;
                setCloudApiKey(value);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Failed to fetch decrypted API key:", error);
                setCloudApiKey(null);
            });

        return () => {
            cancelled = true;
        };
    }, [isCloudEnabled, hasCloudKey, getDecryptedApiKey]);

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
                    setCloudApiKey(key);
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
                setCloudApiKey(null);
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
