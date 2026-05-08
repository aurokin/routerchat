import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { encrypt, decrypt, isEncryptionConfigured } from "./lib/encryption";
import { requireAuthUserId } from "./lib/authz";

/**
 * Set (or update) the user's encrypted API key
 */
export const setApiKey = mutation({
    args: { apiKey: v.string() },
    handler: async (ctx, args) => {
        const userId = await requireAuthUserId(ctx);

        if (!isEncryptionConfigured()) {
            throw new Error("Encryption is not configured on the server");
        }

        const { ciphertext, nonce } = await encrypt(args.apiKey);

        await ctx.db.patch(userId, {
            encryptedApiKey: ciphertext,
            apiKeyNonce: nonce,
            apiKeyUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

/**
 * Get the user's decrypted API key
 * Returns null if no API key is stored or if decryption fails
 */
export const getApiKey = query({
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return null;
        }

        const user = await ctx.db.get(userId);
        if (!user?.encryptedApiKey || !user?.apiKeyNonce) {
            return null;
        }

        if (!isEncryptionConfigured()) {
            console.error(
                "Encryption is not configured, cannot decrypt API key",
            );
            return null;
        }

        try {
            return await decrypt(user.encryptedApiKey, user.apiKeyNonce);
        } catch (error) {
            console.error("Failed to decrypt API key:", error);
            return null;
        }
    },
});

/**
 * Clear the user's API key from the cloud
 */
export const clearApiKey = mutation({
    handler: async (ctx) => {
        const userId = await requireAuthUserId(ctx);

        await ctx.db.patch(userId, {
            encryptedApiKey: undefined,
            apiKeyNonce: undefined,
            apiKeyUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });
    },
});

/**
 * Check if the user has an API key stored in the cloud
 */
export const hasApiKey = query({
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return false;
        }

        const user = await ctx.db.get(userId);
        return !!(user?.encryptedApiKey && user?.apiKeyNonce);
    },
});
