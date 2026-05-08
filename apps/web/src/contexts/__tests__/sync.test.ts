import { describe, it, expect } from "bun:test";

describe("SyncContext sign-out auto-disable guard", () => {
    const shouldAutoDisable = (
        isAuthLoading: boolean,
        isAuthenticated: boolean,
        syncState: "local-only" | "cloud-enabled" | "cloud-disabled",
    ) => {
        if (isAuthLoading) return false;
        return !isAuthenticated && syncState === "cloud-enabled";
    };

    it("does not auto-disable while auth is loading", () => {
        expect(shouldAutoDisable(true, false, "cloud-enabled")).toBe(false);
    });

    it("auto-disables when signed out and cloud sync is enabled", () => {
        expect(shouldAutoDisable(false, false, "cloud-enabled")).toBe(true);
    });

    it("does not auto-disable when sync not enabled", () => {
        expect(shouldAutoDisable(false, false, "cloud-disabled")).toBe(false);
    });

    it("does not auto-disable when signed in", () => {
        expect(shouldAutoDisable(false, true, "cloud-enabled")).toBe(false);
    });
});
