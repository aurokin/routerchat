/**
 * Server-side encryption utilities using Web Crypto API
 *
 * Used for encrypting sensitive data (like API keys) before storing in Convex.
 * Uses AES-256-GCM for authenticated encryption.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96 bits for GCM (recommended)

/**
 * Get the encryption key from environment variables
 */
async function getEncryptionKey(): Promise<CryptoKey> {
    const keyBase64 = process.env.ENCRYPTION_KEY;
    if (!keyBase64) {
        throw new Error("ENCRYPTION_KEY environment variable not set");
    }

    const keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));

    if (keyBytes.length !== 32) {
        throw new Error(
            `Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${keyBytes.length}`,
        );
    }

    return crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ["encrypt", "decrypt"],
    );
}

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * @param plaintext - The string to encrypt
 * @returns Object containing base64-encoded ciphertext and nonce
 */
export async function encrypt(
    plaintext: string,
): Promise<{ ciphertext: string; nonce: string }> {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const ciphertextBuffer = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv },
        key,
        encoder.encode(plaintext),
    );

    return {
        ciphertext: btoa(
            String.fromCharCode(...new Uint8Array(ciphertextBuffer)),
        ),
        nonce: btoa(String.fromCharCode(...iv)),
    };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * @param ciphertext - Base64-encoded ciphertext
 * @param nonce - Base64-encoded nonce/IV
 * @returns Decrypted plaintext string
 */
export async function decrypt(
    ciphertext: string,
    nonce: string,
): Promise<string> {
    const key = await getEncryptionKey();
    const iv = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));
    const ciphertextBytes = Uint8Array.from(atob(ciphertext), (c) =>
        c.charCodeAt(0),
    );

    const plaintextBuffer = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertextBytes,
    );

    return new TextDecoder().decode(plaintextBuffer);
}

/**
 * Check if encryption is available (key is configured)
 */
export function isEncryptionConfigured(): boolean {
    return !!process.env.ENCRYPTION_KEY;
}
