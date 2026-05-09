import { ConvexError, v } from "convex/values";
import {
    action,
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { encrypt, decrypt, isEncryptionConfigured } from "./lib/encryption";
import { requireAuthUserId } from "./lib/authz";
import type { Id } from "./_generated/dataModel";

/**
 * Set (or update) the user's encrypted API key
 */
export const setApiKey = mutation({
    args: { apiKey: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await requireAuthUserId(ctx);

        if (!isEncryptionConfigured()) {
            throw new ConvexError({
                code: "ENCRYPTION_NOT_CONFIGURED",
                message: "Encryption is not configured on the server",
            });
        }

        const { ciphertext, nonce } = await encrypt(args.apiKey);

        await ctx.db.patch(userId, {
            encryptedApiKey: ciphertext,
            apiKeyNonce: nonce,
            apiKeyUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });

        return null;
    },
});

/**
 * Internal query: returns the encrypted API key blob for a specific user.
 * Only callable from server-side actions (never from clients).
 */
export const getEncryptedApiKey = internalQuery({
    args: { userId: v.id("users") },
    returns: v.union(
        v.null(),
        v.object({
            encryptedApiKey: v.string(),
            apiKeyNonce: v.string(),
        }),
    ),
    handler: async (ctx, args) => {
        const user = await ctx.db.get(args.userId);
        if (!user?.encryptedApiKey || !user?.apiKeyNonce) {
            return null;
        }
        return {
            encryptedApiKey: user.encryptedApiKey,
            apiKeyNonce: user.apiKeyNonce,
        };
    },
});

/**
 * Internal mutation: append-only audit log entry for API key access.
 */
export const recordApiKeyAccess = internalMutation({
    args: {
        userId: v.id("users"),
        kind: v.union(v.literal("read"), v.literal("read_failed")),
        reason: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await ctx.db.insert("apiKeyAccess", {
            userId: args.userId,
            kind: args.kind,
            reason: args.reason,
            accessedAt: Date.now(),
        });
        return null;
    },
});

/**
 * Get the caller's decrypted API key.
 *
 * Implemented as an `action` so the plaintext value is not subscribable as a
 * reactive query, and so that every read is recorded in the audit log.
 *
 * Returns `null` when:
 *   - the caller isn't authenticated
 *   - the caller has no stored key
 *   - encryption isn't configured
 *   - decryption fails (corrupt data, key rotation mismatch, etc.)
 */
export const getDecryptedApiKey = action({
    args: {},
    returns: v.union(v.null(), v.string()),
    handler: async (ctx): Promise<string | null> => {
        const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
        if (!userId) {
            return null;
        }

        const encrypted = await ctx.runQuery(
            internal.apiKey.getEncryptedApiKey,
            {
                userId,
            },
        );
        if (!encrypted) {
            return null;
        }

        if (!isEncryptionConfigured()) {
            await ctx.runMutation(internal.apiKey.recordApiKeyAccess, {
                userId,
                kind: "read_failed",
                reason: "encryption_not_configured",
            });
            return null;
        }

        try {
            const plaintext = await decrypt(
                encrypted.encryptedApiKey,
                encrypted.apiKeyNonce,
            );
            await ctx.runMutation(internal.apiKey.recordApiKeyAccess, {
                userId,
                kind: "read",
            });
            return plaintext;
        } catch {
            await ctx.runMutation(internal.apiKey.recordApiKeyAccess, {
                userId,
                kind: "read_failed",
                reason: "decryption_failed",
            });
            return null;
        }
    },
});

/**
 * Clear the user's API key from the cloud
 */
export const clearApiKey = mutation({
    args: {},
    returns: v.null(),
    handler: async (ctx) => {
        const userId = await requireAuthUserId(ctx);

        await ctx.db.patch(userId, {
            encryptedApiKey: undefined,
            apiKeyNonce: undefined,
            apiKeyUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        });

        return null;
    },
});

/**
 * Check if the user has an API key stored in the cloud
 */
export const hasApiKey = query({
    args: {},
    returns: v.boolean(),
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) {
            return false;
        }

        const user = await ctx.db.get(userId);
        return !!(user?.encryptedApiKey && user?.apiKeyNonce);
    },
});
