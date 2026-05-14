import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type UsageCtx = MutationCtx | QueryCtx;

export const USAGE_BACKFILL_PAGE_SIZE = 100;

type UsageBackfillStage = "chats" | "messages" | "skills" | "attachments";

type BackfillProgress = {
    chatCount: number;
    messageCount: number;
    skillCount: number;
    attachmentCount: number;
    attachmentBytes: number;
};

const BACKFILL_STAGES: UsageBackfillStage[] = [
    "chats",
    "messages",
    "skills",
    "attachments",
];

export const chatUsage = new TableAggregate<{
    Namespace: Id<"users">;
    Key: null;
    DataModel: DataModel;
    TableName: "chats";
}>(components.chatUsage, {
    namespace: (doc) => doc.userId,
    sortKey: () => null,
});

export const messageUsage = new TableAggregate<{
    Namespace: Id<"users">;
    Key: null;
    DataModel: DataModel;
    TableName: "messages";
}>(components.messageUsage, {
    namespace: (doc) => doc.userId,
    sortKey: () => null,
});

export const skillUsage = new TableAggregate<{
    Namespace: Id<"users">;
    Key: null;
    DataModel: DataModel;
    TableName: "skills";
}>(components.skillUsage, {
    namespace: (doc) => doc.userId,
    sortKey: () => null,
});

export const attachmentStorageUsage = new TableAggregate<{
    Namespace: Id<"users">;
    Key: null;
    DataModel: DataModel;
    TableName: "attachments";
}>(components.attachmentUsage, {
    namespace: (doc) => doc.userId,
    sortKey: () => null,
    sumValue: (doc) => doc.size,
});

export const imageAttachmentUsage = new TableAggregate<{
    Namespace: Id<"users">;
    Key: null;
    DataModel: DataModel;
    TableName: "attachments";
}>(components.imageAttachmentUsage, {
    namespace: (doc) => doc.userId,
    sortKey: () => null,
    sumValue: (doc) => doc.size,
});

export type CloudUsage = {
    chatCount: number;
    messageCount: number;
    skillCount: number;
    attachmentCount: number;
    attachmentBytes: number;
};

export async function getCloudUsage(
    ctx: UsageCtx,
    userId: Id<"users">,
): Promise<CloudUsage> {
    const [
        chatCount,
        messageCount,
        skillCount,
        attachmentCount,
        attachmentBytes,
    ] = await Promise.all([
        chatUsage.count(ctx, { namespace: userId }),
        messageUsage.count(ctx, { namespace: userId }),
        skillUsage.count(ctx, { namespace: userId }),
        imageAttachmentUsage.count(ctx, { namespace: userId }),
        imageAttachmentUsage.sum(ctx, { namespace: userId }),
    ]);

    const aggregateUsage = {
        chatCount,
        messageCount,
        skillCount,
        attachmentCount,
        attachmentBytes,
    };

    const user = await ctx.db.get(userId);
    if (!user || user.usageAggregatesBackfilledAt) {
        return aggregateUsage;
    }

    return {
        chatCount:
            aggregateUsage.chatCount +
            Math.max(
                0,
                (user.cloudChatCount ?? 0) -
                    (user.usageBackfilledChatCount ?? 0),
            ),
        messageCount:
            aggregateUsage.messageCount +
            Math.max(
                0,
                (user.cloudMessageCount ?? 0) -
                    (user.usageBackfilledMessageCount ?? 0),
            ),
        skillCount:
            aggregateUsage.skillCount +
            Math.max(
                0,
                (user.cloudSkillCount ?? 0) -
                    (user.usageBackfilledSkillCount ?? 0),
            ),
        attachmentCount:
            aggregateUsage.attachmentCount +
            Math.max(
                0,
                (user.cloudAttachmentCount ?? 0) -
                    (user.usageBackfilledAttachmentCount ?? 0),
            ),
        attachmentBytes:
            aggregateUsage.attachmentBytes +
            Math.max(
                0,
                (user.cloudAttachmentBytes ?? 0) -
                    (user.usageBackfilledAttachmentBytes ?? 0),
            ),
    };
}

type AttachmentDoc = DataModel["attachments"]["document"];

export async function getCloudAttachmentStorageBytes(
    ctx: UsageCtx,
    userId: Id<"users">,
): Promise<number> {
    const aggregateBytes = await attachmentStorageUsage.sum(ctx, {
        namespace: userId,
    });

    const user = await ctx.db.get(userId);
    if (!user || user.usageAggregatesBackfilledAt) {
        return aggregateBytes;
    }

    return (
        aggregateBytes +
        Math.max(
            0,
            (user.cloudAttachmentBytes ?? 0) -
                (user.usageBackfilledAttachmentBytes ?? 0),
        )
    );
}

export async function insertAttachmentUsage(
    ctx: MutationCtx,
    attachment: AttachmentDoc,
): Promise<void> {
    if (attachment.purgedAt) return;
    await attachmentStorageUsage.insertIfDoesNotExist(ctx, attachment);
    if (attachment.type === "image") {
        await imageAttachmentUsage.insertIfDoesNotExist(ctx, attachment);
    }
}

export async function deleteAttachmentUsage(
    ctx: MutationCtx,
    attachment: AttachmentDoc,
): Promise<void> {
    await attachmentStorageUsage.deleteIfExists(ctx, attachment);
    if (attachment.type === "image") {
        await imageAttachmentUsage.deleteIfExists(ctx, attachment);
    }
}

export async function ensureCloudUsageBackfilled(
    ctx: MutationCtx,
    userId: Id<"users">,
): Promise<void> {
    const user = await ctx.db.get(userId);
    if (!user || user.usageAggregatesBackfilledAt) return;

    let stage = normalizeBackfillStage(user.usageBackfillStage);
    let cursor = user.usageBackfillCursor ?? null;
    const startedAt = user.usageBackfillStartedAt ?? Date.now();
    const progress: BackfillProgress = {
        chatCount: user.usageBackfilledChatCount ?? 0,
        messageCount: user.usageBackfilledMessageCount ?? 0,
        skillCount: user.usageBackfilledSkillCount ?? 0,
        attachmentCount: user.usageBackfilledAttachmentCount ?? 0,
        attachmentBytes: user.usageBackfilledAttachmentBytes ?? 0,
    };

    while (stage) {
        const result = await backfillStagePage(
            ctx,
            userId,
            stage,
            cursor,
            startedAt,
        );
        addProgress(progress, result.progress);
        if (!result.isDone) {
            await ctx.db.patch(userId, {
                usageBackfillStage: stage,
                usageBackfillCursor: result.cursor,
                usageBackfillStartedAt: startedAt,
                ...progressPatch(progress),
                updatedAt: Date.now(),
            });
            return;
        }

        stage = nextBackfillStage(stage);
        cursor = null;
    }

    await ctx.db.patch(userId, {
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
}

function normalizeBackfillStage(
    stage: string | undefined,
): UsageBackfillStage | null {
    if (stage && BACKFILL_STAGES.includes(stage as UsageBackfillStage)) {
        return stage as UsageBackfillStage;
    }
    return "chats";
}

function nextBackfillStage(
    stage: UsageBackfillStage,
): UsageBackfillStage | null {
    const index = BACKFILL_STAGES.indexOf(stage);
    return BACKFILL_STAGES[index + 1] ?? null;
}

async function backfillStagePage(
    ctx: MutationCtx,
    userId: Id<"users">,
    stage: UsageBackfillStage,
    cursor: string | null,
    startedAt: number,
): Promise<{
    isDone: boolean;
    cursor: string | null;
    progress: BackfillProgress;
}> {
    if (stage === "chats") {
        return await backfillChatPage(ctx, userId, cursor, startedAt);
    }

    if (stage === "messages") {
        return await backfillMessagePage(ctx, userId, cursor, startedAt);
    }

    if (stage === "skills") {
        return await backfillSkillPage(ctx, userId, cursor, startedAt);
    }

    return await backfillAttachmentPage(ctx, userId, cursor, startedAt);
}

async function backfillChatPage(
    ctx: MutationCtx,
    userId: Id<"users">,
    cursor: string | null,
    startedAt: number,
) {
    const page = await ctx.db
        .query("chats")
        .withIndex("by_user_updated", (q) => q.eq("userId", userId))
        .paginate({ numItems: USAGE_BACKFILL_PAGE_SIZE, cursor });
    let chatCount = 0;
    for (const chat of page.page) {
        await chatUsage.insertIfDoesNotExist(ctx, chat);
        if (chat.createdAt <= startedAt) {
            chatCount += 1;
        }
    }
    return {
        isDone: page.isDone,
        cursor: page.isDone ? null : page.continueCursor,
        progress: emptyProgress({ chatCount }),
    };
}

async function backfillMessagePage(
    ctx: MutationCtx,
    userId: Id<"users">,
    cursor: string | null,
    startedAt: number,
) {
    const page = await ctx.db
        .query("messages")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate({ numItems: USAGE_BACKFILL_PAGE_SIZE, cursor });
    let messageCount = 0;
    for (const message of page.page) {
        await messageUsage.insertIfDoesNotExist(ctx, message);
        if (message.createdAt <= startedAt) {
            messageCount += 1;
        }
    }
    return {
        isDone: page.isDone,
        cursor: page.isDone ? null : page.continueCursor,
        progress: emptyProgress({ messageCount }),
    };
}

async function backfillSkillPage(
    ctx: MutationCtx,
    userId: Id<"users">,
    cursor: string | null,
    startedAt: number,
) {
    const page = await ctx.db
        .query("skills")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .paginate({ numItems: USAGE_BACKFILL_PAGE_SIZE, cursor });
    let skillCount = 0;
    for (const skill of page.page) {
        await skillUsage.insertIfDoesNotExist(ctx, skill);
        if (skill.createdAt <= startedAt) {
            skillCount += 1;
        }
    }
    return {
        isDone: page.isDone,
        cursor: page.isDone ? null : page.continueCursor,
        progress: emptyProgress({ skillCount }),
    };
}

async function backfillAttachmentPage(
    ctx: MutationCtx,
    userId: Id<"users">,
    cursor: string | null,
    startedAt: number,
) {
    const page = await ctx.db
        .query("attachments")
        .withIndex("by_user_created", (q) => q.eq("userId", userId))
        .paginate({ numItems: USAGE_BACKFILL_PAGE_SIZE, cursor });
    let attachmentCount = 0;
    let attachmentBytes = 0;
    for (const attachment of page.page) {
        if (!attachment.purgedAt) {
            await insertAttachmentUsage(ctx, attachment);
            if (
                attachment.type === "image" &&
                attachment.createdAt <= startedAt
            ) {
                attachmentCount += 1;
                attachmentBytes += attachment.size;
            }
        }
    }
    return {
        isDone: page.isDone,
        cursor: page.isDone ? null : page.continueCursor,
        progress: emptyProgress({ attachmentCount, attachmentBytes }),
    };
}

function emptyProgress(progress: Partial<BackfillProgress>): BackfillProgress {
    return {
        chatCount: progress.chatCount ?? 0,
        messageCount: progress.messageCount ?? 0,
        skillCount: progress.skillCount ?? 0,
        attachmentCount: progress.attachmentCount ?? 0,
        attachmentBytes: progress.attachmentBytes ?? 0,
    };
}

function addProgress(
    target: BackfillProgress,
    increment: BackfillProgress,
): void {
    target.chatCount += increment.chatCount;
    target.messageCount += increment.messageCount;
    target.skillCount += increment.skillCount;
    target.attachmentCount += increment.attachmentCount;
    target.attachmentBytes += increment.attachmentBytes;
}

function progressPatch(progress: BackfillProgress) {
    return {
        usageBackfilledChatCount: progress.chatCount,
        usageBackfilledMessageCount: progress.messageCount,
        usageBackfilledSkillCount: progress.skillCount,
        usageBackfilledAttachmentCount: progress.attachmentCount,
        usageBackfilledAttachmentBytes: progress.attachmentBytes,
    };
}
