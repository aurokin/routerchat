import { test, expect, describe, beforeEach, afterEach } from "vitest";

// Store original env
const originalEnv = { ...process.env };

// Valid 32-byte key for testing (exactly 32 bytes, base64 encoded)
const VALID_32_BYTE_KEY = Buffer.from(
    "12345678901234567890123456789012",
).toString("base64"); // Exactly 32 bytes

describe("encryption.ts", () => {
    beforeEach(() => {
        // Reset env before each test
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        // Restore original env
        process.env = originalEnv;
    });

    describe("isEncryptionConfigured", () => {
        test("returns false when ENCRYPTION_KEY is not set", async () => {
            delete process.env.ENCRYPTION_KEY;

            // Re-import to get fresh module state
            const { isEncryptionConfigured } = await import("../encryption");
            expect(isEncryptionConfigured()).toBe(false);
        });

        test("returns true when ENCRYPTION_KEY is set", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { isEncryptionConfigured } = await import("../encryption");
            expect(isEncryptionConfigured()).toBe(true);
        });

        test("returns true for any non-empty ENCRYPTION_KEY", async () => {
            process.env.ENCRYPTION_KEY = "any-value";

            const { isEncryptionConfigured } = await import("../encryption");
            expect(isEncryptionConfigured()).toBe(true);
        });
    });

    describe("encrypt", () => {
        test("throws error when ENCRYPTION_KEY is not set", async () => {
            delete process.env.ENCRYPTION_KEY;

            const { encrypt } = await import("../encryption");

            expect(encrypt("test")).rejects.toThrow(
                "ENCRYPTION_KEY environment variable not set",
            );
        });

        test("throws error for invalid key length", async () => {
            // Key that's not 32 bytes
            process.env.ENCRYPTION_KEY =
                Buffer.from("short-key").toString("base64");

            const { encrypt } = await import("../encryption");

            expect(encrypt("test")).rejects.toThrow(
                "Invalid ENCRYPTION_KEY length",
            );
        });

        test("returns ciphertext and nonce for valid input", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const result = await encrypt("test-plaintext");

            expect(result).toHaveProperty("ciphertext");
            expect(result).toHaveProperty("nonce");
            expect(typeof result.ciphertext).toBe("string");
            expect(typeof result.nonce).toBe("string");
        });

        test("ciphertext is base64 encoded", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const result = await encrypt("test-plaintext");

            // Base64 should not throw when decoded
            expect(() => atob(result.ciphertext)).not.toThrow();
            expect(() => atob(result.nonce)).not.toThrow();
        });

        test("nonce is 12 bytes (96 bits) for GCM", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const result = await encrypt("test-plaintext");

            const nonceBytes = Uint8Array.from(atob(result.nonce), (c) =>
                c.charCodeAt(0),
            );
            expect(nonceBytes.length).toBe(12);
        });

        test("generates unique nonce for each encryption", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const result1 = await encrypt("same-plaintext");
            const result2 = await encrypt("same-plaintext");

            // Nonces should be different (random)
            expect(result1.nonce).not.toBe(result2.nonce);
            // Ciphertexts should also be different due to different nonces
            expect(result1.ciphertext).not.toBe(result2.ciphertext);
        });

        test("encrypts empty string", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const result = await encrypt("");

            expect(result.ciphertext).toBeDefined();
            expect(result.nonce).toBeDefined();
        });

        test("encrypts unicode characters", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const result = await encrypt("Hello 世界 🔐");

            expect(result.ciphertext).toBeDefined();
            expect(result.nonce).toBeDefined();
        });

        test("encrypts long strings", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const longString = "a".repeat(10000);
            const result = await encrypt(longString);

            expect(result.ciphertext).toBeDefined();
            expect(result.nonce).toBeDefined();
        });
    });

    describe("decrypt", () => {
        test("throws error when ENCRYPTION_KEY is not set", async () => {
            delete process.env.ENCRYPTION_KEY;

            const { decrypt } = await import("../encryption");

            expect(decrypt("ciphertext", "nonce")).rejects.toThrow(
                "ENCRYPTION_KEY environment variable not set",
            );
        });

        test("throws error for invalid ciphertext", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { decrypt } = await import("../encryption");

            // Invalid base64 or corrupted data should fail authentication
            expect(
                decrypt("invalid", "aW52YWxpZC1ub25jZQ=="),
            ).rejects.toThrow();
        });

        test("throws error for wrong nonce", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            const { ciphertext } = await encrypt("test-plaintext");

            // Use wrong nonce (12 bytes but different)
            const wrongNonce = Buffer.from("wrongnonce12").toString("base64");

            expect(decrypt(ciphertext, wrongNonce)).rejects.toThrow();
        });

        test("throws error for tampered ciphertext", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            const { ciphertext, nonce } = await encrypt("test-plaintext");

            // Tamper with ciphertext
            const ciphertextBytes = Uint8Array.from(atob(ciphertext), (c) =>
                c.charCodeAt(0),
            );
            if (ciphertextBytes[0] !== undefined) {
                ciphertextBytes[0] ^= 0xff; // Flip bits
            }
            const tamperedCiphertext = btoa(
                String.fromCharCode(...ciphertextBytes),
            );

            expect(decrypt(tamperedCiphertext, nonce)).rejects.toThrow();
        });
    });

    describe("encrypt/decrypt round-trip", () => {
        test("decrypts to original plaintext", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            const plaintext = "my-secret-api-key-12345";

            const { ciphertext, nonce } = await encrypt(plaintext);
            const decrypted = await decrypt(ciphertext, nonce);

            expect(decrypted).toBe(plaintext);
        });

        test("round-trip with empty string", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            const plaintext = "";

            const { ciphertext, nonce } = await encrypt(plaintext);
            const decrypted = await decrypt(ciphertext, nonce);

            expect(decrypted).toBe(plaintext);
        });

        test("round-trip with unicode characters", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            const plaintext = "API密钥: sk-test-🔑";

            const { ciphertext, nonce } = await encrypt(plaintext);
            const decrypted = await decrypt(ciphertext, nonce);

            expect(decrypted).toBe(plaintext);
        });

        test("round-trip with special characters", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            const plaintext = "sk-or-v1-abc123!@#$%^&*()_+-=[]{}|;':\",./<>?";

            const { ciphertext, nonce } = await encrypt(plaintext);
            const decrypted = await decrypt(ciphertext, nonce);

            expect(decrypted).toBe(plaintext);
        });

        test("round-trip with long API key", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            // Simulate a long OpenRouter API key
            const plaintext = "sk-or-v1-" + "a".repeat(100);

            const { ciphertext, nonce } = await encrypt(plaintext);
            const decrypted = await decrypt(ciphertext, nonce);

            expect(decrypted).toBe(plaintext);
        });

        test("multiple round-trips with same key", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt, decrypt } = await import("../encryption");
            const plaintexts = [
                "key-1",
                "key-2-longer",
                "key-3-with-special-!@#",
                "",
                "unicode-密钥",
            ];

            for (const plaintext of plaintexts) {
                const { ciphertext, nonce } = await encrypt(plaintext);
                const decrypted = await decrypt(ciphertext, nonce);
                expect(decrypted).toBe(plaintext);
            }
        });
    });

    describe("security properties", () => {
        test("ciphertext does not contain plaintext", async () => {
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;

            const { encrypt } = await import("../encryption");
            const plaintext = "my-secret-api-key";

            const { ciphertext } = await encrypt(plaintext);

            // Decode ciphertext and check it doesn't contain plaintext
            const decodedCiphertext = atob(ciphertext);
            expect(decodedCiphertext).not.toContain(plaintext);
        });

        test("different keys produce different ciphertexts", async () => {
            const plaintext = "same-plaintext";

            // First key
            process.env.ENCRYPTION_KEY = VALID_32_BYTE_KEY;
            const { encrypt: encrypt1 } = await import("../encryption");
            const result1 = await encrypt1(plaintext);

            // Different key (exactly 32 bytes)
            const differentKey = "abcdefghijklmnopqrstuvwxyz123456"; // 32 chars
            const key2 = await crypto.subtle.importKey(
                "raw",
                new TextEncoder().encode(differentKey),
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt"],
            );

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext2 = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv },
                key2,
                new TextEncoder().encode(plaintext),
            );

            // The ciphertexts should be different (different keys + different IVs)
            expect(result1.ciphertext).not.toBe(
                btoa(String.fromCharCode(...new Uint8Array(ciphertext2))),
            );
        });
    });
});
