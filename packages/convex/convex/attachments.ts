import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { isOwner, requireAuthUserId, requireUserMatches } from "./lib/authz";
import { enqueueDeleteOperation } from "./lib/delete_operations";
import { safeStorageDelete } from "./lib/storage";
import { assertMaxLen, LIMITS } from "./lib/limits";
import {
    deleteAttachmentUsage,
    ensureCloudUsageBackfilled,
    getCloudAttachmentStorageBytes,
    getCloudUsage,
    insertAttachmentUsage,
} from "./lib/usage_aggregates";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
]);
const ALLOWED_FILE_MIME_TYPES = new Set(["application/pdf"]);

const attachmentDocValidator = v.object({
    _id: v.id("attachments"),
    _creationTime: v.number(),
    userId: v.id("users"),
    messageId: v.id("messages"),
    localId: v.optional(v.string()),
    type: v.union(v.literal("image"), v.literal("file")),
    mimeType: v.string(),
    storageId: v.optional(v.id("_storage")),
    url: v.optional(v.string()),
    filename: v.optional(v.string()),
    width: v.number(),
    height: v.number(),
    size: v.number(),
    purgedAt: v.optional(v.number()),
    createdAt: v.number(),
});

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
    returns: v.array(attachmentDocValidator),
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
    returns: v.union(v.null(), attachmentDocValidator),
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
    returns: v.union(v.null(), attachmentDocValidator),
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
    returns: v.string(),
    handler: async (ctx) => {
        await requireAuthUserId(ctx);
        return await ctx.storage.generateUploadUrl();
    },
});

// Get download URL for an attachment
export const getUrl = query({
    args: { storageId: v.id("_storage") },
    returns: v.union(v.null(), v.string()),
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
        type: v.union(v.literal("image"), v.literal("file")),
        mimeType: v.string(),
        storageId: v.optional(v.id("_storage")),
        url: v.optional(v.string()),
        filename: v.optional(v.string()),
        width: v.number(),
        height: v.number(),
        size: v.number(),
        createdAt: v.optional(v.number()),
    },
    returns: v.id("attachments"),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");

        const requestedMimeType = normalizeMimeType(args.mimeType);
        const allowedMimeTypes =
            args.type === "image"
                ? ALLOWED_IMAGE_MIME_TYPES
                : ALLOWED_FILE_MIME_TYPES;
        if (!requestedMimeType || !allowedMimeTypes.has(requestedMimeType)) {
            if (args.storageId) {
                await safeStorageDelete(ctx, args.storageId);
            }
            throw new ConvexError({
                code: "ATTACHMENT_TYPE_UNSUPPORTED",
                message: "Unsupported attachment type",
                mimeType: requestedMimeType,
            });
        }

        if (!args.storageId && !args.url) {
            throw new ConvexError({
                code: "ATTACHMENT_SOURCE_REQUIRED",
                message: "Attachment requires a stored file or URL",
            });
        }

        let uploadedSize = args.size;
        if (args.storageId) {
            const uploaded = await ctx.storage.getMetadata(args.storageId);
            if (!uploaded) {
                throw new ConvexError({
                    code: "STORAGE_NOT_FOUND",
                    message: "Uploaded attachment was not found",
                });
            }

            const uploadedMimeType = normalizeMimeType(uploaded.contentType);
            uploadedSize = uploaded.size;

            if (!uploadedMimeType || uploadedMimeType !== requestedMimeType) {
                await safeStorageDelete(ctx, args.storageId);
                throw new ConvexError({
                    code: "ATTACHMENT_TYPE_MISMATCH",
                    message: "Attachment type mismatch",
                });
            }

            if (!Number.isFinite(uploadedSize) || uploadedSize <= 0) {
                await safeStorageDelete(ctx, args.storageId);
                throw new ConvexError({
                    code: "ATTACHMENT_INVALID_METADATA",
                    message: "Attachment metadata is invalid",
                });
            }

            if (uploadedSize !== args.size) {
                await safeStorageDelete(ctx, args.storageId);
                throw new ConvexError({
                    code: "ATTACHMENT_SIZE_MISMATCH",
                    message: "Attachment size mismatch",
                });
            }
        } else if (!Number.isFinite(uploadedSize) || uploadedSize < 0) {
            throw new ConvexError({
                code: "ATTACHMENT_INVALID_METADATA",
                message: "Attachment metadata is invalid",
            });
        }

        if (uploadedSize > LIMITS.maxAttachmentBytes) {
            if (args.storageId) await safeStorageDelete(ctx, args.storageId);
            throw new ConvexError({
                code: "ATTACHMENT_TOO_LARGE",
                message: "Attachment exceeds maximum size",
                maxBytes: LIMITS.maxAttachmentBytes,
                actualBytes: uploadedSize,
            });
        }

        const message = await ctx.db.get(args.messageId);
        if (!isOwner(message, authenticatedUserId)) {
            if (args.storageId) await safeStorageDelete(ctx, args.storageId);
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Message not found",
                resource: "messages",
            });
        }

        const existingAttachments = await ctx.db
            .query("attachments")
            .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
            .take(LIMITS.maxAttachmentsPerMessage);
        if (existingAttachments.length >= LIMITS.maxAttachmentsPerMessage) {
            if (args.storageId) await safeStorageDelete(ctx, args.storageId);
            throw new ConvexError({
                code: "LIMIT_REACHED",
                message: "Attachment limit reached",
                resource: "attachments",
            });
        }

        await ensureCloudUsageBackfilled(ctx, authenticatedUserId);
        const attachmentStorageBytes = await getCloudAttachmentStorageBytes(
            ctx,
            authenticatedUserId,
        );
        if (
            args.storageId &&
            attachmentStorageBytes + uploadedSize >
                LIMITS.maxTotalAttachmentBytesPerUser
        ) {
            if (args.storageId) await safeStorageDelete(ctx, args.storageId);
            throw new ConvexError({
                code: "STORAGE_LIMIT_REACHED",
                message: "Cloud attachment storage limit reached",
            });
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
            url: args.url,
            filename: args.filename,
            width: args.width,
            height: args.height,
            size: uploadedSize,
            createdAt: args.createdAt ?? now,
        });

        const attachment = await ctx.db.get(attachmentId);
        await insertAttachmentUsage(ctx, attachment!);

        return attachmentId;
    },
});

// Delete an attachment
export const remove = mutation({
    args: { id: v.id("attachments") },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const attachment = await ctx.db.get(args.id);
        if (!attachment || !isOwner(attachment, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Attachment not found",
                resource: "attachments",
            });
        }

        const countsTowardsUsage = !attachment.purgedAt;

        if (attachment.storageId) {
            await safeStorageDelete(ctx, attachment.storageId);
        }
        await ctx.db.delete(args.id);
        if (countsTowardsUsage) {
            await deleteAttachmentUsage(ctx, attachment);
        }

        return null;
    },
});

// Mark an attachment as purged (soft delete)
export const markPurged = mutation({
    args: { id: v.id("attachments") },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const attachment = await ctx.db.get(args.id);
        if (!attachment || !isOwner(attachment, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Attachment not found",
                resource: "attachments",
            });
        }

        const wasAlreadyPurged = !!attachment.purgedAt;

        if (attachment.storageId) {
            await safeStorageDelete(ctx, attachment.storageId);
        }

        // Mark as purged (keep the record for placeholder display)
        await ctx.db.patch(args.id, {
            purgedAt: Date.now(),
        });

        if (!wasAlreadyPurged) {
            await deleteAttachmentUsage(ctx, attachment);
        }

        return null;
    },
});

// Get total image bytes for a user
export const getTotalBytesByUser = query({
    args: { userId: v.id("users") },
    returns: v.number(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const usage = await getCloudUsage(ctx, authenticatedUserId);
        return usage.attachmentBytes;
    },
});

// Get all attachments for a user (for purge operations)
export const listByUser = query({
    args: { userId: v.id("users") },
    returns: v.array(attachmentDocValidator),
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
    returns: v.id("deleteOperations"),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const message = await ctx.db.get(args.messageId);
        if (!isOwner(message, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Message not found",
                resource: "messages",
            });
        }

        return await enqueueDeleteOperation(ctx, {
            userId: authenticatedUserId,
            kind: "messageAttachments",
            targetMessageId: args.messageId,
        });
    },
});

// Delete all attachments for the current user
export const clearAllForUser = mutation({
    args: {},
    returns: v.id("deleteOperations"),
    handler: async (ctx) => {
        const userId = await requireAuthUserId(ctx);

        return await enqueueDeleteOperation(ctx, {
            userId,
            kind: "userAttachments",
        });
    },
});
