import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.{js,ts}");

// 32 raw bytes, base64-encoded — what convex/lib/encryption.ts expects.
const TEST_ENCRYPTION_KEY = Buffer.from(
    "12345678901234567890123456789012",
).toString("base64");

describe("apiKey.ts (convex-test runtime)", () => {
    beforeEach(() => {
        process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
    });

    afterEach(() => {
        delete process.env.ENCRYPTION_KEY;
    });

    test("hasApiKey reflects setApiKey + clearApiKey for the authed user", async () => {
        const t = convexTest(schema, modules);
        const userId = await t.run(async (ctx) => {
            return await ctx.db.insert("users", {
                email: "user@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        const asUser = t.withIdentity({ subject: userId });

        expect(await asUser.query(api.apiKey.hasApiKey)).toBe(false);

        await asUser.mutation(api.apiKey.setApiKey, {
            apiKey: "sk-or-test-key",
        });
        expect(await asUser.query(api.apiKey.hasApiKey)).toBe(true);

        await asUser.mutation(api.apiKey.clearApiKey);
        expect(await asUser.query(api.apiKey.hasApiKey)).toBe(false);
    });

    test("getDecryptedApiKey records a read row and returns plaintext", async () => {
        const t = convexTest(schema, modules);
        const userId = await t.run(async (ctx) => {
            return await ctx.db.insert("users", {
                email: "audit@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        const asUser = t.withIdentity({ subject: userId });
        await asUser.mutation(api.apiKey.setApiKey, {
            apiKey: "sk-or-secret",
        });

        const plaintext = await asUser.action(api.apiKey.getDecryptedApiKey);
        expect(plaintext).toBe("sk-or-secret");

        const accessRows = await t.run((ctx) =>
            ctx.db
                .query("apiKeyAccess")
                .withIndex("by_user_accessed", (q) => q.eq("userId", userId))
                .collect(),
        );

        expect(accessRows.length).toBeGreaterThanOrEqual(1);
        expect(accessRows.at(-1)?.kind).toBe("read");
    });
});
