import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError } from "convex/values";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { LIMITS } from "./limits";
import {
    ensureCloudUsageBackfilled,
    getCloudUsage,
    type CloudUsage,
} from "./usage_aggregates";

export const contentRateLimiter = new RateLimiter(
    components.contentRateLimiter,
    {
        createChat: {
            kind: "token bucket",
            period: DAY,
            rate: 5_000,
            capacity: 5_000,
        },
        createMessage: {
            kind: "token bucket",
            period: DAY,
            rate: 100_000,
            capacity: 100_000,
        },
        createSkill: {
            kind: "token bucket",
            period: DAY,
            rate: 500,
            capacity: 500,
        },
    },
);

export async function limitContentCreation(
    ctx: MutationCtx,
    name: "createChat" | "createMessage" | "createSkill",
    userId: Id<"users">,
): Promise<void> {
    await ensureCloudUsageBackfilled(ctx, userId);
    const usage = await getCloudUsage(ctx, userId);
    assertContentCapacity(name, usage);

    await contentRateLimiter.limit(ctx, name, {
        key: userId,
        throws: true,
    });
}

function assertContentCapacity(
    name: "createChat" | "createMessage" | "createSkill",
    usage: CloudUsage,
): void {
    const limits = {
        createChat: {
            count: usage.chatCount,
            max: LIMITS.maxTotalChatsPerUser,
            resource: "chats",
        },
        createMessage: {
            count: usage.messageCount,
            max: LIMITS.maxTotalMessagesPerUser,
            resource: "messages",
        },
        createSkill: {
            count: usage.skillCount,
            max: LIMITS.maxTotalSkillsPerUser,
            resource: "skills",
        },
    } as const;
    const limit = limits[name];

    if (limit.count >= limit.max) {
        throw new ConvexError({
            code: "LIMIT_REACHED",
            message: `${limit.resource} limit reached`,
            resource: limit.resource,
            max: limit.max,
        });
    }
}
