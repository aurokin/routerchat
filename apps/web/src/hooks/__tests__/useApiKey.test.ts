import { describe, expect, test } from "bun:test";
import {
    isApiKeyCloudEnabled,
    isApiKeyLoadingState,
    resolveApiKeyValue,
} from "@/hooks/useApiKey";

describe("useApiKey helpers", () => {
    describe("isApiKeyCloudEnabled", () => {
        test("returns true when all cloud requirements are met", () => {
            expect(
                isApiKeyCloudEnabled({
                    isConvexAvailable: true,
                    isAuthenticated: true,
                    syncState: "cloud-enabled",
                }),
            ).toBe(true);
        });

        test("returns false when Convex is unavailable", () => {
            expect(
                isApiKeyCloudEnabled({
                    isConvexAvailable: false,
                    isAuthenticated: true,
                    syncState: "cloud-enabled",
                }),
            ).toBe(false);
        });

        test("returns false when user is unauthenticated", () => {
            expect(
                isApiKeyCloudEnabled({
                    isConvexAvailable: true,
                    isAuthenticated: false,
                    syncState: "cloud-enabled",
                }),
            ).toBe(false);
        });

        test("returns false when sync is not cloud-enabled", () => {
            expect(
                isApiKeyCloudEnabled({
                    isConvexAvailable: true,
                    isAuthenticated: true,
                    syncState: "local-only",
                }),
            ).toBe(false);
        });
    });

    describe("resolveApiKeyValue", () => {
        test("uses local value when cloud is disabled", () => {
            expect(
                resolveApiKeyValue({
                    isCloudEnabled: false,
                    cloudApiKey: "cloud-key",
                    localApiKey: "local-key",
                }),
            ).toBe("local-key");
        });

        test("uses cloud value when cloud is enabled", () => {
            expect(
                resolveApiKeyValue({
                    isCloudEnabled: true,
                    cloudApiKey: "cloud-key",
                    localApiKey: "local-key",
                }),
            ).toBe("cloud-key");
        });

        test("returns null while cloud value is loading", () => {
            expect(
                resolveApiKeyValue({
                    isCloudEnabled: true,
                    cloudApiKey: undefined,
                    localApiKey: "local-key",
                }),
            ).toBeNull();
        });

        test("returns null when cloud has no stored key", () => {
            expect(
                resolveApiKeyValue({
                    isCloudEnabled: true,
                    cloudApiKey: null,
                    localApiKey: "local-key",
                }),
            ).toBeNull();
        });

        test("preserves empty string cloud keys", () => {
            expect(
                resolveApiKeyValue({
                    isCloudEnabled: true,
                    cloudApiKey: "",
                    localApiKey: "local-key",
                }),
            ).toBe("");
        });
    });

    describe("isApiKeyLoadingState", () => {
        test("is false when cloud mode is disabled", () => {
            expect(
                isApiKeyLoadingState({
                    isCloudEnabled: false,
                    cloudApiKey: undefined,
                }),
            ).toBe(false);
        });

        test("is true when cloud mode is enabled and query is pending", () => {
            expect(
                isApiKeyLoadingState({
                    isCloudEnabled: true,
                    cloudApiKey: undefined,
                }),
            ).toBe(true);
        });

        test("is false when cloud mode is enabled and key is loaded", () => {
            expect(
                isApiKeyLoadingState({
                    isCloudEnabled: true,
                    cloudApiKey: "loaded",
                }),
            ).toBe(false);
        });

        test("is false when cloud mode is enabled and key is null", () => {
            expect(
                isApiKeyLoadingState({
                    isCloudEnabled: true,
                    cloudApiKey: null,
                }),
            ).toBe(false);
        });
    });
});
