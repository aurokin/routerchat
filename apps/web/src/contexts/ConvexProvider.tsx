"use client";

import { ConvexReactClient, useConvexAuth } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createContext, useContext, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isConvexConfigured, getConvexUrl } from "@/lib/sync/config";

interface ConvexAvailabilityContextType {
    isAvailable: boolean;
}

const ConvexAvailabilityContext =
    createContext<ConvexAvailabilityContextType | null>(null);

interface SafeConvexAuthValue {
    isAuthenticated: boolean;
    isLoading: boolean;
}

const SAFE_AUTH_DEFAULT: SafeConvexAuthValue = {
    isAuthenticated: false,
    isLoading: false,
};

const SafeConvexAuthContext =
    createContext<SafeConvexAuthValue>(SAFE_AUTH_DEFAULT);

// Module-level singleton for the Convex client. We never construct a "fallback"
// client when Convex is unconfigured — that previously caused devtools console
// noise from a hardcoded http://127.0.0.1:3210 URL nobody ever ran.
let convexClient: ConvexReactClient | null = null;

function getClient(): ConvexReactClient | null {
    if (typeof window === "undefined") return null;
    if (!isConvexConfigured()) return null;

    if (!convexClient) {
        const url = getConvexUrl();
        if (url) {
            convexClient = new ConvexReactClient(url);
        }
    }
    return convexClient;
}

interface SafeConvexProviderProps {
    children: ReactNode;
}

export function SafeConvexProvider({ children }: SafeConvexProviderProps) {
    const client = getClient();

    if (!client) {
        // Local-only mode: no client, no auth provider, no network connections.
        return (
            <ConvexAvailabilityContext.Provider value={{ isAvailable: false }}>
                <SafeConvexAuthContext.Provider value={SAFE_AUTH_DEFAULT}>
                    {children}
                </SafeConvexAuthContext.Provider>
            </ConvexAvailabilityContext.Provider>
        );
    }

    return (
        <ConvexAvailabilityContext.Provider value={{ isAvailable: true }}>
            <AuthAwareConvexProvider client={client}>
                <SafeAuthBridge>{children}</SafeAuthBridge>
            </AuthAwareConvexProvider>
        </ConvexAvailabilityContext.Provider>
    );
}

function AuthAwareConvexProvider({
    client,
    children,
}: {
    client: ConvexReactClient;
    children: ReactNode;
}) {
    const router = useRouter();

    return (
        <ConvexAuthProvider
            client={client}
            replaceURL={(url) => router.replace(url)}
        >
            {children}
        </ConvexAuthProvider>
    );
}

// Bridges Convex's real auth context into our local SafeConvexAuthContext so
// consumers can use a single hook regardless of whether Convex is configured.
function SafeAuthBridge({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useConvexAuth();
    return (
        <SafeConvexAuthContext.Provider value={{ isAuthenticated, isLoading }}>
            {children}
        </SafeConvexAuthContext.Provider>
    );
}

export function useIsConvexAvailable(): boolean {
    const context = useContext(ConvexAvailabilityContext);
    return context?.isAvailable ?? false;
}

/**
 * Returns auth state that's safe to read regardless of whether Convex is
 * configured. When Convex is unavailable, returns
 * `{ isAuthenticated: false, isLoading: false }`.
 */
export function useSafeConvexAuth(): SafeConvexAuthValue {
    return useContext(SafeConvexAuthContext);
}
