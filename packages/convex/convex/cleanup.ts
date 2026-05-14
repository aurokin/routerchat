import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireAuthUserId, requireUserMatches } from "./lib/authz";
import { deleteWorkpool } from "./lib/delete_workpool";
import { internal } from "./_generated/api";
import { safeStorageDelete } from "./lib/storage";
import {
    chatUsage,
    deleteAttachmentUsage,
    messageUsage,
    skillUsage,
} from "./lib/usage_aggregates";

const DELETE_BATCH_SIZE = 100;

const deleteOperationValidator = v.object({
    _id: v.id("deleteOperations"),
    _creationTime: v.number(),
    userId: v.id("users"),
    kind: v.union(
        v.literal("chat"),
        v.literal("chatMessages"),
        v.literal("message"),
        v.literal("messageAttachments"),
        v.literal("userData"),
        v.literal("userAttachments"),
    ),
    status: v.union(
        v.literal("queued"),
        v.literal("running"),
        v.literal("finished"),
        v.literal("failed"),
    ),
    targetChatId: v.optional(v.id("chats")),
    targetMessageId: v.optional(v.id("messages")),
    workId: v.optional(v.string()),
    cursor: v.optional(v.union(v.null(), v.string())),
    deletedChats: v.number(),
    deletedMessages: v.number(),
    deletedAttachments: v.number(),
    freedAttachmentBytes: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
});

export const listActive = query({
    args: { userId: v.id("users") },
    returns: v.array(deleteOperationValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const [queued, running, failed] = await Promise.all([
            ctx.db
                .query("deleteOperations")
                .withIndex("by_user_status", (q) =>
                    q.eq("userId", authenticatedUserId).eq("status", "queued"),
                )
                .order("desc")
                .take(50),
            ctx.db
                .query("deleteOperations")
                .withIndex("by_user_status", (q) =>
                    q.eq("userId", authenticatedUserId).eq("status", "running"),
                )
                .order("desc")
                .take(50),
            ctx.db
                .query("deleteOperations")
                .withIndex("by_user_status", (q) =>
                    q.eq("userId", authenticatedUserId).eq("status", "failed"),
                )
                .order("desc")
                .take(10),
        ]);

        return [...queued, ...running, ...failed].sort(
            (a, b) => b.updatedAt - a.updatedAt,
        );
    },
});

export const get = query({
    args: { id: v.id("deleteOperations") },
    returns: v.union(v.null(), deleteOperationValidator),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const operation = await ctx.db.get(args.id);
        if (!operation || operation.userId !== authenticatedUserId) return null;
        return operation;
    },
});

async function enqueueNext(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
): Promise<void> {
    const workId = await deleteWorkpool.enqueueMutation(
        ctx,
        internal.cleanup.processDeleteOperation,
        { operationId },
        { name: "delete:continue" },
    );
    await ctx.db.patch(operationId, {
        status: "queued",
        workId,
        updatedAt: Date.now(),
    });
}

async function finishOperation(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
): Promise<void> {
    const now = Date.now();
    await ctx.db.patch(operationId, {
        status: "finished",
        cursor: undefined,
        updatedAt: now,
        finishedAt: now,
    });
}

async function failOperation(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
    error: unknown,
): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const now = Date.now();
    await ctx.db.patch(operationId, {
        status: "failed",
        error: message,
        updatedAt: now,
        finishedAt: now,
    });
}

async function deleteOneMessageAttachments(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
    messageId: Id<"messages">,
): Promise<boolean> {
    const attachments = await ctx.db
        .query("attachments")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .take(DELETE_BATCH_SIZE);

    if (attachments.length === 0) return false;

    let deletedAttachments = 0;
    let freedAttachmentBytes = 0;
    for (const attachment of attachments) {
        if (!attachment.purgedAt) {
            deletedAttachments++;
            freedAttachmentBytes += attachment.size;
        }
        if (attachment.storageId) {
            await safeStorageDelete(ctx, attachment.storageId);
        }
        await ctx.db.delete(attachment._id);
    }

    const operation = await ctx.db.get(operationId);
    if (!operation) return true;
    await ctx.db.patch(operationId, {
        status: "running",
        deletedAttachments: operation.deletedAttachments + deletedAttachments,
        freedAttachmentBytes:
            operation.freedAttachmentBytes + freedAttachmentBytes,
        updatedAt: Date.now(),
    });

    if (deletedAttachments > 0 || freedAttachmentBytes > 0) {
        for (const attachment of attachments) {
            if (!attachment.purgedAt) {
                await deleteAttachmentUsage(ctx, attachment);
            }
        }
    }

    return true;
}

async function processMessagesForChat(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
    chatId: Id<"chats">,
): Promise<boolean> {
    const message = await ctx.db
        .query("messages")
        .withIndex("by_chat_created", (q) => q.eq("chatId", chatId))
        .first();

    if (!message) return false;

    const deletedAttachments = await deleteOneMessageAttachments(
        ctx,
        operationId,
        message._id,
    );
    if (deletedAttachments) return true;

    await ctx.db.delete(message._id);
    await messageUsage.deleteIfExists(ctx, message);
    const operation = await ctx.db.get(operationId);
    if (operation) {
        await ctx.db.patch(operationId, {
            status: "running",
            deletedMessages: operation.deletedMessages + 1,
            updatedAt: Date.now(),
        });
    }
    return true;
}

async function processSingleMessage(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
    messageId: Id<"messages">,
): Promise<boolean> {
    const message = await ctx.db.get(messageId);
    if (!message) return false;

    const deletedAttachments = await deleteOneMessageAttachments(
        ctx,
        operationId,
        messageId,
    );
    if (deletedAttachments) return true;

    await ctx.db.delete(messageId);
    await messageUsage.deleteIfExists(ctx, message);
    const operation = await ctx.db.get(operationId);
    if (operation) {
        await ctx.db.patch(operationId, {
            status: "running",
            deletedMessages: operation.deletedMessages + 1,
            updatedAt: Date.now(),
        });
    }
    return true;
}

async function processUserData(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
    userId: Id<"users">,
): Promise<boolean> {
    const attachments = await ctx.db
        .query("attachments")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH_SIZE);
    if (attachments.length > 0) {
        for (const attachment of attachments) {
            if (attachment.storageId) {
                await safeStorageDelete(ctx, attachment.storageId);
            }
            if (!attachment.purgedAt) {
                await deleteAttachmentUsage(ctx, attachment);
            }
            await ctx.db.delete(attachment._id);
        }
        const operation = await ctx.db.get(operationId);
        if (operation) {
            await ctx.db.patch(operationId, {
                status: "running",
                deletedAttachments:
                    operation.deletedAttachments + attachments.length,
                updatedAt: Date.now(),
            });
        }
        return true;
    }

    const messages = await ctx.db
        .query("messages")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH_SIZE);
    if (messages.length > 0) {
        for (const message of messages) {
            await ctx.db.delete(message._id);
            await messageUsage.deleteIfExists(ctx, message);
        }
        const operation = await ctx.db.get(operationId);
        if (operation) {
            await ctx.db.patch(operationId, {
                status: "running",
                deletedMessages: operation.deletedMessages + messages.length,
                updatedAt: Date.now(),
            });
        }
        return true;
    }

    const chats = await ctx.db
        .query("chats")
        .withIndex("by_user_updated", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH_SIZE);
    if (chats.length > 0) {
        for (const chat of chats) {
            await ctx.db.delete(chat._id);
            await chatUsage.deleteIfExists(ctx, chat);
        }
        const operation = await ctx.db.get(operationId);
        if (operation) {
            await ctx.db.patch(operationId, {
                status: "running",
                deletedChats: operation.deletedChats + chats.length,
                updatedAt: Date.now(),
            });
        }
        return true;
    }

    const skills = await ctx.db
        .query("skills")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .take(DELETE_BATCH_SIZE);
    if (skills.length > 0) {
        for (const skill of skills) {
            await ctx.db.delete(skill._id);
            await skillUsage.deleteIfExists(ctx, skill);
        }
        await ctx.db.patch(operationId, {
            status: "running",
            updatedAt: Date.now(),
        });
        return true;
    }

    await ctx.db.patch(userId, {
        cloudChatCount: 0,
        cloudMessageCount: 0,
        cloudSkillCount: 0,
        cloudAttachmentCount: 0,
        cloudAttachmentBytes: 0,
        usageAggregatesBackfilledAt: Date.now(),
        usageBackfillStage: undefined,
        usageBackfillCursor: undefined,
        usageBackfillStartedAt: undefined,
        usageBackfilledChatCount: undefined,
        usageBackfilledMessageCount: undefined,
        usageBackfilledSkillCount: undefined,
        usageBackfilledAttachmentCount: undefined,
        usageBackfilledAttachmentBytes: undefined,
        updatedAt: Date.now(),
    });

    return false;
}

async function processUserAttachments(
    ctx: MutationCtx,
    operationId: Id<"deleteOperations">,
    userId: Id<"users">,
): Promise<boolean> {
    const operation = await ctx.db.get(operationId);
    if (!operation) return false;

    const page = await ctx.db
        .query("attachments")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .order("asc")
        .paginate({
            numItems: DELETE_BATCH_SIZE,
            cursor: operation.cursor ?? null,
        });

    let purgedAttachments = 0;
    let purgedBytes = 0;
    const purgedAt = Date.now();

    for (const attachment of page.page) {
        if (attachment.type !== "image") continue;
        if (attachment.storageId) {
            await safeStorageDelete(ctx, attachment.storageId);
        }
        if (attachment.purgedAt) continue;
        purgedAttachments++;
        purgedBytes += attachment.size;
        await deleteAttachmentUsage(ctx, attachment);
        await ctx.db.patch(attachment._id, { purgedAt });
    }

    await ctx.db.patch(operationId, {
        status: "running",
        cursor: page.isDone ? undefined : page.continueCursor,
        deletedAttachments: operation.deletedAttachments + purgedAttachments,
        freedAttachmentBytes: operation.freedAttachmentBytes + purgedBytes,
        updatedAt: Date.now(),
    });

    if (purgedAttachments > 0 || purgedBytes > 0) {
        await ctx.db.patch(operationId, {
            updatedAt: Date.now(),
        });
    }

    return !page.isDone;
}

export const processDeleteOperation = internalMutation({
    args: { operationId: v.id("deleteOperations") },
    returns: v.null(),
    handler: async (ctx, args) => {
        const operation = await ctx.db.get(args.operationId);
        if (!operation || operation.status === "finished") return null;

        await ctx.db.patch(args.operationId, {
            status: "running",
            updatedAt: Date.now(),
        });

        try {
            let hasMore = false;

            if (operation.kind === "chat") {
                if (!operation.targetChatId) {
                    throw new Error("Missing targetChatId");
                }
                hasMore = await processMessagesForChat(
                    ctx,
                    args.operationId,
                    operation.targetChatId,
                );
            } else if (operation.kind === "chatMessages") {
                if (!operation.targetChatId) {
                    throw new Error("Missing targetChatId");
                }
                hasMore = await processMessagesForChat(
                    ctx,
                    args.operationId,
                    operation.targetChatId,
                );
            } else if (operation.kind === "message") {
                if (!operation.targetMessageId) {
                    throw new Error("Missing targetMessageId");
                }
                hasMore = await processSingleMessage(
                    ctx,
                    args.operationId,
                    operation.targetMessageId,
                );
            } else if (operation.kind === "messageAttachments") {
                if (!operation.targetMessageId) {
                    throw new Error("Missing targetMessageId");
                }
                hasMore = await deleteOneMessageAttachments(
                    ctx,
                    args.operationId,
                    operation.targetMessageId,
                );
            } else if (operation.kind === "userData") {
                hasMore = await processUserData(
                    ctx,
                    args.operationId,
                    operation.userId,
                );
            } else {
                hasMore = await processUserAttachments(
                    ctx,
                    args.operationId,
                    operation.userId,
                );
            }

            if (hasMore) {
                await enqueueNext(ctx, args.operationId);
            } else {
                await finishOperation(ctx, args.operationId);
            }
        } catch (error) {
            await failOperation(ctx, args.operationId, error);
        }

        return null;
    },
});
