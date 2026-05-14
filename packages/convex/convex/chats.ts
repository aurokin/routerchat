import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { isOwner, requireAuthUserId, requireUserMatches } from "./lib/authz";
import { assertMaxLen, LIMITS } from "./lib/limits";
import { clampPaginationOpts } from "./lib/pagination";
import { enqueueDeleteOperation } from "./lib/delete_operations";
import { chatUsage } from "./lib/usage_aggregates";
import { limitContentCreation } from "./lib/rate_limits";

const chatDocValidator = v.object({
    _id: v.id("chats"),
    _creationTime: v.number(),
    userId: v.id("users"),
    localId: v.optional(v.string()),
    title: v.string(),
    modelId: v.string(),
    thinking: v.string(),
    searchLevel: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
});

/**
 * Chat Operations
 *
 * CRUD operations for chat sessions (conversations) in the cloud.
 */

// Get all chats for a user, sorted by updatedAt descending
export const listByUser = query({
    args: { userId: v.id("users") },
    returns: v.array(chatDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const chats = await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .order("desc")
            .take(LIMITS.maxListChats);
        return chats;
    },
});

// Paginated chat listing (for infinite scroll UIs)
export const listByUserPaginated = query({
    args: {
        userId: v.id("users"),
        paginationOpts: paginationOptsValidator,
    },
    returns: v.object({
        page: v.array(chatDocValidator),
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
        requireUserMatches(authenticatedUserId, args.userId);

        const paginationOpts = clampPaginationOpts(
            args.paginationOpts,
            LIMITS.maxPageChats,
        );

        return await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .order("desc")
            .paginate(paginationOpts);
    },
});

// Get a single chat by ID
export const get = query({
    args: { id: v.id("chats") },
    returns: v.union(v.null(), chatDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const chat = await ctx.db.get(args.id);
        if (!isOwner(chat, authenticatedUserId)) return null;
        return chat;
    },
});

// Get chat by local ID (for migration)
export const getByLocalId = query({
    args: {
        userId: v.id("users"),
        localId: v.string(),
    },
    returns: v.union(v.null(), chatDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);
        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");

        return await ctx.db
            .query("chats")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", authenticatedUserId).eq("localId", args.localId),
            )
            .unique();
    },
});

// Create a new chat
export const create = mutation({
    args: {
        userId: v.id("users"),
        localId: v.optional(v.string()),
        title: v.string(),
        modelId: v.string(),
        thinking: v.string(),
        searchLevel: v.string(),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    },
    returns: v.id("chats"),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.title, LIMITS.maxChatTitleChars, "title");

        await limitContentCreation(ctx, "createChat", authenticatedUserId);

        const now = Date.now();
        const chatId = await ctx.db.insert("chats", {
            userId: authenticatedUserId,
            localId: args.localId,
            title: args.title,
            modelId: args.modelId,
            thinking: args.thinking,
            searchLevel: args.searchLevel,
            createdAt: args.createdAt ?? now,
            updatedAt: args.updatedAt ?? now,
        });

        const chat = await ctx.db.get(chatId);
        await chatUsage.insertIfDoesNotExist(ctx, chat!);
        return chatId;
    },
});

// Update a chat
export const update = mutation({
    args: {
        id: v.id("chats"),
        title: v.optional(v.string()),
        modelId: v.optional(v.string()),
        thinking: v.optional(v.string()),
        searchLevel: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const chat = await ctx.db.get(args.id);
        if (!chat || !isOwner(chat, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Chat not found",
                resource: "chats",
            });
        }

        assertMaxLen(args.title, LIMITS.maxChatTitleChars, "title");

        const { id, ...updates } = args;
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, v]) => v !== undefined),
        );
        await ctx.db.patch(id, {
            ...filteredUpdates,
            updatedAt: Date.now(),
        });
        return null;
    },
});

// Delete a chat and all associated messages/attachments
export const remove = mutation({
    args: { id: v.id("chats") },
    returns: v.id("deleteOperations"),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const chat = await ctx.db.get(args.id);
        if (!isOwner(chat, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Chat not found",
                resource: "chats",
            });
        }

        const operationId = await enqueueDeleteOperation(ctx, {
            userId: authenticatedUserId,
            kind: "chat",
            targetChatId: args.id,
        });

        // Delete the chat
        await ctx.db.delete(args.id);
        await chatUsage.deleteIfExists(ctx, chat!);

        return operationId;
    },
});

// Get the oldest chat by updatedAt (for purge operations)
export const getOldestByUser = query({
    args: { userId: v.id("users") },
    returns: v.union(v.null(), chatDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const chat = await ctx.db
            .query("chats")
            .withIndex("by_user_updated", (q) =>
                q.eq("userId", authenticatedUserId),
            )
            .order("asc")
            .first();
        return chat;
    },
});
