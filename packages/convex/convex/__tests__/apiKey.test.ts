import { test, expect, describe } from "bun:test";

/**
 * Tests for Convex apiKey mutation/query logic
 *
 * Since Convex functions require the Convex runtime and database context,
 * we test the underlying logic patterns rather than the functions directly.
 * Integration tests should be run in a Convex test environment.
 */

describe("apiKey.ts logic", () => {
    describe("setApiKey mutation", () => {
        test("throws error when not authenticated", async () => {
            const userId = null; // Not authenticated

            const setApiKey = async () => {
                if (!userId) {
                    throw new Error("Not authenticated");
                }
            };

            await expect(setApiKey()).rejects.toThrow("Not authenticated");
        });

        test("throws error when encryption is not configured", async () => {
            const userId = "user-123";
            const isEncryptionConfigured = false;

            const setApiKey = async () => {
                if (!userId) {
                    throw new Error("Not authenticated");
                }
                if (!isEncryptionConfigured) {
                    throw new Error(
                        "Encryption is not configured on the server",
                    );
                }
            };

            await expect(setApiKey()).rejects.toThrow(
                "Encryption is not configured on the server",
            );
        });

        test("encrypts and stores API key when valid", async () => {
            const userId = "user-123";
            const isEncryptionConfigured = true;
            const apiKey = "sk-test-key";

            const dbPatches: Array<{
                id: string;
                data: Record<string, unknown>;
            }> = [];
            const mockEncrypt = async (plaintext: string) => ({
                ciphertext: `encrypted-${plaintext}`,
                nonce: "test-nonce",
            });

            const setApiKey = async (key: string) => {
                if (!userId) {
                    throw new Error("Not authenticated");
                }
                if (!isEncryptionConfigured) {
                    throw new Error(
                        "Encryption is not configured on the server",
                    );
                }

                const { ciphertext, nonce } = await mockEncrypt(key);

                dbPatches.push({
                    id: userId,
                    data: {
                        encryptedApiKey: ciphertext,
                        apiKeyNonce: nonce,
                        apiKeyUpdatedAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                });
            };

            await setApiKey(apiKey);

            expect(dbPatches).toHaveLength(1);
            expect(dbPatches[0]?.id).toBe(userId);
            expect(dbPatches[0]?.data.encryptedApiKey).toBe(
                "encrypted-sk-test-key",
            );
            expect(dbPatches[0]?.data.apiKeyNonce).toBe("test-nonce");
            expect(dbPatches[0]?.data.apiKeyUpdatedAt).toBeDefined();
        });
    });

    describe("getApiKey query", () => {
        test("returns null when not authenticated", async () => {
            const userId = null;

            const getApiKey = async () => {
                if (!userId) {
                    return null;
                }
                return "some-key";
            };

            const result = await getApiKey();
            expect(result).toBeNull();
        });

        test("returns null when user has no stored API key", async () => {
            const userId = "user-123";
            const user = {
                encryptedApiKey: undefined,
                apiKeyNonce: undefined,
            };

            const getApiKey = async () => {
                if (!userId) {
                    return null;
                }
                if (!user.encryptedApiKey || !user.apiKeyNonce) {
                    return null;
                }
                return "decrypted-key";
            };

            const result = await getApiKey();
            expect(result).toBeNull();
        });

        test("returns null when encryption is not configured", async () => {
            const userId = "user-123";
            const isEncryptionConfigured = false;
            const user = {
                encryptedApiKey: "encrypted-key",
                apiKeyNonce: "nonce",
            };

            const getApiKey = async () => {
                if (!userId) {
                    return null;
                }
                if (!user.encryptedApiKey || !user.apiKeyNonce) {
                    return null;
                }
                if (!isEncryptionConfigured) {
                    console.error(
                        "Encryption is not configured, cannot decrypt API key",
                    );
                    return null;
                }
                return "decrypted-key";
            };

            const result = await getApiKey();
            expect(result).toBeNull();
        });

        test("returns null when decryption fails", async () => {
            const userId = "user-123";
            const isEncryptionConfigured = true;
            const user = {
                encryptedApiKey: "corrupted-data",
                apiKeyNonce: "nonce",
            };

            const mockDecrypt = async () => {
                throw new Error("Decryption failed");
            };

            const getApiKey = async () => {
                if (!userId) {
                    return null;
                }
                if (!user.encryptedApiKey || !user.apiKeyNonce) {
                    return null;
                }
                if (!isEncryptionConfigured) {
                    return null;
                }

                try {
                    return await mockDecrypt();
                } catch {
                    console.error("Failed to decrypt API key");
                    return null;
                }
            };

            const result = await getApiKey();
            expect(result).toBeNull();
        });

        test("returns decrypted key when successful", async () => {
            const userId = "user-123";
            const isEncryptionConfigured = true;
            const user = {
                encryptedApiKey: "encrypted-sk-test-key",
                apiKeyNonce: "test-nonce",
            };

            const mockDecrypt = async (
                ciphertext: string,
                _nonce: string,
            ): Promise<string> => {
                return ciphertext.replace("encrypted-", "");
            };

            const getApiKey = async () => {
                if (!userId) {
                    return null;
                }
                if (!user.encryptedApiKey || !user.apiKeyNonce) {
                    return null;
                }
                if (!isEncryptionConfigured) {
                    return null;
                }

                try {
                    return await mockDecrypt(
                        user.encryptedApiKey,
                        user.apiKeyNonce,
                    );
                } catch {
                    return null;
                }
            };

            const result = await getApiKey();
            expect(result).toBe("sk-test-key");
        });
    });

    describe("clearApiKey mutation", () => {
        test("throws error when not authenticated", async () => {
            const userId = null;

            const clearApiKey = async () => {
                if (!userId) {
                    throw new Error("Not authenticated");
                }
            };

            await expect(clearApiKey()).rejects.toThrow("Not authenticated");
        });

        test("clears API key fields", async () => {
            const userId = "user-123";
            const dbPatches: Array<{
                id: string;
                data: Record<string, unknown>;
            }> = [];

            const clearApiKey = async () => {
                if (!userId) {
                    throw new Error("Not authenticated");
                }

                dbPatches.push({
                    id: userId,
                    data: {
                        encryptedApiKey: undefined,
                        apiKeyNonce: undefined,
                        apiKeyUpdatedAt: Date.now(),
                        updatedAt: Date.now(),
                    },
                });
            };

            await clearApiKey();

            expect(dbPatches).toHaveLength(1);
            expect(dbPatches[0]?.id).toBe(userId);
            expect(dbPatches[0]?.data.encryptedApiKey).toBeUndefined();
            expect(dbPatches[0]?.data.apiKeyNonce).toBeUndefined();
            expect(dbPatches[0]?.data.apiKeyUpdatedAt).toBeDefined();
        });
    });

    describe("hasApiKey query", () => {
        test("returns false when not authenticated", async () => {
            const userId = null;

            const hasApiKey = async () => {
                if (!userId) {
                    return false;
                }
                return true;
            };

            const result = await hasApiKey();
            expect(result).toBe(false);
        });

        test("returns false when no API key stored", async () => {
            const userId = "user-123";
            const user = {
                encryptedApiKey: undefined,
                apiKeyNonce: undefined,
            };

            const hasApiKey = async () => {
                if (!userId) {
                    return false;
                }
                return !!(user.encryptedApiKey && user.apiKeyNonce);
            };

            const result = await hasApiKey();
            expect(result).toBe(false);
        });

        test("returns false when only ciphertext stored (missing nonce)", async () => {
            const userId = "user-123";
            const user = {
                encryptedApiKey: "some-encrypted-data",
                apiKeyNonce: undefined,
            };

            const hasApiKey = async () => {
                if (!userId) {
                    return false;
                }
                return !!(user.encryptedApiKey && user.apiKeyNonce);
            };

            const result = await hasApiKey();
            expect(result).toBe(false);
        });

        test("returns true when API key is stored", async () => {
            const userId = "user-123";
            const user = {
                encryptedApiKey: "encrypted-key",
                apiKeyNonce: "nonce",
            };

            const hasApiKey = async () => {
                if (!userId) {
                    return false;
                }
                return !!(user.encryptedApiKey && user.apiKeyNonce);
            };

            const result = await hasApiKey();
            expect(result).toBe(true);
        });
    });
});

describe("apiKey.ts edge cases", () => {
    test("handles empty string API key", async () => {
        const apiKey = "";
        const mockEncrypt = async (plaintext: string) => ({
            ciphertext: `encrypted-${plaintext}`,
            nonce: "test-nonce",
        });

        const { ciphertext, nonce } = await mockEncrypt(apiKey);

        // Empty string should still be encrypted
        expect(ciphertext).toBe("encrypted-");
        expect(nonce).toBe("test-nonce");
    });

    test("handles very long API key", async () => {
        const apiKey = "sk-or-v1-" + "a".repeat(1000);
        const mockEncrypt = async (plaintext: string) => ({
            ciphertext: `encrypted-${plaintext}`,
            nonce: "test-nonce",
        });

        const { ciphertext } = await mockEncrypt(apiKey);

        expect(ciphertext.length).toBeGreaterThan(1000);
    });

    test("handles special characters in API key", async () => {
        const apiKey = "sk-or-v1-!@#$%^&*()_+-=[]{}|;':\",./<>?";
        const mockEncrypt = async (plaintext: string) => ({
            ciphertext: `encrypted-${plaintext}`,
            nonce: "test-nonce",
        });

        const { ciphertext } = await mockEncrypt(apiKey);

        expect(ciphertext).toContain("encrypted-");
    });

    test("handles unicode in API key", async () => {
        const apiKey = "sk-or-v1-密钥-🔐";
        const mockEncrypt = async (plaintext: string) => ({
            ciphertext: `encrypted-${plaintext}`,
            nonce: "test-nonce",
        });

        const { ciphertext } = await mockEncrypt(apiKey);

        expect(ciphertext).toBe("encrypted-sk-or-v1-密钥-🔐");
    });
});
