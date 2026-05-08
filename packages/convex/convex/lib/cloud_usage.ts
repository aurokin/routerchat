import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type CloudUsageCounters = {
    chatCount: number;
    messageCount: number;
    skillCount: number;
    attachmentCount: number;
    attachmentBytes: number;
};

const DEFAULT_COUNTERS: CloudUsageCounters = {
    chatCount: 0,
    messageCount: 0,
    skillCount: 0,
    attachmentCount: 0,
    attachmentBytes: 0,
};

const USER_COUNTER_FIELDS = {
    chatCount: "cloudChatCount",
    messageCount: "cloudMessageCount",
    skillCount: "cloudSkillCount",
    attachmentCount: "cloudAttachmentCount",
    attachmentBytes: "cloudAttachmentBytes",
} as const;

function isNonNegativeFiniteNumber(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        // avoid NaN sneaking in
        !Number.isNaN(value)
    );
}

function readNumber(value: unknown): number | null {
    return isNonNegativeFiniteNumber(value) ? value : null;
}

export function readCloudUsageCountersFromUser(
    user: unknown,
): CloudUsageCounters | null {
    if (!user || typeof user !== "object") return null;

    const chatCount = readNumber((user as any)[USER_COUNTER_FIELDS.chatCount]);
    const messageCount = readNumber(
        (user as any)[USER_COUNTER_FIELDS.messageCount],
    );
    const skillCount = readNumber(
        (user as any)[USER_COUNTER_FIELDS.skillCount],
    );
    const attachmentCount = readNumber(
        (user as any)[USER_COUNTER_FIELDS.attachmentCount],
    );
    const attachmentBytes = readNumber(
        (user as any)[USER_COUNTER_FIELDS.attachmentBytes],
    );

    if (
        chatCount === null ||
        messageCount === null ||
        skillCount === null ||
        attachmentCount === null ||
        attachmentBytes === null
    ) {
        return null;
    }

    return {
        chatCount,
        messageCount,
        skillCount,
        attachmentCount,
        attachmentBytes,
    };
}

export function cloudUsageCountersToPatch(
    counters: CloudUsageCounters,
): Record<string, number> {
    return {
        [USER_COUNTER_FIELDS.chatCount]: counters.chatCount,
        [USER_COUNTER_FIELDS.messageCount]: counters.messageCount,
        [USER_COUNTER_FIELDS.skillCount]: counters.skillCount,
        [USER_COUNTER_FIELDS.attachmentCount]: counters.attachmentCount,
        [USER_COUNTER_FIELDS.attachmentBytes]: counters.attachmentBytes,
    };
}

type PageResult<T> = {
    page: T[];
    isDone: boolean;
    continueCursor: string;
};

async function countPaginated<T>(
    fetchPage: (cursor: string | null) => Promise<PageResult<T>>,
): Promise<number> {
    let cursor: string | null = null;
    let count = 0;

    // Prevent accidental infinite loops if cursors don't advance.
    for (let i = 0; i < 100_000; i++) {
        const result = await fetchPage(cursor);
        count += result.page?.length ?? 0;

        if (result.isDone) {
            return count;
        }

        if (result.continueCursor === cursor) {
            throw new Error("Pagination cursor did not advance");
        }

        cursor = result.continueCursor;
    }

    throw new Error("Pagination exceeded maximum number of pages");
}

export async function computeCloudChatCount(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
): Promise<number> {
    return await countPaginated((cursor) =>
        ctx.db
            .query("chats")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate({ numItems: 1_000, cursor }),
    );
}

export async function computeCloudMessageCount(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
): Promise<number> {
    return await countPaginated((cursor) =>
        ctx.db
            .query("messages")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate({ numItems: 1_000, cursor }),
    );
}

export async function computeCloudSkillCount(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
): Promise<number> {
    return await countPaginated((cursor) =>
        ctx.db
            .query("skills")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate({ numItems: 1_000, cursor }),
    );
}

export async function computeCloudAttachmentUsage(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
): Promise<Pick<CloudUsageCounters, "attachmentCount" | "attachmentBytes">> {
    let bytes = 0;
    let count = 0;

    let cursor: string | null = null;
    for (let i = 0; i < 100_000; i++) {
        const result = await ctx.db
            .query("attachments")
            .withIndex("by_user_created", (q) => q.eq("userId", userId))
            .order("asc")
            .paginate({ numItems: 1_000, cursor });

        for (const attachment of result.page as any[]) {
            if (attachment?.purgedAt) continue;
            count++;
            bytes += attachment?.size ?? 0;
        }

        if (result.isDone) {
            return {
                attachmentCount: count,
                attachmentBytes: bytes,
            };
        }
        if (result.continueCursor === cursor) {
            throw new Error("Pagination cursor did not advance");
        }
        cursor = result.continueCursor;
    }

    throw new Error("Pagination exceeded maximum number of pages");
}

export async function computeCloudUsageCounters(
    ctx: Pick<QueryCtx, "db">,
    userId: Id<"users">,
): Promise<CloudUsageCounters> {
    const [chatCount, messageCount, skillCount, attachmentUsage] =
        await Promise.all([
            computeCloudChatCount(ctx, userId),
            computeCloudMessageCount(ctx, userId),
            computeCloudSkillCount(ctx, userId),
            computeCloudAttachmentUsage(ctx, userId),
        ]);

    return {
        chatCount,
        messageCount,
        skillCount,
        attachmentCount: attachmentUsage.attachmentCount,
        attachmentBytes: attachmentUsage.attachmentBytes,
    };
}

export async function ensureCloudUsageCounters(
    ctx: Pick<MutationCtx, "db">,
    userId: Id<"users">,
): Promise<CloudUsageCounters> {
    const user = await ctx.db.get(userId);
    if (!user) {
        throw new Error("User not found");
    }

    const existing = readCloudUsageCountersFromUser(user);
    if (existing) {
        return existing;
    }

    const computed = await computeCloudUsageCounters(ctx as any, userId);
    await ctx.db.patch(userId, cloudUsageCountersToPatch(computed) as any);
    return computed;
}

export async function applyCloudUsageDelta(
    ctx: Pick<MutationCtx, "db">,
    userId: Id<"users">,
    delta: Partial<CloudUsageCounters>,
): Promise<CloudUsageCounters> {
    const current = await ensureCloudUsageCounters(ctx as any, userId);

    const next: CloudUsageCounters = {
        chatCount: Math.max(0, current.chatCount + (delta.chatCount ?? 0)),
        messageCount: Math.max(
            0,
            current.messageCount + (delta.messageCount ?? 0),
        ),
        skillCount: Math.max(0, current.skillCount + (delta.skillCount ?? 0)),
        attachmentCount: Math.max(
            0,
            current.attachmentCount + (delta.attachmentCount ?? 0),
        ),
        attachmentBytes: Math.max(
            0,
            current.attachmentBytes + (delta.attachmentBytes ?? 0),
        ),
    };

    await ctx.db.patch(userId, cloudUsageCountersToPatch(next) as any);
    return next;
}

export function zeroCloudUsageCounters(): CloudUsageCounters {
    return { ...DEFAULT_COUNTERS };
}
