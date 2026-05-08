import { describe, expect, test } from "bun:test";
import { getCloudAutoEnableDecision } from "@/components/sync/CloudSyncSettings";
import type { SyncState } from "@/lib/sync/types";

const baseInput = {
    isAuthenticated: true,
    hasAutoEnableReason: true,
    isInitialSyncLoaded: true,
    syncState: "local-only" as SyncState,
    isMigrating: false,
    isLoading: false,
    showEnableConfirm: false,
    showDisableConfirm: false,
    showSignInConfirm: false,
    hasAttempted: false,
};

describe("getCloudAutoEnableDecision", () => {
    test("resets attempt when not authenticated", () => {
        const decision = getCloudAutoEnableDecision({
            ...baseInput,
            isAuthenticated: false,
        });

        expect(decision.shouldResetAttempt).toBe(true);
        expect(decision.shouldClearReason).toBe(false);
        expect(decision.shouldEnable).toBe(false);
    });

    test("does nothing when no auto-enable reason", () => {
        const decision = getCloudAutoEnableDecision({
            ...baseInput,
            hasAutoEnableReason: false,
        });

        expect(decision.shouldResetAttempt).toBe(false);
        expect(decision.shouldClearReason).toBe(false);
        expect(decision.shouldEnable).toBe(false);
    });

    test("waits for initial sync to load", () => {
        const decision = getCloudAutoEnableDecision({
            ...baseInput,
            isInitialSyncLoaded: false,
        });

        expect(decision.shouldClearReason).toBe(false);
        expect(decision.shouldEnable).toBe(false);
    });

    test("clears reason when already enabled", () => {
        const decision = getCloudAutoEnableDecision({
            ...baseInput,
            syncState: "cloud-enabled" as SyncState,
        });

        expect(decision.shouldClearReason).toBe(true);
        expect(decision.shouldEnable).toBe(false);
    });

    test("skips auto-enable when confirmation dialogs are open", () => {
        const decision = getCloudAutoEnableDecision({
            ...baseInput,
            showEnableConfirm: true,
        });

        expect(decision.shouldEnable).toBe(false);
        expect(decision.shouldClearReason).toBe(false);
    });

    test("enables and clears reason when conditions are met", () => {
        const decision = getCloudAutoEnableDecision(baseInput);

        expect(decision.shouldEnable).toBe(true);
        expect(decision.shouldClearReason).toBe(true);
    });
});
