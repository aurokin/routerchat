import { describe, expect, it } from "vitest";
import type { Attachment, ChatSession, Message } from "../types";
import {
    calculateMigrationProgress,
    getDataSummary,
    runClone,
    runMigration,
} from "../sync";
import { createMemoryAdapter } from "./helpers";
import type { Skill } from "../skills";

describe("sync", () => {
    const chats: ChatSession[] = [
        {
            id: "chat-a",
            title: "First",
            modelId: "model-a",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        },
        {
            id: "chat-b",
            title: "Second",
            modelId: "model-b",
            thinking: "low",
            searchLevel: "low",
            createdAt: 3,
            updatedAt: 4,
        },
    ];

    const messages: Message[] = [
        {
            id: "message-a",
            sessionId: "chat-a",
            role: "user",
            content: "hello",
            contextContent: "",
            attachmentIds: ["att-1", "att-2"],
            createdAt: 5,
        },
        {
            id: "message-b",
            sessionId: "chat-b",
            role: "assistant",
            content: "hi",
            contextContent: "",
            attachmentIds: ["att-3"],
            createdAt: 6,
        },
    ];

    const attachments: Attachment[] = [
        {
            id: "att-1",
            messageId: "message-a",
            type: "image",
            mimeType: "image/png",
            data: "data-1",
            width: 1,
            height: 1,
            size: 120,
            createdAt: 7,
        },
        {
            id: "att-2",
            messageId: "message-a",
            type: "image",
            mimeType: "image/png",
            data: "data-2",
            width: 1,
            height: 1,
            size: 80,
            createdAt: 8,
            purgedAt: 9,
        },
        {
            id: "att-3",
            messageId: "message-b",
            type: "image",
            mimeType: "image/jpeg",
            data: "data-3",
            width: 1,
            height: 1,
            size: 50,
            createdAt: 10,
        },
    ];

    const skills: Skill[] = [
        {
            id: "skill-1",
            name: "Helper",
            description: "Helps with tasks",
            prompt: "Be helpful",
            createdAt: 11,
        },
    ];

    const skillSettings = {
        defaultSkillId: "skill-1",
        selectedSkillId: "skill-1",
        selectedSkillMode: "manual" as const,
    };

    it("calculates migration progress percentage", () => {
        const progress = calculateMigrationProgress("attachments", 5, 10);
        expect(progress.phase).toBe("attachments");
        expect(progress.total).toBe(10);
        expect(progress.percentage).toBeCloseTo(83, 1);
    });

    it("uses fallback total when zero", () => {
        const progress = calculateMigrationProgress("chats", 0, 0);
        expect(progress.total).toBe(1);
        expect(progress.percentage).toBe(0);
    });

    it("calculates progress boundaries for a single item", () => {
        expect(
            calculateMigrationProgress("chats", 1, 1).percentage,
        ).toBeCloseTo(33, 1);
        expect(
            calculateMigrationProgress("messages", 1, 1).percentage,
        ).toBeCloseTo(66, 1);
        expect(calculateMigrationProgress("attachments", 1, 1).percentage).toBe(
            100,
        );
        expect(calculateMigrationProgress("complete", 1, 1).percentage).toBe(
            100,
        );
    });

    it("summarizes data with purged attachments excluded", async () => {
        const chats: ChatSession[] = [
            {
                id: "chat-1",
                title: "Chat",
                modelId: "model",
                thinking: "none",
                searchLevel: "none",
                createdAt: 1,
                updatedAt: 2,
            },
        ];

        const messages: Message[] = [
            {
                id: "message-1",
                sessionId: "chat-1",
                role: "user",
                content: "hello",
                contextContent: "",
                attachmentIds: ["att-1", "att-2"],
                createdAt: 3,
            },
        ];

        const attachments: Attachment[] = [
            {
                id: "att-1",
                messageId: "message-1",
                type: "image",
                mimeType: "image/png",
                data: "abc",
                width: 1,
                height: 1,
                size: 200,
                createdAt: 4,
            },
            {
                id: "att-2",
                messageId: "message-1",
                type: "image",
                mimeType: "image/png",
                data: "def",
                width: 1,
                height: 1,
                size: 150,
                createdAt: 5,
                purgedAt: 6,
            },
        ];

        const adapter = createMemoryAdapter({ chats, messages, attachments });
        const summary = await getDataSummary(adapter);

        expect(summary.chats).toBe(1);
        expect(summary.messages).toBe(1);
        expect(summary.attachments).toBe(1);
        expect(summary.totalBytes).toBe(200);
    });

    it("runs migration with include flags and progress totals", async () => {
        const source = createMemoryAdapter({
            chats,
            messages,
            attachments,
            skills,
            skillSettings,
        });
        const target = createMemoryAdapter();
        const progressEvents: Array<{ phase: string; total: number }> = [];

        await runMigration(
            {
                sourceAdapter: source,
                targetAdapter: target,
                onProgress: (progress) => progressEvents.push(progress),
            },
            {
                includeChats: true,
                includeMessages: false,
                includeAttachments: true,
                includeSkills: true,
                includeSkillSettings: false,
                clearTargetFirst: false,
            },
        );

        const targetChats = await target.getAllChats();
        expect(targetChats).toHaveLength(2);
        expect(await target.getMessagesByChat("chat-a")).toHaveLength(0);
        expect(await target.getAttachment("att-1")).toBeDefined();
        expect(await target.getSkills()).toHaveLength(1);
        expect(await target.getSkillSettings()).toEqual({
            defaultSkillId: null,
            selectedSkillId: null,
            selectedSkillMode: "auto",
        });

        const totals = progressEvents
            .filter((event) =>
                ["preparing", "chats", "messages", "attachments"].includes(
                    event.phase,
                ),
            )
            .map((event) => event.total);
        expect(totals.every((total) => total === 5)).toBe(true);
        expect(progressEvents[0]?.phase).toBe("preparing");
        expect(progressEvents[progressEvents.length - 1]?.phase).toBe(
            "complete",
        );
    });

    it("runs migration when all include flags are disabled", async () => {
        const source = createMemoryAdapter({
            chats,
            messages,
            attachments,
            skills,
            skillSettings,
        });
        const target = createMemoryAdapter();
        const progressEvents: string[] = [];

        await runMigration(
            {
                sourceAdapter: source,
                targetAdapter: target,
                onProgress: (progress) => progressEvents.push(progress.phase),
            },
            {
                includeChats: false,
                includeMessages: false,
                includeAttachments: false,
                includeSkills: false,
                includeSkillSettings: false,
                clearTargetFirst: false,
            },
        );

        expect(await target.getAllChats()).toHaveLength(0);
        expect(await target.getMessagesByChat("chat-a")).toHaveLength(0);
        expect(await target.getAttachment("att-1")).toBeUndefined();
        expect(await target.getSkills()).toHaveLength(0);
        expect(progressEvents).toContain("complete");
    });

    it("migrates skills and settings when enabled", async () => {
        const source = createMemoryAdapter({
            chats,
            messages,
            attachments,
            skills,
            skillSettings,
        });
        const target = createMemoryAdapter();

        await runMigration(
            {
                sourceAdapter: source,
                targetAdapter: target,
                onProgress: () => undefined,
            },
            {
                includeChats: false,
                includeMessages: false,
                includeAttachments: false,
                includeSkills: true,
                includeSkillSettings: true,
                clearTargetFirst: false,
            },
        );

        expect(await target.getSkills()).toHaveLength(1);
        expect(await target.getSkillSettings()).toEqual(skillSettings);
    });

    it("runs clone with include options and progress totals", async () => {
        const source = createMemoryAdapter({
            chats,
            messages,
            attachments,
            skills,
            skillSettings,
        });
        const target = createMemoryAdapter();
        const progressEvents: Array<{ phase: string; total: number }> = [];

        await runClone({
            sourceAdapter: source,
            targetAdapter: target,
            onProgress: (progress) => progressEvents.push(progress),
            options: {
                includeChats: false,
                includeMessages: true,
                includeAttachments: false,
                includeSkills: false,
            },
        });

        expect(await target.getAllChats()).toHaveLength(0);
        expect(await target.getMessagesByChat("chat-a")).toHaveLength(1);
        expect(await target.getAttachment("att-1")).toBeUndefined();
        expect(await target.getSkills()).toHaveLength(0);

        const totals = progressEvents
            .filter((event) =>
                ["preparing", "chats", "messages", "attachments"].includes(
                    event.phase,
                ),
            )
            .map((event) => event.total);
        expect(totals.every((total) => total === 2)).toBe(true);
        expect(progressEvents[0]?.phase).toBe("preparing");
        expect(progressEvents[progressEvents.length - 1]?.phase).toBe(
            "complete",
        );
    });

    it("runs clone for empty sources", async () => {
        const source = createMemoryAdapter();
        const target = createMemoryAdapter();
        const progressEvents: Array<{ phase: string; total: number }> = [];

        await runClone({
            sourceAdapter: source,
            targetAdapter: target,
            onProgress: (progress) => progressEvents.push(progress),
        });

        expect(await target.getAllChats()).toHaveLength(0);
        const totals = progressEvents
            .filter((event) =>
                ["preparing", "chats", "messages", "attachments"].includes(
                    event.phase,
                ),
            )
            .map((event) => event.total);
        expect(totals.every((total) => total === 1)).toBe(true);
        expect(progressEvents[progressEvents.length - 1]?.phase).toBe(
            "complete",
        );
    });

    it("skips purged attachments during clone", async () => {
        const source = createMemoryAdapter({
            chats,
            messages,
            attachments,
            skills,
            skillSettings,
        });
        const target = createMemoryAdapter();

        await runClone({
            sourceAdapter: source,
            targetAdapter: target,
            onProgress: () => undefined,
            options: {
                includeChats: true,
                includeMessages: true,
                includeAttachments: true,
                includeSkills: false,
            },
        });

        expect(await target.getAttachment("att-1")).toBeDefined();
        expect(await target.getAttachment("att-2")).toBeUndefined();
    });

    it("skips missing attachments referenced by messages", async () => {
        const source = createMemoryAdapter({
            chats: [chats[0]!],
            messages: [
                {
                    id: "message-x",
                    sessionId: "chat-a",
                    role: "user",
                    content: "hello",
                    contextContent: "",
                    attachmentIds: ["missing-1"],
                    createdAt: 11,
                },
            ],
        });
        const target = createMemoryAdapter();

        await runClone({
            sourceAdapter: source,
            targetAdapter: target,
            onProgress: () => undefined,
            options: {
                includeChats: true,
                includeMessages: true,
                includeAttachments: true,
                includeSkills: false,
            },
        });

        expect(await target.getAttachment("missing-1")).toBeUndefined();
    });
});
