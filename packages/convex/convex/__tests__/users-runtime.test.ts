import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import aggregateTest from "@convex-dev/aggregate/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import {
    getCloudAttachmentStorageBytes,
    USAGE_BACKFILL_PAGE_SIZE,
} from "../lib/usage_aggregates";

// convex-test needs every Convex module up-front because it executes them
// in-process. Vitest's `import.meta.glob` returns a record of dynamic imports.
const modules = import.meta.glob("../**/*.{js,ts}");

function testConvex() {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, "chatUsage");
    aggregateTest.register(t, "messageUsage");
    aggregateTest.register(t, "skillUsage");
    aggregateTest.register(t, "attachmentUsage");
    aggregateTest.register(t, "imageAttachmentUsage");
    rateLimiterTest.register(t, "contentRateLimiter");
    return t;
}

describe("users.ts (convex-test runtime)", () => {
    test("getCurrentUserId returns null when unauthenticated", async () => {
        const t = testConvex();
        const userId = await t.query(api.users.getCurrentUserId);
        expect(userId).toBeNull();
    });

    test("get throws UNAUTHENTICATED when called without an identity", async () => {
        const t = testConvex();
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
        const t = testConvex();
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

    test("get tolerates legacy usage counter fields during migration", async () => {
        const t = testConvex();
        const userId = await t.run(async (ctx) => {
            return await ctx.db.insert("users", {
                email: "legacy-counters@example.com",
                initialSync: false,
                cloudChatCount: 1,
                cloudMessageCount: 2,
                cloudSkillCount: 3,
                cloudAttachmentCount: 4,
                cloudAttachmentBytes: 5,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        const user = await t
            .withIdentity({ subject: userId })
            .query(api.users.get, { id: userId });

        expect(user).toMatchObject({
            cloudChatCount: 1,
            cloudMessageCount: 2,
            cloudSkillCount: 3,
            cloudAttachmentCount: 4,
            cloudAttachmentBytes: 5,
        });
    });

    test("ensureUsageCounters reads aggregate-backed usage", async () => {
        const t = testConvex();
        const userId = await t.run(async (ctx) => {
            return await ctx.db.insert("users", {
                email: "rebuilder@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        });

        const asUser = t.withIdentity({ subject: userId });
        await asUser.mutation(api.chats.create, {
            userId,
            title: "c1",
            modelId: "anthropic/claude-3-5-sonnet",
            thinking: "none",
            searchLevel: "none",
        });
        await asUser.mutation(api.chats.create, {
            userId,
            title: "c2",
            modelId: "anthropic/claude-3-5-sonnet",
            thinking: "none",
            searchLevel: "none",
        });

        const counters = await asUser.mutation(
            api.users.ensureUsageCounters,
            {},
        );
        expect(counters.chatCount).toBe(2);
    });

    test("ensureUsageCounters backfills pre-component rows", async () => {
        const t = testConvex();
        const userId = await t.run(async (ctx) => {
            const id = await ctx.db.insert("users", {
                email: "legacy@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            const chatId = await ctx.db.insert("chats", {
                userId: id,
                title: "legacy",
                modelId: "model",
                thinking: "none",
                searchLevel: "none",
                createdAt: 1,
                updatedAt: 1,
            });
            const messageId = await ctx.db.insert("messages", {
                userId: id,
                chatId,
                role: "user",
                content: "hello",
                contextContent: "hello",
                createdAt: 2,
            });
            await ctx.db.insert("skills", {
                userId: id,
                name: "legacy",
                description: "",
                prompt: "prompt",
                createdAt: 3,
            });
            await ctx.db.insert("attachments", {
                userId: id,
                messageId,
                type: "image",
                mimeType: "image/png",
                url: "https://example.com/legacy.png",
                width: 1,
                height: 1,
                size: 123,
                createdAt: 4,
            });
            await ctx.db.insert("attachments", {
                userId: id,
                messageId,
                type: "image",
                mimeType: "image/png",
                url: "https://example.com/purged.png",
                width: 1,
                height: 1,
                size: 999,
                purgedAt: 5,
                createdAt: 5,
            });
            await ctx.db.insert("attachments", {
                userId: id,
                messageId,
                type: "file",
                mimeType: "application/pdf",
                url: "https://example.com/file.pdf",
                filename: "file.pdf",
                width: 0,
                height: 0,
                size: 456,
                createdAt: 6,
            });
            return id;
        });

        const counters = await t
            .withIdentity({ subject: userId })
            .mutation(api.users.ensureUsageCounters, {});

        expect(counters).toMatchObject({
            chatCount: 1,
            messageCount: 1,
            skillCount: 1,
            attachmentCount: 1,
            attachmentBytes: 123,
        });
        const attachmentStorageBytes = await t.run((ctx) =>
            getCloudAttachmentStorageBytes(ctx, userId),
        );
        expect(attachmentStorageBytes).toBe(579);
    });

    test("ensureUsageCounters chunks multi-page backfill before marking complete", async () => {
        const t = testConvex();
        const userId = await t.run(async (ctx) => {
            const id = await ctx.db.insert("users", {
                email: "multi-page-backfill@example.com",
                initialSync: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            const chatId = await ctx.db.insert("chats", {
                userId: id,
                title: "legacy",
                modelId: "model",
                thinking: "none",
                searchLevel: "none",
                createdAt: 1,
                updatedAt: 1,
            });

            for (let i = 0; i < USAGE_BACKFILL_PAGE_SIZE + 1; i += 1) {
                await ctx.db.insert("messages", {
                    userId: id,
                    chatId,
                    role: "user",
                    content: `hello ${i}`,
                    contextContent: `hello ${i}`,
                    createdAt: i + 2,
                });
            }

            return id;
        });

        const firstCounters = await t
            .withIdentity({ subject: userId })
            .mutation(api.users.ensureUsageCounters, {});
        const inProgressUser = await t.run((ctx) => ctx.db.get(userId));

        expect(firstCounters.messageCount).toBe(USAGE_BACKFILL_PAGE_SIZE);
        expect(inProgressUser?.usageBackfillStage).toBe("messages");
        expect(inProgressUser?.usageBackfillCursor).toEqual(expect.any(String));
        expect(inProgressUser?.usageAggregatesBackfilledAt).toBeUndefined();

        const finalCounters = await t
            .withIdentity({ subject: userId })
            .mutation(api.users.ensureUsageCounters, {});
        const completedUser = await t.run((ctx) => ctx.db.get(userId));

        expect(finalCounters.messageCount).toBe(USAGE_BACKFILL_PAGE_SIZE + 1);
        expect(completedUser?.usageAggregatesBackfilledAt).toEqual(
            expect.any(Number),
        );
        expect(completedUser?.usageBackfillStage).toBeUndefined();
        expect(completedUser?.usageBackfillCursor).toBeUndefined();
    });

    test("ensureUsageCounters does not double-count partial backfill with legacy counters", async () => {
        const t = testConvex();
        const legacyMessageCount = USAGE_BACKFILL_PAGE_SIZE + 1;
        const userId = await t.run(async (ctx) => {
            const id = await ctx.db.insert("users", {
                email: "legacy-counted-backfill@example.com",
                initialSync: false,
                cloudMessageCount: legacyMessageCount,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            const chatId = await ctx.db.insert("chats", {
                userId: id,
                title: "legacy",
                modelId: "model",
                thinking: "none",
                searchLevel: "none",
                createdAt: 1,
                updatedAt: 1,
            });

            for (let i = 0; i < legacyMessageCount; i += 1) {
                await ctx.db.insert("messages", {
                    userId: id,
                    chatId,
                    role: "user",
                    content: `hello ${i}`,
                    contextContent: `hello ${i}`,
                    createdAt: i + 2,
                });
            }

            return id;
        });

        const firstCounters = await t
            .withIdentity({ subject: userId })
            .mutation(api.users.ensureUsageCounters, {});
        const inProgressUser = await t.run((ctx) => ctx.db.get(userId));

        expect(firstCounters.messageCount).toBe(legacyMessageCount);
        expect(inProgressUser?.usageBackfilledMessageCount).toBe(
            USAGE_BACKFILL_PAGE_SIZE,
        );
        expect(inProgressUser?.usageAggregatesBackfilledAt).toBeUndefined();

        const finalCounters = await t
            .withIdentity({ subject: userId })
            .mutation(api.users.ensureUsageCounters, {});

        expect(finalCounters.messageCount).toBe(legacyMessageCount);
    });

    test("clear cloud images leaves file attachments intact", async () => {
        const t = testConvex();
        const { operationId, imageAttachmentId, pdfAttachmentId } = await t.run(
            async (ctx) => {
                const userId = await ctx.db.insert("users", {
                    email: "mixed-attachments@example.com",
                    initialSync: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                const chatId = await ctx.db.insert("chats", {
                    userId,
                    title: "mixed",
                    modelId: "model",
                    thinking: "none",
                    searchLevel: "none",
                    createdAt: 1,
                    updatedAt: 1,
                });
                const messageId = await ctx.db.insert("messages", {
                    userId,
                    chatId,
                    role: "user",
                    content: "hello",
                    contextContent: "hello",
                    createdAt: 2,
                });
                const imageId = await ctx.db.insert("attachments", {
                    userId,
                    messageId,
                    type: "image",
                    mimeType: "image/png",
                    url: "https://example.com/image.png",
                    width: 1,
                    height: 1,
                    size: 10,
                    createdAt: 3,
                });
                const pdfId = await ctx.db.insert("attachments", {
                    userId,
                    messageId,
                    type: "file",
                    mimeType: "application/pdf",
                    url: "https://example.com/file.pdf",
                    filename: "file.pdf",
                    width: 0,
                    height: 0,
                    size: 20,
                    createdAt: 4,
                });
                const deleteOperationId = await ctx.db.insert(
                    "deleteOperations",
                    {
                        userId,
                        kind: "userAttachments",
                        status: "queued",
                        deletedChats: 0,
                        deletedMessages: 0,
                        deletedAttachments: 0,
                        freedAttachmentBytes: 0,
                        createdAt: 5,
                        updatedAt: 5,
                    },
                );

                return {
                    operationId: deleteOperationId,
                    imageAttachmentId: imageId,
                    pdfAttachmentId: pdfId,
                };
            },
        );

        await t.mutation(internal.cleanup.processDeleteOperation, {
            operationId,
        });

        const [operation, imageAttachment, pdfAttachment] = await t.run(
            async (ctx) => {
                return await Promise.all([
                    ctx.db.get(operationId),
                    ctx.db.get(imageAttachmentId),
                    ctx.db.get(pdfAttachmentId),
                ]);
            },
        );

        expect(operation).toMatchObject({
            status: "finished",
            deletedAttachments: 1,
            freedAttachmentBytes: 10,
        });
        expect(imageAttachment?.purgedAt).toEqual(expect.any(Number));
        expect(pdfAttachment?.purgedAt).toBeUndefined();
    });

    test("reset cloud data clears legacy usage counters", async () => {
        const t = testConvex();
        const { userId, operationId } = await t.run(async (ctx) => {
            const id = await ctx.db.insert("users", {
                email: "reset-legacy-counters@example.com",
                initialSync: false,
                cloudChatCount: 1,
                cloudMessageCount: 2,
                cloudSkillCount: 3,
                cloudAttachmentCount: 4,
                cloudAttachmentBytes: 500,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            const operationId = await ctx.db.insert("deleteOperations", {
                userId: id,
                kind: "userData",
                status: "queued",
                deletedChats: 0,
                deletedMessages: 0,
                deletedAttachments: 0,
                freedAttachmentBytes: 0,
                createdAt: 1,
                updatedAt: 1,
            });
            return { userId: id, operationId };
        });

        await t.mutation(internal.cleanup.processDeleteOperation, {
            operationId,
        });

        const usage = await t
            .withIdentity({ subject: userId })
            .query(api.users.getStorageUsage, { userId });
        const user = await t.run((ctx) => ctx.db.get(userId));

        expect(usage).toEqual({
            bytes: 0,
            messageCount: 0,
            sessionCount: 0,
        });
        expect(user).toMatchObject({
            cloudChatCount: 0,
            cloudMessageCount: 0,
            cloudSkillCount: 0,
            cloudAttachmentCount: 0,
            cloudAttachmentBytes: 0,
            usageAggregatesBackfilledAt: expect.any(Number),
        });
    });
});
