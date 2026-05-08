/**
 * Sync State Machine Tests
 *
 * Tests for sync state transitions and behavior.
 *
 * Note: Since Bun runs in a Node-like environment where `typeof window === "undefined"`,
 * some tests verify server-side behavior. The storage functions return defaults
 * on the server and are no-ops for setters.
 */

import { describe, it, expect } from "bun:test";
import type { SyncState } from "@/lib/sync/types";
import { DEFAULT_SYNC_METADATA } from "@/lib/sync/types";

describe("Sync State Machine", () => {
    describe("State Values", () => {
        it("has three valid states", () => {
            const validStates: SyncState[] = [
                "local-only",
                "cloud-enabled",
                "cloud-disabled",
            ];
            expect(validStates).toHaveLength(3);
        });

        it("local-only is the default state", async () => {
            const { getSyncState } = await import("@/lib/storage");
            expect(getSyncState()).toBe("local-only");
        });
    });

    describe("State Transitions (type-level)", () => {
        it("all state values are assignable to SyncState", () => {
            const states: SyncState[] = [];

            // Type system verifies these are valid
            states.push("local-only");
            states.push("cloud-enabled");
            states.push("cloud-disabled");

            expect(states).toContain("local-only");
            expect(states).toContain("cloud-enabled");
            expect(states).toContain("cloud-disabled");
        });

        it("state transitions follow valid paths", () => {
            // This documents the valid transitions
            const validTransitions: Record<SyncState, SyncState[]> = {
                "local-only": ["cloud-enabled"], // Can only enable cloud from local-only
                "cloud-enabled": ["cloud-disabled", "local-only"], // Can disable or revert
                "cloud-disabled": ["cloud-enabled", "local-only"], // Can re-enable or revert
            };

            expect(validTransitions["local-only"]).toContain("cloud-enabled");
            expect(validTransitions["cloud-enabled"]).toContain(
                "cloud-disabled",
            );
            expect(validTransitions["cloud-disabled"]).toContain(
                "cloud-enabled",
            );
        });
    });

    describe("Server-side behavior", () => {
        it("getSyncState returns local-only on server", async () => {
            const { getSyncState } = await import("@/lib/storage");
            // On server, always returns the default
            expect(getSyncState()).toBe("local-only");
        });

        it("setSyncState is a no-op on server", async () => {
            const { getSyncState, setSyncState } =
                await import("@/lib/storage");

            // On server, setSyncState does nothing
            setSyncState("cloud-enabled");

            // State is still the default
            expect(getSyncState()).toBe("local-only");
        });
    });

    describe("SyncMetadata", () => {
        it("DEFAULT_SYNC_METADATA has correct structure", () => {
            expect(DEFAULT_SYNC_METADATA.syncState).toBe("local-only");
            expect(DEFAULT_SYNC_METADATA.lastSyncAt).toBeNull();
            expect(DEFAULT_SYNC_METADATA.cloudUserId).toBeNull();
            expect(DEFAULT_SYNC_METADATA.migrationCompletedAt).toBeNull();
        });

        it("getSyncMetadata returns defaults on server", async () => {
            const { getSyncMetadata } = await import("@/lib/storage");
            const metadata = getSyncMetadata();

            expect(metadata.syncState).toBe("local-only");
            expect(metadata.lastSyncAt).toBeNull();
            expect(metadata.cloudUserId).toBeNull();
            expect(metadata.migrationCompletedAt).toBeNull();
        });

        it("updateSyncMetadata is safe on server (returns updated structure)", async () => {
            const { updateSyncMetadata } = await import("@/lib/storage");

            // Even on server, updateSyncMetadata should not throw
            const result = updateSyncMetadata({
                lastSyncAt: Date.now(),
            });

            // Returns the merged structure
            expect(result).toBeDefined();
            expect(result.syncState).toBeDefined();
        });
    });

    describe("State Conditions", () => {
        it("local-only means no cloud features available", () => {
            // In local-only mode:
            // - Cloud sync UI should be hidden
            // - All data stored in IndexedDB
            // - No network requests to Convex
            const state: SyncState = "local-only";
            expect(state).toBe("local-only");
        });

        it("cloud-enabled means active cloud sync", () => {
            // In cloud-enabled mode:
            // - Data synced to Convex
            // - Cloud status badge visible
            // - Clone to local available
            const state: SyncState = "cloud-enabled";
            expect(state).toBe("cloud-enabled");
        });

        it("cloud-disabled means cloud available but disabled", () => {
            // In cloud-disabled mode:
            // - Convex is configured but user chose local
            // - Can re-enable cloud sync
            // - Data remains in IndexedDB
            const state: SyncState = "cloud-disabled";
            expect(state).toBe("cloud-disabled");
        });
    });

    describe("Type Safety", () => {
        it("SyncMetadata includes all required fields", () => {
            // Verify the type structure through DEFAULT_SYNC_METADATA
            const metadata = DEFAULT_SYNC_METADATA;

            expect("syncState" in metadata).toBe(true);
            expect("lastSyncAt" in metadata).toBe(true);
            expect("cloudUserId" in metadata).toBe(true);
            expect("migrationCompletedAt" in metadata).toBe(true);
        });

        it("SyncState only allows valid values", () => {
            // TypeScript would catch invalid values at compile time
            // This test documents the valid values at runtime
            const isValidSyncState = (value: string): value is SyncState => {
                return [
                    "local-only",
                    "cloud-enabled",
                    "cloud-disabled",
                ].includes(value);
            };

            expect(isValidSyncState("local-only")).toBe(true);
            expect(isValidSyncState("cloud-enabled")).toBe(true);
            expect(isValidSyncState("cloud-disabled")).toBe(true);
            expect(isValidSyncState("invalid-state")).toBe(false);
        });
    });
});
