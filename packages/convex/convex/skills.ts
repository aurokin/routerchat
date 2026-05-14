import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { isOwner, requireAuthUserId, requireUserMatches } from "./lib/authz";
import { assertMaxLen, LIMITS } from "./lib/limits";
import { clampPaginationOpts } from "./lib/pagination";
import { skillUsage } from "./lib/usage_aggregates";
import { limitContentCreation } from "./lib/rate_limits";

const skillDocValidator = v.object({
    _id: v.id("skills"),
    _creationTime: v.number(),
    userId: v.id("users"),
    localId: v.optional(v.string()),
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    toolIds: v.optional(v.array(v.string())),
    createdAt: v.number(),
});

/**
 * Skill Operations
 *
 * CRUD operations for saved skills.
 */

// List all skills for a user
export const listByUser = query({
    args: { userId: v.id("users") },
    returns: v.array(skillDocValidator),
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
    returns: v.object({
        page: v.array(skillDocValidator),
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
    returns: v.union(v.null(), skillDocValidator),
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
        toolIds: v.optional(v.array(v.string())),
        createdAt: v.optional(v.number()),
    },
    returns: v.id("skills"),
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

        await limitContentCreation(ctx, "createSkill", authenticatedUserId);

        const now = Date.now();
        const skillId = await ctx.db.insert("skills", {
            userId: authenticatedUserId,
            localId: args.localId,
            name: args.name,
            description: args.description,
            prompt: args.prompt,
            toolIds: args.toolIds,
            createdAt: args.createdAt ?? now,
        });

        const skill = await ctx.db.get(skillId);
        await skillUsage.insertIfDoesNotExist(ctx, skill!);
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
        toolIds: v.optional(v.array(v.string())),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const skill = await ctx.db.get(args.id);
        if (!skill || !isOwner(skill, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Skill not found",
                resource: "skills",
            });
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
        return null;
    },
});

// Delete a skill
export const remove = mutation({
    args: { id: v.id("skills") },
    returns: v.null(),
    handler: async (ctx, args) => {
        const authenticatedUserId = await requireAuthUserId(ctx);
        const skill = await ctx.db.get(args.id);
        if (!skill || !isOwner(skill, authenticatedUserId)) {
            throw new ConvexError({
                code: "NOT_FOUND",
                message: "Skill not found",
                resource: "skills",
            });
        }

        await ctx.db.delete(args.id);
        await skillUsage.deleteIfExists(ctx, skill);
        return null;
    },
});
