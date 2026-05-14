import { v } from "convex/values";
import {
    internalMutation,
    internalQuery,
    mutation,
    query,
} from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireAuthUserId, requireUserMatches } from "./lib/authz";
import { enqueueDeleteOperation } from "./lib/delete_operations";
import {
    ensureCloudUsageBackfilled,
    getCloudUsage,
} from "./lib/usage_aggregates";
import type { Id } from "./_generated/dataModel";

const userDocValidator = v.object({
    _id: v.id("users"),
    _creationTime: v.number(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    initialSync: v.optional(v.boolean()),
    encryptedApiKey: v.optional(v.string()),
    apiKeyNonce: v.optional(v.string()),
    apiKeyUpdatedAt: v.optional(v.number()),
    providerSort: v.optional(
        v.union(
            v.literal("default"),
            v.literal("price"),
            v.literal("throughput"),
            v.literal("latency"),
        ),
    ),
    usageAggregatesBackfilledAt: v.optional(v.number()),
    usageBackfillStage: v.optional(
        v.union(
            v.literal("chats"),
            v.literal("messages"),
            v.literal("skills"),
            v.literal("attachments"),
        ),
    ),
    usageBackfillCursor: v.optional(v.union(v.null(), v.string())),
    usageBackfillStartedAt: v.optional(v.number()),
    usageBackfilledChatCount: v.optional(v.number()),
    usageBackfilledMessageCount: v.optional(v.number()),
    usageBackfilledSkillCount: v.optional(v.number()),
    usageBackfilledAttachmentCount: v.optional(v.number()),
    usageBackfilledAttachmentBytes: v.optional(v.number()),
    cloudChatCount: v.optional(v.number()),
    cloudMessageCount: v.optional(v.number()),
    cloudSkillCount: v.optional(v.number()),
    cloudAttachmentCount: v.optional(v.number()),
    cloudAttachmentBytes: v.optional(v.number()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
});

const cloudUsageCountersValidator = v.object({
    chatCount: v.number(),
    messageCount: v.number(),
    skillCount: v.number(),
    attachmentCount: v.number(),
    attachmentBytes: v.number(),
});

export const get = query({
    args: { id: v.id("users") },
    returns: v.union(v.null(), userDocValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.id);
        return await ctx.db.get(args.id);
    },
});

export const getById = internalQuery({
    args: { id: v.id("users") },
    returns: v.union(v.null(), userDocValidator),
    handler: async (ctx, args) => {
        return await ctx.db.get(args.id);
    },
});

export const getCurrentUserId = query({
    args: {},
    returns: v.union(v.null(), v.id("users")),
    handler: async (ctx) => {
        return (await getAuthUserId(ctx)) as Id<"users"> | null;
    },
});

export const getStorageUsage = query({
    args: { userId: v.id("users") },
    returns: v.object({
        bytes: v.number(),
        messageCount: v.number(),
        sessionCount: v.number(),
    }),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const usage = await getCloudUsage(ctx, authenticatedUserId);

        return {
            bytes: usage.attachmentBytes,
            messageCount: usage.messageCount,
            sessionCount: usage.chatCount,
        };
    },
});

export const create = internalMutation({
    args: {
        email: v.optional(v.string()),
    },
    returns: v.id("users"),
    handler: async (ctx, args) => {
        const now = Date.now();
        return await ctx.db.insert("users", {
            email: args.email ?? undefined,
            initialSync: false,
            createdAt: now,
            updatedAt: now,
        });
    },
});

export const resetCloudData = mutation({
    args: {},
    returns: v.id("deleteOperations"),
    handler: async (ctx) => {
        const userId = await requireAuthUserId(ctx);

        return await enqueueDeleteOperation(ctx, {
            userId,
            kind: "userData",
        });
    },
});

export const ensureUsageCounters = mutation({
    args: {},
    returns: cloudUsageCountersValidator,
    handler: async (ctx) => {
        const userId = await requireAuthUserId(ctx);
        await ensureCloudUsageBackfilled(ctx, userId);
        return await getCloudUsage(ctx, userId);
    },
});

export const setInitialSync = mutation({
    args: {
        initialSync: v.boolean(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await requireAuthUserId(ctx);

        await ctx.db.patch(userId, {
            initialSync: args.initialSync,
            updatedAt: Date.now(),
        });
        return null;
    },
});

export const setProviderSort = mutation({
    args: {
        providerSort: v.union(
            v.literal("default"),
            v.literal("price"),
            v.literal("throughput"),
            v.literal("latency"),
        ),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const userId = await requireAuthUserId(ctx);
        await ctx.db.patch(userId, {
            providerSort: args.providerSort,
            updatedAt: Date.now(),
        });
        return null;
    },
});
