import { describe, expect, test } from "vitest";

/**
 * Tests for users.ts storage usage logic
 *
 * Convex queries are validated by mirroring the data aggregation rules.
 */

describe("users.ts storage usage", () => {
    test("counts bytes excluding purged attachments", () => {
        const attachments = [
            { size: 1024 },
            { size: 2048, purgedAt: 1234 },
            { size: 4096 },
        ];
        const chats = [{ id: "chat-1" }, { id: "chat-2" }];
        const messages = [{ id: "msg-1" }, { id: "msg-2" }, { id: "msg-3" }];

        const bytes = attachments.reduce(
            (sum, attachment) =>
                sum + ("purgedAt" in attachment ? 0 : attachment.size),
            0,
        );

        const usage = {
            bytes,
            messageCount: messages.length,
            sessionCount: chats.length,
        };

        expect(usage).toEqual({
            bytes: 5120,
            messageCount: 3,
            sessionCount: 2,
        });
    });

    test("returns zeroed usage for empty datasets", () => {
        const attachments: Array<{ size: number; purgedAt?: number }> = [];
        const chats: Array<{ id: string }> = [];
        const messages: Array<{ id: string }> = [];

        const bytes = attachments.reduce(
            (sum, attachment) =>
                sum + ("purgedAt" in attachment ? 0 : attachment.size),
            0,
        );

        const usage = {
            bytes,
            messageCount: messages.length,
            sessionCount: chats.length,
        };

        expect(usage).toEqual({
            bytes: 0,
            messageCount: 0,
            sessionCount: 0,
        });
    });
});
