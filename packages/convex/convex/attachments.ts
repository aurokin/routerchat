import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isOwner, requireAuthUserId, requireUserMatches } from "./lib/authz";
import { drainBatches, safeStorageDelete } from "./lib/batch";
import { assertMaxLen, LIMITS } from "./lib/limits";
import {
    applyCloudUsageDelta,
    computeCloudAttachmentUsage,
    ensureCloudUsageCounters,
} from "./lib/cloud_usage";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
]);

function normalizeMimeType(mimeType: string | null | undefined): string | null {
    if (!mimeType) return null;
    const [base] = mimeType.split(";");
    const normalized = base?.trim().toLowerCase() ?? "";
    return normalized || null;
}

/**
 * Attachment Operations
 *
 * CRUD operations for image attachments with Convex file storage.
 */

// Get all attachments for a message
export const listByMessage = query({
    args: { messageId: v.id("messages") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const message = await ctx.db.get(args.messageId);
        if (!isOwner(message, authenticatedUserId)) {
            return [];
        }

        const attachments = await ctx.db
            .query("attachments")
            .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
            .take(LIMITS.maxListAttachments);
        return attachments;
    },
});

// Get a single attachment by ID
export const get = query({
    args: { id: v.id("attachments") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const attachment = await ctx.db.get(args.id);
        if (!isOwner(attachment, authenticatedUserId)) return null;
        return attachment;
    },
});

// Get attachment by local ID (for migration)
export const getByLocalId = query({
    args: {
        userId: v.id("users"),
        localId: v.string(),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");

        return await ctx.db
            .query("attachments")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", authenticatedUserId).eq("localId", args.localId),
            )
            .unique();
    },
});

// Generate an upload URL for a new attachment
export const generateUploadUrl = mutation({
    args: {},
    handler: async (ctx) => {
        await requireAuthUserId(ctx);
        return await ctx.storage.generateUploadUrl();
    },
});

// Get download URL for an attachment
export const getUrl = query({
    args: { storageId: v.id("_storage") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const attachment = await ctx.db
            .query("attachments")
            .withIndex("by_user_storage", (q) =>
                q
                    .eq("userId", authenticatedUserId)
                    .eq("storageId", args.storageId),
            )
            .unique();
        if (!attachment || attachment.purgedAt) return null;

        return await ctx.storage.getUrl(args.storageId);
    },
});

// Create a new attachment record after upload
export const create = mutation({
    args: {
        userId: v.id("users"),
        messageId: v.id("messages"),
        localId: v.optional(v.string()),
        type: v.literal("image"),
        mimeType: v.string(),
        storageId: v.id("_storage"),
        width: v.number(),
        height: v.number(),
        size: v.number(),
        createdAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");

        const uploaded = await ctx.storage.getMetadata(args.storageId);
        if (!uploaded) {
            throw new Error("Uploaded attachment was not found");
        }

        const requestedMimeType = normalizeMimeType(args.mimeType);
        const uploadedMimeType = normalizeMimeType(uploaded.contentType);
        const uploadedSize = uploaded.size;

        if (
            !requestedMimeType ||
            !ALLOWED_IMAGE_MIME_TYPES.has(requestedMimeType)
        ) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Unsupported attachment type");
        }

        if (!uploadedMimeType || uploadedMimeType !== requestedMimeType) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Attachment type mismatch");
        }

        if (!Number.isFinite(uploadedSize) || uploadedSize <= 0) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Attachment metadata is invalid");
        }

        if (uploadedSize !== args.size) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Attachment size mismatch");
        }

        if (uploadedSize > LIMITS.maxAttachmentBytes) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Attachment exceeds maximum size");
        }

        const message = await ctx.db.get(args.messageId);
        if (!isOwner(message, authenticatedUserId)) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Message not found");
        }

        const existingAttachments = await ctx.db
            .query("attachments")
            .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
            .take(LIMITS.maxAttachmentsPerMessage);
        if (existingAttachments.length >= LIMITS.maxAttachmentsPerMessage) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Attachment limit reached");
        }

        const usage = await ensureCloudUsageCounters(ctx, authenticatedUserId);
        if (
            usage.attachmentBytes + uploadedSize >
            LIMITS.maxTotalAttachmentBytesPerUser
        ) {
            await safeStorageDelete(ctx, args.storageId);
            throw new Error("Cloud image storage limit reached");
        }

        const now = Date.now();

        // Create the attachment
        const attachmentId = await ctx.db.insert("attachments", {
            userId: authenticatedUserId,
            messageId: args.messageId,
            localId: args.localId,
            type: args.type,
            mimeType: requestedMimeType,
            storageId: args.storageId,
            width: args.width,
            height: args.height,
            size: uploadedSize,
            createdAt: args.createdAt ?? now,
        });

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            attachmentCount: 1,
            attachmentBytes: uploadedSize,
        });

        return attachmentId;
    },
});

// Delete an attachment
export const remove = mutation({
    args: { id: v.id("attachments") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const attachment = await ctx.db.get(args.id);
        if (!attachment || !isOwner(attachment, authenticatedUserId)) {
            throw new Error("Not found");
        }

        const countsTowardsUsage = !attachment.purgedAt;

        await safeStorageDelete(ctx, attachment.storageId);
        await ctx.db.delete(args.id);

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            attachmentCount: countsTowardsUsage ? -1 : 0,
            attachmentBytes: countsTowardsUsage ? -attachment.size : 0,
        });
    },
});

// Mark an attachment as purged (soft delete)
export const markPurged = mutation({
    args: { id: v.id("attachments") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const attachment = await ctx.db.get(args.id);
        if (!attachment || !isOwner(attachment, authenticatedUserId)) {
            throw new Error("Not found");
        }

        const wasAlreadyPurged = !!attachment.purgedAt;

        await safeStorageDelete(ctx, attachment.storageId);

        // Mark as purged (keep the record for placeholder display)
        await ctx.db.patch(args.id, {
            purgedAt: Date.now(),
        });

        if (!wasAlreadyPurged) {
            await applyCloudUsageDelta(ctx, authenticatedUserId, {
                attachmentCount: -1,
                attachmentBytes: -attachment.size,
            });
        }
    },
});

// Get total image bytes for a user
export const getTotalBytesByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const user = await ctx.db.get(authenticatedUserId);
        const cachedBytes = (user as any)?.cloudAttachmentBytes;
        if (typeof cachedBytes === "number" && Number.isFinite(cachedBytes)) {
            return cachedBytes;
        }

        const usage = await computeCloudAttachmentUsage(
            ctx,
            authenticatedUserId,
        );
        return usage.attachmentBytes;
    },
});

// Get all attachments for a user (for purge operations)
export const listByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        return await ctx.db
            .query("attachments")
            .withIndex("by_user_created", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .order("asc")
            .take(LIMITS.maxListAttachments);
    },
});

// Delete all attachments for a message
export const deleteByMessage = mutation({
    args: { messageId: v.id("messages") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const message = await ctx.db.get(args.messageId);
        if (!isOwner(message, authenticatedUserId)) {
            throw new Error("Message not found");
        }

        let deletedAttachments = 0;
        let freedAttachmentBytes = 0;

        await drainBatches(
            () =>
                ctx.db
                    .query("attachments")
                    .withIndex("by_message", (q) =>
                        q.eq("messageId", args.messageId),
                    )
                    .take(100),
            async (attachment: any) => {
                if (!attachment?.purgedAt) {
                    deletedAttachments++;
                    freedAttachmentBytes += attachment?.size ?? 0;
                }
                await safeStorageDelete(ctx, attachment.storageId);
                await ctx.db.delete(attachment._id);
            },
        );

        if (deletedAttachments > 0 || freedAttachmentBytes > 0) {
            await applyCloudUsageDelta(ctx, authenticatedUserId, {
                attachmentCount: -deletedAttachments,
                attachmentBytes: -freedAttachmentBytes,
            });
        }
    },
});

// Delete all attachments for the current user
export const clearAllForUser = mutation({
    args: {},
    handler: async (ctx) => {
        const userId = await requireAuthUserId(ctx);

        let purgedAttachments = 0;
        let purgedBytes = 0;
        const purgedAt = Date.now();

        let cursor: string | null = null;
        // Avoid accidental infinite loops if cursors don't advance.
        for (let i = 0; i < 100_000; i++) {
            const page = await ctx.db
                .query("attachments")
                .withIndex("by_user_created", (q) => q.eq("userId", userId))
                .order("asc")
                .paginate({ numItems: 200, cursor });

            for (const attachment of page.page as any[]) {
                // Always try to delete the backing storage object (idempotent).
                await safeStorageDelete(ctx, attachment.storageId);

                if (attachment?.purgedAt) {
                    continue;
                }

                purgedAttachments++;
                purgedBytes += attachment?.size ?? 0;
                await ctx.db.patch(attachment._id, { purgedAt });
            }

            if (page.isDone) break;

            if (page.continueCursor === cursor) {
                throw new Error("Pagination cursor did not advance");
            }
            cursor = page.continueCursor;
        }

        if (purgedAttachments > 0 || purgedBytes > 0) {
            await applyCloudUsageDelta(ctx, userId, {
                attachmentCount: -purgedAttachments,
                attachmentBytes: -purgedBytes,
            });
        }
    },
});
