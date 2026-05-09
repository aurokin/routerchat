import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

// convex-test needs every Convex module up-front because it executes them
// in-process. Vitest's `import.meta.glob` returns a record of dynamic imports.
const modules = import.meta.glob("../**/*.{js,ts}");

describe("users.ts (convex-test runtime)", () => {
    test("getCurrentUserId returns null when unauthenticated", async () => {
        const t = convexTest(schema, modules);
        const userId = await t.query(api.users.getCurrentUserId);
        expect(userId).toBeNull();
    });

    test("get throws UNAUTHENTICATED when called without an identity", async () => {
        const t = convexTest(schema, modules);
        const newUserId = await t.run(async (ctx) => {
            return await ctx.db.insert("users", {
                email: "u@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        await expect(t.query(api.users.get, { id: newUserId })).rejects.toThrow(
            /UNAUTHENTICATED/,
        );
    });

    test("setInitialSync flips the user flag for the authenticated user", async () => {
        const t = convexTest(schema, modules);
        const userId = await t.run(async (ctx) => {
            return await ctx.db.insert("users", {
                email: "u@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        const asUser = t.withIdentity({ subject: userId });
        await asUser.mutation(api.users.setInitialSync, { initialSync: true });

        const updated = await t.run((ctx) => ctx.db.get(userId));
        expect(updated?.initialSync).toBe(true);
    });

    test("rebuildUsageCountersForEmail recomputes from ground truth", async () => {
        const t = convexTest(schema, modules);
        const userId = await t.run(async (ctx) => {
            const u = await ctx.db.insert("users", {
                email: "rebuilder@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            const chatBase = {
                userId: u,
                modelId: "anthropic/claude-3-5-sonnet",
                thinking: "none",
                searchLevel: "none",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            } as const;
            await ctx.db.insert("chats", { ...chatBase, title: "c1" });
            await ctx.db.insert("chats", { ...chatBase, title: "c2" });
            return u;
        });

        const counters = await t.mutation(
            internal.users.rebuildUsageCountersForEmail,
            { email: "rebuilder@example.com" },
        );

        expect(counters.chatCount).toBe(2);

        const refreshed = await t.run((ctx) => ctx.db.get(userId));
        expect(refreshed?.cloudChatCount).toBe(2);
    });
});
