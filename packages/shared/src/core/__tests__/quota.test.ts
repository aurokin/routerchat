import { describe, expect, it } from "bun:test";
import {
    calculateQuotaStatus,
    enforceQuotaOnUpload,
    findOldestConversation,
    formatBytes,
    formatQuotaStatus,
    getStorageUsageByConversation,
    LOCAL_IMAGE_QUOTA,
    purgeConversationImages,
    purgeOldestConversationImages,
} from "../quota";
import type { Attachment, ChatSession, Message } from "../types";
import { createMemoryAdapter } from "./helpers";

const chatA: ChatSession = {
    id: "chat-a",
    title: "Old chat",
    modelId: "model-a",
    thinking: "none",
    searchLevel: "none",
    createdAt: 1,
    updatedAt: 5,
};

const chatB: ChatSession = {
    id: "chat-b",
    title: "New chat",
    modelId: "model-b",
    thinking: "low",
    searchLevel: "low",
    createdAt: 2,
    updatedAt: 10,
};

const messageA: Message = {
    id: "message-a",
    sessionId: "chat-a",
    role: "user",
    content: "hello",
    contextContent: "",
    attachmentIds: ["att-1", "att-2"],
    createdAt: 3,
};

const messageB: Message = {
    id: "message-b",
    sessionId: "chat-b",
    role: "user",
    content: "hi",
    contextContent: "",
    attachmentIds: ["att-3"],
    createdAt: 4,
};

const attachments: Attachment[] = [
    {
        id: "att-1",
        messageId: "message-a",
        type: "image",
        mimeType: "image/png",
        data: "abc",
        width: 1,
        height: 1,
        size: 120,
        createdAt: 3,
    },
    {
        id: "att-2",
        messageId: "message-a",
        type: "image",
        mimeType: "image/png",
        data: "def",
        width: 1,
        height: 1,
        size: 80,
        createdAt: 3,
    },
    {
        id: "att-3",
        messageId: "message-b",
        type: "image",
        mimeType: "image/jpeg",
        data: "ghi",
        width: 1,
        height: 1,
        size: 50,
        createdAt: 4,
    },
];

describe("quota helpers", () => {
    const MB = 1024 * 1024;

    it("calculates quota status", () => {
        const status = calculateQuotaStatus(80, 100);
        expect(status.percentage).toBe(0.8);
        expect(status.isWarning80).toBe(true);
    });

    it("formats bytes and quota status", () => {
        expect(formatBytes(1024)).toBe("1 KB");
        expect(
            formatQuotaStatus({
                used: 1024,
                limit: 2048,
                percentage: 0.5,
                isWarning80: false,
                isWarning95: false,
                isExceeded: false,
            }),
        ).toBe("1 KB / 2 KB (50%)");
    });

    it("finds the oldest conversation", async () => {
        const adapter = createMemoryAdapter({
            chats: [chatB, chatA],
            messages: [messageA, messageB],
            attachments,
        });

        const oldest = await findOldestConversation(adapter);
        expect(oldest).toBe("chat-a");
    });

    it("purges images for a conversation", async () => {
        const adapter = createMemoryAdapter({
            chats: [chatA, chatB],
            messages: [messageA, messageB],
            attachments: [...attachments],
        });

        const freed = await purgeConversationImages(adapter, "chat-a");
        expect(freed).toBe(200);
        expect(await adapter.getAttachment("att-1")).toBeUndefined();
        expect(await adapter.getAttachment("att-2")).toBeUndefined();
        expect(await adapter.getAttachment("att-3")).toBeDefined();
    });

    it("returns storage usage by conversation", async () => {
        const adapter = createMemoryAdapter({
            chats: [chatA, chatB],
            messages: [messageA, messageB],
            attachments: [...attachments],
        });

        const usage = await getStorageUsageByConversation(adapter);
        expect(usage.map((entry) => entry.chatId)).toEqual([
            "chat-a",
            "chat-b",
        ]);
        expect(usage[0].imageBytes).toBe(200);
        expect(usage[1].imageCount).toBe(1);
    });

    it("allows uploads when adapter is missing", async () => {
        expect(await enforceQuotaOnUpload(10, "local")).toBe(true);
    });

    it("purges oldest conversations until under quota", async () => {
        const largeChatA: ChatSession = {
            id: "chat-large-a",
            title: "Old",
            modelId: "model-a",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 1,
        };
        const largeChatB: ChatSession = {
            id: "chat-large-b",
            title: "New",
            modelId: "model-b",
            thinking: "none",
            searchLevel: "none",
            createdAt: 2,
            updatedAt: 2,
        };
        const largeMessageA: Message = {
            id: "message-large-a",
            sessionId: "chat-large-a",
            role: "user",
            content: "hello",
            contextContent: "",
            attachmentIds: ["att-large-a"],
            createdAt: 3,
        };
        const largeMessageB: Message = {
            id: "message-large-b",
            sessionId: "chat-large-b",
            role: "user",
            content: "hi",
            contextContent: "",
            attachmentIds: ["att-large-b"],
            createdAt: 4,
        };
        const largeAttachments: Attachment[] = [
            {
                id: "att-large-a",
                messageId: "message-large-a",
                type: "image",
                mimeType: "image/png",
                data: "a",
                width: 1,
                height: 1,
                size: LOCAL_IMAGE_QUOTA - 200 * MB,
                createdAt: 5,
            },
            {
                id: "att-large-b",
                messageId: "message-large-b",
                type: "image",
                mimeType: "image/png",
                data: "b",
                width: 1,
                height: 1,
                size: 250 * MB,
                createdAt: 6,
            },
        ];

        const adapter = createMemoryAdapter({
            chats: [largeChatA, largeChatB],
            messages: [largeMessageA, largeMessageB],
            attachments: largeAttachments,
        });

        const allowed = await enforceQuotaOnUpload(50 * MB, "local", adapter);
        expect(allowed).toBe(true);
        expect(await adapter.getAttachment("att-large-a")).toBeUndefined();
        expect(await adapter.getAttachment("att-large-b")).toBeDefined();
    });

    it("stops when no bytes are freed during enforcement", async () => {
        const emptyChat: ChatSession = {
            id: "chat-empty",
            title: "Empty",
            modelId: "model-a",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 1,
        };
        const heavyChat: ChatSession = {
            id: "chat-heavy",
            title: "Heavy",
            modelId: "model-b",
            thinking: "none",
            searchLevel: "none",
            createdAt: 2,
            updatedAt: 2,
        };
        const emptyMessage: Message = {
            id: "message-empty",
            sessionId: "chat-empty",
            role: "user",
            content: "hi",
            contextContent: "",
            createdAt: 3,
        };
        const heavyMessage: Message = {
            id: "message-heavy",
            sessionId: "chat-heavy",
            role: "user",
            content: "hi",
            contextContent: "",
            attachmentIds: ["att-heavy"],
            createdAt: 4,
        };
        const heavyAttachment: Attachment = {
            id: "att-heavy",
            messageId: "message-heavy",
            type: "image",
            mimeType: "image/png",
            data: "c",
            width: 1,
            height: 1,
            size: LOCAL_IMAGE_QUOTA + 100 * MB,
            createdAt: 5,
        };

        const adapter = createMemoryAdapter({
            chats: [emptyChat, heavyChat],
            messages: [emptyMessage, heavyMessage],
            attachments: [heavyAttachment],
        });

        const allowed = await enforceQuotaOnUpload(50 * MB, "local", adapter);
        expect(allowed).toBe(false);
        expect(await adapter.getAttachment("att-heavy")).toBeDefined();
    });

    it("purges oldest conversations until under limit", async () => {
        const chatOld: ChatSession = {
            id: "chat-old",
            title: "Old",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 1,
        };
        const chatNew: ChatSession = {
            id: "chat-new",
            title: "New",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 2,
            updatedAt: 2,
        };
        const messageOld: Message = {
            id: "message-old",
            sessionId: "chat-old",
            role: "user",
            content: "hi",
            contextContent: "",
            attachmentIds: ["att-old"],
            createdAt: 3,
        };
        const messageNew: Message = {
            id: "message-new",
            sessionId: "chat-new",
            role: "user",
            content: "hi",
            contextContent: "",
            attachmentIds: ["att-new"],
            createdAt: 4,
        };
        const adapter = createMemoryAdapter({
            chats: [chatOld, chatNew],
            messages: [messageOld, messageNew],
            attachments: [
                {
                    id: "att-old",
                    messageId: "message-old",
                    type: "image",
                    mimeType: "image/png",
                    data: "a",
                    width: 1,
                    height: 1,
                    size: LOCAL_IMAGE_QUOTA - 150 * MB,
                    createdAt: 5,
                },
                {
                    id: "att-new",
                    messageId: "message-new",
                    type: "image",
                    mimeType: "image/png",
                    data: "b",
                    width: 1,
                    height: 1,
                    size: 200 * MB,
                    createdAt: 6,
                },
            ],
        });

        const freed = await purgeOldestConversationImages(adapter, "local");
        expect(freed).toBe(LOCAL_IMAGE_QUOTA - 150 * MB);
        expect(await adapter.getAttachment("att-old")).toBeUndefined();
        expect(await adapter.getAttachment("att-new")).toBeDefined();
    });

    it("stops when purge cannot free any bytes", async () => {
        const emptyChat: ChatSession = {
            id: "chat-empty-2",
            title: "Empty",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 1,
        };
        const heavyChat: ChatSession = {
            id: "chat-heavy-2",
            title: "Heavy",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 2,
            updatedAt: 2,
        };
        const emptyMessage: Message = {
            id: "message-empty-2",
            sessionId: "chat-empty-2",
            role: "user",
            content: "hi",
            contextContent: "",
            createdAt: 3,
        };
        const heavyMessage: Message = {
            id: "message-heavy-2",
            sessionId: "chat-heavy-2",
            role: "user",
            content: "hi",
            contextContent: "",
            attachmentIds: ["att-heavy-2"],
            createdAt: 4,
        };
        const adapter = createMemoryAdapter({
            chats: [emptyChat, heavyChat],
            messages: [emptyMessage, heavyMessage],
            attachments: [
                {
                    id: "att-heavy-2",
                    messageId: "message-heavy-2",
                    type: "image",
                    mimeType: "image/png",
                    data: "b",
                    width: 1,
                    height: 1,
                    size: LOCAL_IMAGE_QUOTA + 200 * MB,
                    createdAt: 5,
                },
            ],
        });

        const freed = await purgeOldestConversationImages(adapter, "local");
        expect(freed).toBe(0);
        expect(await adapter.getAttachment("att-heavy-2")).toBeDefined();
    });
});
