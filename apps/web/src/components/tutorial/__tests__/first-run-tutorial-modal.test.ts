import { describe, expect, test } from "bun:test";
import {
    getNoLocalData,
    getTutorialVisibilityState,
} from "@/components/tutorial/FirstRunTutorialModal";

describe("getNoLocalData", () => {
    test("returns false when local sessions are unknown", () => {
        expect(getNoLocalData(null, "key", false)).toBe(false);
    });

    test("returns false while api key is loading", () => {
        expect(getNoLocalData(0, "key", true)).toBe(false);
    });

    test("returns true when no sessions", () => {
        expect(getNoLocalData(0, "key", false)).toBe(true);
    });

    test("returns true when api key missing", () => {
        expect(getNoLocalData(5, null, false)).toBe(true);
    });

    test("returns false when sessions exist and api key set", () => {
        expect(getNoLocalData(3, "key", false)).toBe(false);
    });
});

describe("getTutorialVisibilityState", () => {
    test("skips updates when data is not ready", () => {
        const state = getTutorialVisibilityState({
            localSessions: null,
            isApiKeyLoading: false,
            isDismissed: false,
            hasPendingStep: false,
            noLocalData: false,
        });

        expect(state.shouldUpdate).toBe(false);
    });

    test("hides tutorial when dismissed", () => {
        const state = getTutorialVisibilityState({
            localSessions: 0,
            isApiKeyLoading: false,
            isDismissed: true,
            hasPendingStep: false,
            noLocalData: true,
        });

        expect(state.shouldUpdate).toBe(true);
        expect(state.isVisible).toBe(false);
        expect(state.shouldSetStartStep).toBe(false);
    });

    test("shows start step when no data and no pending step", () => {
        const state = getTutorialVisibilityState({
            localSessions: 0,
            isApiKeyLoading: false,
            isDismissed: false,
            hasPendingStep: false,
            noLocalData: true,
        });

        expect(state.shouldSetStartStep).toBe(true);
        expect(state.isVisible).toBe(true);
    });

    test("keeps visible when a pending step exists", () => {
        const state = getTutorialVisibilityState({
            localSessions: 2,
            isApiKeyLoading: false,
            isDismissed: false,
            hasPendingStep: true,
            noLocalData: false,
        });

        expect(state.shouldSetStartStep).toBe(false);
        expect(state.isVisible).toBe(true);
    });

    test("hides when no pending step and local data exists", () => {
        const state = getTutorialVisibilityState({
            localSessions: 2,
            isApiKeyLoading: false,
            isDismissed: false,
            hasPendingStep: false,
            noLocalData: false,
        });

        expect(state.isVisible).toBe(false);
        expect(state.shouldSetStartStep).toBe(false);
    });
});
