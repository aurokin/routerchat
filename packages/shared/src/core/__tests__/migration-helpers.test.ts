import { describe, expect, it } from "vitest";
import type { Attachment, ChatSession, Message } from "../types";
import type { Skill } from "../skills";
import {
    buildCloneConfig,
    runCloneWithAdapters,
    runMigrationWithAdapters,
} from "../sync/migration-helpers";
import { createMemoryAdapter } from "./helpers";

describe("migration-helpers", () => {
    it("builds clone config with textOnly support", () => {
        expect(buildCloneConfig()).toEqual({
            includeChats: true,
            includeMessages: true,
            includeAttachments: true,
            includeSkills: true,
        });

        expect(buildCloneConfig({ textOnly: true })).toEqual({
            includeChats: true,
            includeMessages: true,
            includeAttachments: false,
            includeSkills: true,
        });
    });

    it("runs migration with adapters and config passthrough", async () => {
        const chats: ChatSession[] = [
            {
                id: "chat-1",
                title: "Chat",
                modelId: "model-1",
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
                createdAt: 3,
            },
        ];

        const source = createMemoryAdapter({ chats, messages });
        const target = createMemoryAdapter();

        await runMigrationWithAdapters({
            sourceAdapter: source,
            targetAdapter: target,
            onProgress: () => undefined,
            config: {
                includeChats: true,
                includeMessages: false,
                includeAttachments: false,
                includeSkills: false,
                includeSkillSettings: false,
                clearTargetFirst: false,
            },
        });

        expect(await target.getAllChats()).toHaveLength(1);
        expect(await target.getMessagesByChat("chat-1")).toHaveLength(0);
    });

    it("runs clone with adapters using textOnly options", async () => {
        const chats: ChatSession[] = [
            {
                id: "chat-1",
                title: "Chat",
                modelId: "model-1",
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
                attachmentIds: ["att-1"],
                createdAt: 3,
            },
        ];
        const attachments: Attachment[] = [
            {
                id: "att-1",
                messageId: "message-1",
                type: "image",
                mimeType: "image/png",
                data: "data",
                width: 1,
                height: 1,
                size: 12,
                createdAt: 4,
            },
        ];
        const skills: Skill[] = [
            {
                id: "skill-1",
                name: "Skill",
                description: "Desc",
                prompt: "Prompt",
                createdAt: 5,
            },
        ];

        const source = createMemoryAdapter({
            chats,
            messages,
            attachments,
            skills,
        });
        const target = createMemoryAdapter();

        await runCloneWithAdapters({
            sourceAdapter: source,
            targetAdapter: target,
            onProgress: () => undefined,
            options: { textOnly: true },
        });

        expect(await target.getAllChats()).toHaveLength(1);
        expect(await target.getMessagesByChat("chat-1")).toHaveLength(1);
        expect(await target.getAttachment("att-1")).toBeUndefined();
        expect(await target.getSkills()).toHaveLength(0);
    });
});
