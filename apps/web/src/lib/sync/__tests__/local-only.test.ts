/**
 * Local-Only Mode Tests
 *
 * CRITICAL: These tests verify that the app works without any environment variables.
 * The app MUST function perfectly in local-only mode.
 *
 * Note: Some tests verify server-side behavior since Bun runs in a Node-like environment
 * where `typeof window === "undefined"`. Client-side behavior with localStorage
 * would require a browser environment to test.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getConvexUrl, isConvexConfigured, isServer } from "@/lib/sync/config";
import { LocalStorageAdapter } from "@/lib/sync/local-adapter";
import {
    DEFAULT_SYNC_METADATA,
    CLOUD_IMAGE_QUOTA,
    LOCAL_IMAGE_QUOTA,
} from "@/lib/sync/types";

describe("Local-Only Mode", () => {
    // Store original env values
    let originalConvexUrl: string | undefined;

    beforeEach(() => {
        // Save original value
        originalConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    });

    afterEach(() => {
        // Restore original value
        if (originalConvexUrl !== undefined) {
            process.env.NEXT_PUBLIC_CONVEX_URL = originalConvexUrl;
        } else {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;
        }
    });

    describe("isServer", () => {
        it("returns true in Bun test environment (no window)", () => {
            // In Bun/Node environment, window is undefined
            expect(isServer()).toBe(true);
        });
    });

    describe("isConvexConfigured (server-side)", () => {
        it("returns null on server-side regardless of env var", () => {
            // Server-side returns null to indicate "unknown" status
            process.env.NEXT_PUBLIC_CONVEX_URL =
                "https://valid-convex-url.convex.cloud";
            expect(isConvexConfigured()).toBe(null);
        });

        it("returns null when URL is not set on server-side", () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;
            expect(isConvexConfigured()).toBe(null);
        });
    });

    describe("getConvexUrl (server-side)", () => {
        it("returns null on server-side", () => {
            // Server-side always returns null
            process.env.NEXT_PUBLIC_CONVEX_URL =
                "https://valid-convex-url.convex.cloud";
            expect(getConvexUrl()).toBeNull();
        });

        it("returns null when NEXT_PUBLIC_CONVEX_URL is not set", () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;
            expect(getConvexUrl()).toBeNull();
        });

        it("returns null when NEXT_PUBLIC_CONVEX_URL is empty string", () => {
            process.env.NEXT_PUBLIC_CONVEX_URL = "";
            expect(getConvexUrl()).toBeNull();
        });

        it("returns null when NEXT_PUBLIC_CONVEX_URL is whitespace only", () => {
            process.env.NEXT_PUBLIC_CONVEX_URL = "   ";
            expect(getConvexUrl()).toBeNull();
        });
    });

    describe("LocalStorageAdapter", () => {
        // We can't fully test IndexedDB in Node/Bun environment,
        // but we can verify the adapter exists and has correct interface

        it("exists and is a class", () => {
            expect(LocalStorageAdapter).toBeDefined();
            expect(typeof LocalStorageAdapter).toBe("function");
        });

        it("implements StorageAdapter interface methods", () => {
            // Verify the prototype has all required methods
            const proto = LocalStorageAdapter.prototype;

            // Chat operations
            expect(typeof proto.createChat).toBe("function");
            expect(typeof proto.getChat).toBe("function");
            expect(typeof proto.getAllChats).toBe("function");
            expect(typeof proto.updateChat).toBe("function");
            expect(typeof proto.deleteChat).toBe("function");

            // Message operations
            expect(typeof proto.createMessage).toBe("function");
            expect(typeof proto.getMessagesByChat).toBe("function");
            expect(typeof proto.updateMessage).toBe("function");
            expect(typeof proto.deleteMessage).toBe("function");
            expect(typeof proto.deleteMessagesByChat).toBe("function");

            // Attachment operations
            expect(typeof proto.saveAttachment).toBe("function");
            expect(typeof proto.saveAttachments).toBe("function");
            expect(typeof proto.getAttachment).toBe("function");
            expect(typeof proto.getAttachmentsByMessage).toBe("function");
            expect(typeof proto.deleteAttachment).toBe("function");
            expect(typeof proto.deleteAttachmentsByMessage).toBe("function");

            // Storage operations
            expect(typeof proto.getStorageUsage).toBe("function");
            expect(typeof proto.getImageStorageUsage).toBe("function");
        });
    });

    describe("Graceful Degradation", () => {
        it("does not throw when importing sync types without Convex", async () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;

            // Should not throw
            const types = await import("@/lib/sync/types");
            expect(types.CLOUD_IMAGE_QUOTA).toBeDefined();
            expect(types.LOCAL_IMAGE_QUOTA).toBeDefined();
        });

        it("does not throw when importing config without Convex", async () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;

            // Should not throw
            const config = await import("@/lib/sync/config");
            expect(config.isConvexConfigured).toBeDefined();
            expect(config.getConvexUrl).toBeDefined();
        });

        it("does not throw when importing local adapter without Convex", async () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;

            // Should not throw
            const adapter = await import("@/lib/sync/local-adapter");
            expect(adapter.LocalStorageAdapter).toBeDefined();
        });

        it("does not throw when importing storage adapter interface without Convex", async () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;

            // Should not throw
            const storageAdapter = await import("@/lib/sync/storage-adapter");
            expect(storageAdapter).toBeDefined();
        });
    });

    describe("Type Definitions and Constants", () => {
        it("has correct quota constants", () => {
            expect(CLOUD_IMAGE_QUOTA).toBe(1 * 1024 * 1024 * 1024); // 1GB
            expect(LOCAL_IMAGE_QUOTA).toBe(500 * 1024 * 1024); // 500MB
        });

        it("DEFAULT_SYNC_METADATA has correct structure", () => {
            expect(DEFAULT_SYNC_METADATA).toBeDefined();
            expect(DEFAULT_SYNC_METADATA.syncState).toBe("local-only");
            expect(DEFAULT_SYNC_METADATA.lastSyncAt).toBeNull();
            expect(DEFAULT_SYNC_METADATA.cloudUserId).toBeNull();
            expect(DEFAULT_SYNC_METADATA.migrationCompletedAt).toBeNull();
        });
    });

    describe("Storage Functions (server-side)", () => {
        it("getSyncState returns local-only on server", async () => {
            // On server-side, getSyncState returns the default
            const { getSyncState } = await import("@/lib/storage");
            expect(getSyncState()).toBe("local-only");
        });

        it("getSyncMetadata returns defaults on server", async () => {
            const { getSyncMetadata } = await import("@/lib/storage");
            const metadata = getSyncMetadata();

            expect(metadata.syncState).toBe("local-only");
            expect(metadata.lastSyncAt).toBeNull();
        });
    });

    describe("No Errors Without Convex", () => {
        it("quota module imports without error", async () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;

            const quota = await import("@/lib/sync/quota");
            expect(quota.calculateQuotaStatus).toBeDefined();
            expect(quota.getLocalQuotaStatus).toBeDefined();
            expect(quota.getCloudQuotaStatus).toBeDefined();
            expect(quota.formatBytes).toBeDefined();
        });

        it("migration module imports without error", async () => {
            delete process.env.NEXT_PUBLIC_CONVEX_URL;

            const migration = await import("@/lib/sync/migration");
            expect(migration.migrateLocalToCloud).toBeDefined();
            expect(migration.cloneCloudToLocal).toBeDefined();
        });
    });

    describe("Server-side safety", () => {
        it("config functions are safe to call on server", () => {
            // These should not throw on server-side
            expect(() => isConvexConfigured()).not.toThrow();
            expect(() => getConvexUrl()).not.toThrow();
            expect(() => isServer()).not.toThrow();
        });

        it("storage functions are safe to call on server", async () => {
            const storage = await import("@/lib/storage");

            // These should not throw on server-side
            expect(() => storage.getSyncState()).not.toThrow();
            expect(() => storage.getSyncMetadata()).not.toThrow();
        });
    });
});
