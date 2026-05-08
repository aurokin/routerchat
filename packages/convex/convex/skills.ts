import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { isOwner, requireAuthUserId, requireUserMatches } from "./lib/authz";
import { assertMaxLen, LIMITS } from "./lib/limits";
import { clampPaginationOpts } from "./lib/pagination";
import {
    applyCloudUsageDelta,
    ensureCloudUsageCounters,
} from "./lib/cloud_usage";

/**
 * Skill Operations
 *
 * CRUD operations for saved skills.
 */

// List all skills for a user
export const listByUser = query({
    args: { userId: v.id("users") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        return await ctx.db
            .query("skills")
            .withIndex("by_user", (q) => q.eq("userId", authenticatedUserId))
            .take(LIMITS.maxListSkills);
    },
});

// Paginated skill listing (for sync / infinite lists)
export const listByUserPaginated = query({
    args: {
        userId: v.id("users"),
        paginationOpts: paginationOptsValidator,
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        const paginationOpts = clampPaginationOpts(
            args.paginationOpts,
            LIMITS.maxPageSkills,
        );

        return await ctx.db
            .query("skills")
            .withIndex("by_user", (q) => q.eq("userId", authenticatedUserId))
            .paginate(paginationOpts);
    },
});

// Get a skill by local ID (for migration)
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
            .query("skills")
            .withIndex("by_local_id", (q) =>
                q.eq("userId", authenticatedUserId).eq("localId", args.localId),
            )
            .unique();
    },
});

// Create a new skill
export const create = mutation({
    args: {
        userId: v.id("users"),
        localId: v.optional(v.string()),
        name: v.string(),
        description: v.string(),
        prompt: v.string(),
        createdAt: v.optional(v.number()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        requireUserMatches(authenticatedUserId, args.userId);

        assertMaxLen(args.localId, LIMITS.maxLocalIdChars, "localId");
        assertMaxLen(args.name, LIMITS.maxSkillNameChars, "name");
        assertMaxLen(
            args.description,
            LIMITS.maxSkillDescriptionChars,
            "description",
        );
        assertMaxLen(args.prompt, LIMITS.maxSkillPromptChars, "prompt");

        const usage = await ensureCloudUsageCounters(ctx, authenticatedUserId);
        if (usage.skillCount >= LIMITS.maxSkillsPerUser) {
            throw new Error("Skill limit reached");
        }

        const now = Date.now();
        const skillId = await ctx.db.insert("skills", {
            userId: authenticatedUserId,
            localId: args.localId,
            name: args.name,
            description: args.description,
            prompt: args.prompt,
            createdAt: args.createdAt ?? now,
        });

        await applyCloudUsageDelta(ctx, authenticatedUserId, { skillCount: 1 });
        return skillId;
    },
});

// Update a skill
export const update = mutation({
    args: {
        id: v.id("skills"),
        name: v.optional(v.string()),
        description: v.optional(v.string()),
        prompt: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const skill = await ctx.db.get(args.id);
        if (!isOwner(skill, authenticatedUserId)) {
            throw new Error("Not found");
        }

        assertMaxLen(args.name, LIMITS.maxSkillNameChars, "name");
        assertMaxLen(
            args.description,
            LIMITS.maxSkillDescriptionChars,
            "description",
        );
        assertMaxLen(args.prompt, LIMITS.maxSkillPromptChars, "prompt");

        const { id, ...updates } = args;
        const filteredUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, value]) => value !== undefined),
        );
        await ctx.db.patch(id, filteredUpdates);
    },
});

// Delete a skill
export const remove = mutation({
    args: { id: v.id("skills") },
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const skill = await ctx.db.get(args.id);
        if (!isOwner(skill, authenticatedUserId)) {
            throw new Error("Not found");
        }

        await ctx.db.delete(args.id);
        await applyCloudUsageDelta(ctx, authenticatedUserId, {
            skillCount: -1,
        });
    },
});
