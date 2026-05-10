import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { isOwner, requireAuthUserId, requireUserMatches } from "./lib/authz";
import { drainBatches, safeStorageDelete } from "./lib/batch";
import { assertMaxLen, LIMITS } from "./lib/limits";
import { clampPaginationOpts } from "./lib/pagination";
import {
    applyCloudUsageDelta,
    ensureCloudUsageCounters,
} from "./lib/cloud_usage";

const skillSnapshotValidator = v.object({
    id: v.string(),
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    createdAt: v.number(),
});

const messageUsageValidator = v.object({
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    cost: v.optional(v.number()),
    cachedTokens: v.optional(v.number()),
});

const reasoningDetailValidator = v.object({
    id: v.string(),
    type: v.union(
        v.literal("reasoning.text"),
        v.literal("reasoning.summary"),
        v.literal("reasoning.encrypted"),
    ),
    format: v.optional(v.string()),
    text: v.optional(v.string()),
    signature: v.optional(v.string()),
});

const messageDocValidator = v.object({
    _id: v.id("messages"),
    _creationTime: v.number(),
    userId: v.id("users"),
    chatId: v.id("chats"),
    localId: v.optional(v.string()),
    role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system"),
    ),
    content: v.string(),
    contextContent: v.string(),
    thinking: v.optional(v.string()),
    skill: v.optional(v.union(v.null(), skillSnapshotValidator)),
    modelId: v.optional(v.string()),
    thinkingLevel: v.optional(v.string()),
    searchLevel: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.string())),
    usage: v.optional(messageUsageValidator),
    reasoningDetails: v.optional(v.array(reasoningDetailValidator)),
    createdAt: v.number(),
});

/**
 * Message Operations
 *
 * CRUD operations for messages within chat sessions.
 */

// Get all messages for a chat, sorted by createdAt ascending
export const listByChat = query({
    args: { chatId: v.id("chats") },
    returns: v.array(messageDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            return [];
        }

        const messages = await ctx.db
            .query("messages")
            .withIndex("by_chat_created", (q) => q.eq("chatId", args.chatId))
            .order("asc")
            .take(LIMITS.maxListMessages);
        return messages;
    },
});

// Paginated message listing (for infinite scroll UIs + sync)
export const listByChatPaginated = query({
    args: {
        chatId: v.id("chats"),
        paginationOpts: paginationOptsValidator,
    },
    returns: v.object({
        page: v.array(messageDocValidator),
        isDone: v.boolean(),
        continueCursor: v.string(),
        splitCursor: v.optional(v.union(v.null(), v.string())),
        pageStatus: v.optional(
            v.union(
                v.null(),
                v.literal("SplitRecommended"),
                v.literal("SplitRequired"),
            ),
        ),
    }),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            return {
                page: [],
                isDone: true,
                continueCursor: "",
            };
        }

        const paginationOpts = clampPaginationOpts(
            args.paginationOpts,
            LIMITS.maxPageMessages,
        );

        return await ctx.db
            .query("messages")
            .withIndex("by_chat_created", (q) => q.eq("chatId", args.chatId))
            .order("asc")
            .paginate(paginationOpts);
    },
});

// Get a single message by ID
export const get = query({
    args: { id: v.id("messages") },
    returns: v.union(v.null(), messageDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const message = await ctx.db.get(args.id);
        if (!isOwner(message, authenticatedUserId)) return null;
        return message;
    },
});

// Get message by local ID (for migration)
export const getByLocalId = query({
    args: {
        userId: v.id("users"),
        localId: v.string(),
    },
    returns: v.union(v.null(), messageDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");

        return await ctx.db
            .query("messages")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", authenticatedUserId).eq("localId", args.localId),
            )
            .unique();
    },
});

// Create a new message
export const create = mutation({
    args: {
        userId: v.id("users"),
        chatId: v.id("chats"),
        localId: v.optional(v.string()),
        role: v.union(
            v.literal("user"),
            v.literal("assistant"),
            v.literal("system"),
        ),
        content: v.string(),
        contextContent: v.string(),
        thinking: v.optional(v.string()),
        skill: v.optional(v.union(v.null(), skillSnapshotValidator)),
        modelId: v.optional(v.string()),
        thinkingLevel: v.optional(v.string()),
        searchLevel: v.optional(v.string()),
        attachmentIds: v.optional(v.array(v.string())),
        usage: v.optional(messageUsageValidator),
        reasoningDetails: v.optional(v.array(reasoningDetailValidator)),
        createdAt: v.optional(v.number()),
    },
    returns: v.id("messages"),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.content, LIMITS.maxMessageContentChars, "content");
        assertMaxLen(
            args.contextContent,
            LIMITS.maxMessageContextChars,
            "contextContent",
        );
        assertMaxLen(args.thinking, LIMITS.maxMessageThinkingChars, "thinking");

        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Chat not found",
                resource: "chats",
            });
        }

        const usage = await ensureCloudUsageCounters(ctx, authenticatedUserId);
        if (usage.messageCount >= LIMITS.maxMessagesPerUser) {
            throw new ConvexError({
                code: "LIMIT_REACHED",
                message: "Message limit reached",
                resource: "messages",
            });
        }

        const now = Date.now();

        // Create the message
        const messageId = await ctx.db.insert("messages", {
            userId: authenticatedUserId,
            chatId: args.chatId,
            localId: args.localId,
            role: args.role,
            content: args.content,
            contextContent: args.contextContent,
            thinking: args.thinking,
            skill: args.skill,
            modelId: args.modelId,
            thinkingLevel: args.thinkingLevel,
            searchLevel: args.searchLevel,
            attachmentIds: args.attachmentIds,
            usage: args.usage,
            reasoningDetails: args.reasoningDetails,
            createdAt: args.createdAt ?? now,
        });

        // Update the chat's updatedAt timestamp
        await ctx.db.patch(args.chatId, {
            updatedAt: args.createdAt ?? now,
        });

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            messageCount: 1,
        });

        return messageId;
    },
});

// Update a message
export const update = mutation({
    args: {
        id: v.id("messages"),
        content: v.optional(v.string()),
        contextContent: v.optional(v.string()),
        thinking: v.optional(v.string()),
        attachmentIds: v.optional(v.array(v.string())),
        usage: v.optional(messageUsageValidator),
        reasoningDetails: v.optional(v.array(reasoningDetailValidator)),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const message = await ctx.db.get(args.id);
        if (!isOwner(message, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Message not found",
                resource: "messages",
            });
        }

        assertMaxLen(args.content, LIMITS.maxMessageContentChars, "content");
        assertMaxLen(
            args.contextContent,
            LIMITS.maxMessageContextChars,
            "contextContent",
        );
        assertMaxLen(args.thinking, LIMITS.maxMessageThinkingChars, "thinking");

        const { id, ...updates } = args;
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, v]) => v !== undefined),
        );
        await ctx.db.patch(id, filteredUpdates);
        return null;
    },
});

// Delete a message and its attachments
export const remove = mutation({
    args: { id: v.id("messages") },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const message = await ctx.db.get(args.id);
        if (!isOwner(message, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Message not found",
                resource: "messages",
            });
        }

        let deletedAttachments = 0;
        let freedAttachmentBytes = 0;

        await drainBatches(
            () =>
                ctx.db
                    .query("attachments")
                    .withIndex("by_message", (q) => q.eq("messageId", args.id))
                    .take(100),
            async (attachment) => {
                if (!attachment.purgedAt) {
                    deletedAttachments++;
                    freedAttachmentBytes += attachment.size;
                }
                await safeStorageDelete(ctx, attachment.storageId);
                await ctx.db.delete(attachment._id);
            },
        );

        // Delete the message
        await ctx.db.delete(args.id);

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            messageCount: -1,
            attachmentCount: -deletedAttachments,
            attachmentBytes: -freedAttachmentBytes,
        });

        return null;
    },
});

// Delete all messages for a chat
export const deleteByChat = mutation({
    args: { chatId: v.id("chats") },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const chat = await ctx.db.get(args.chatId);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Chat not found",
                resource: "chats",
            });
        }

        let deletedMessages = 0;
        let deletedAttachments = 0;
        let freedAttachmentBytes = 0;

        await drainBatches(
            () =>
                ctx.db
                    .query("messages")
                    .withIndex("by_chat_created", (q) =>
                        q.eq("chatId", args.chatId),
                    )
                    .take(100),
            async (message) => {
                deletedMessages++;
                await drainBatches(
                    () =>
                        ctx.db
                            .query("attachments")
                            .withIndex("by_message", (q) =>
                                q.eq("messageId", message._id),
                            )
                            .take(100),
                    async (attachment) => {
                        if (!attachment.purgedAt) {
                            deletedAttachments++;
                            freedAttachmentBytes += attachment.size;
                        }
                        await safeStorageDelete(ctx, attachment.storageId);
                        await ctx.db.delete(attachment._id);
                    },
                );

                await ctx.db.delete(message._id);
            },
        );

        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            messageCount: -deletedMessages,
            attachmentCount: -deletedAttachments,
            attachmentBytes: -freedAttachmentBytes,
        });

        return null;
    },
});
