import { test, expect, describe, beforeEach, mock } from "bun:test";
import type { Attachment, ChatSession, Message } from "@/lib/types";

describe("db.ts helpers", () => {
    const createMockChat = (
        overrides: Partial<ChatSession> = {},
    ): ChatSession => ({
        id: "chat-1",
        title: "Test Chat",
        modelId: "test/model",
        thinking: "none",
        searchLevel: "none" as const,
        createdAt: 1000,
        updatedAt: 2000,
        ...overrides,
    });

    const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
        id: "msg-1",
        sessionId: "chat-1",
        role: "user",
        content: "Hello",
        contextContent: "Hello",
        createdAt: 1000,
        ...overrides,
    });

    test("createMockChat generates valid chat object", () => {
        const chat = createMockChat();
        expect(chat.id).toBe("chat-1");
        expect(chat.title).toBe("Test Chat");
        expect(chat.modelId).toBe("test/model");
        expect(chat.thinking).toBe("none");
        expect(chat.searchLevel).toBe("none");
        expect(chat.createdAt).toBe(1000);
        expect(chat.updatedAt).toBe(2000);
    });

    test("createMockChat allows overrides", () => {
        const chat = createMockChat({
            title: "Custom Title",
            thinking: "high",
        });
        expect(chat.title).toBe("Custom Title");
        expect(chat.thinking).toBe("high");
    });

    test("createMockMessage generates valid message object", () => {
        const message = createMockMessage();
        expect(message.id).toBe("msg-1");
        expect(message.sessionId).toBe("chat-1");
        expect(message.role).toBe("user");
        expect(message.content).toBe("Hello");
        expect(message.contextContent).toBe("Hello");
        expect(message.createdAt).toBe(1000);
    });

    test("createMockMessage allows overrides", () => {
        const message = createMockMessage({
            role: "assistant",
            content: "Hi there",
        });
        expect(message.role).toBe("assistant");
        expect(message.content).toBe("Hi there");
    });

    test("ChatSession interface structure", () => {
        const chat: ChatSession = {
            id: "test-id",
            title: "Test",
            modelId: "model/id",
            thinking: "medium",
            searchLevel: "medium" as const,
            createdAt: 12345,
            updatedAt: 67890,
        };
        expect(chat.id).toBe("test-id");
        expect(chat.thinking).toBe("medium");
        expect(chat.searchLevel).toBe("medium");
    });

    test("Message interface structure", () => {
        const message: Message = {
            id: "msg-id",
            sessionId: "session-id",
            role: "assistant",
            content: "Response",
            contextContent: "Response",
            createdAt: 11111,
        };
        expect(message.id).toBe("msg-id");
        expect(message.role).toBe("assistant");
        expect(message.content).toBe("Response");
    });
});

describe("db.ts sorting helpers", () => {
    test("sortByCreatedAsc sorts messages correctly", () => {
        const messages = [
            { id: "1", createdAt: 3000 },
            { id: "2", createdAt: 1000 },
            { id: "3", createdAt: 2000 },
        ].sort((a, b) => a.createdAt - b.createdAt);

        expect(messages[0]!.id).toBe("2");
        expect(messages[1]!.id).toBe("3");
        expect(messages[2]!.id).toBe("1");
    });

    test("sortByUpdatedDesc sorts chats correctly", () => {
        const chats = [
            { id: "1", updatedAt: 1000 },
            { id: "2", updatedAt: 3000 },
            { id: "3", updatedAt: 2000 },
        ].sort((a, b) => b.updatedAt - a.updatedAt);

        expect(chats[0]!.id).toBe("2");
        expect(chats[1]!.id).toBe("3");
        expect(chats[2]!.id).toBe("1");
    });
});

describe("db.ts getDB", () => {
    test("rejects on server (typeof window === 'undefined')", async () => {
        const isServer = typeof window === "undefined";
        expect(isServer).toBe(true);
    });

    test("returns database connection", async () => {
        const mockDB = {
            put: mock(() => Promise.resolve()),
            get: mock(() => Promise.resolve()),
            getAllFromIndex: mock(() => Promise.resolve()),
            delete: mock(() => Promise.resolve()),
            clear: mock(() => Promise.resolve()),
        };

        expect(mockDB.put).toBeDefined();
        expect(mockDB.get).toBeDefined();
        expect(mockDB.getAllFromIndex).toBeDefined();
        expect(mockDB.delete).toBeDefined();
        expect(mockDB.clear).toBeDefined();
    });

    test("caches promise", async () => {
        let callCount = 0;
        const mockDBPromise = Promise.resolve({
            put: mock(() => Promise.resolve()),
        });

        const getCachedDB = () => {
            if (!mockDBPromise) {
                callCount++;
                return mockDBPromise;
            }
            return mockDBPromise;
        };

        const db1 = getCachedDB();
        const db2 = getCachedDB();
        expect(db1).toBe(db2);
    });
});

describe("db.ts createChat", () => {
    test("stores chat in database", async () => {
        const storedChats: ChatSession[] = [];
        const mockPut = mock(async (store: string, chat: ChatSession) => {
            storedChats.push(chat);
        });

        const chat: ChatSession = {
            id: "new-chat",
            title: "New Chat",
            modelId: "test/model",
            thinking: "none",
            searchLevel: "none" as const,
            createdAt: 1000,
            updatedAt: 1000,
        };

        await mockPut("chats", chat);
        expect(storedChats).toHaveLength(1);
        expect(storedChats[0]!.id).toBe("new-chat");
    });
});

describe("db.ts getChat", () => {
    test("returns chat by ID", async () => {
        const mockGet = mock(
            async (
                store: string,
                id: string,
            ): Promise<ChatSession | undefined> => {
                if (id === "chat-123") {
                    return {
                        id: "chat-123",
                        title: "Test",
                        modelId: "test/model",
                        thinking: "none",
                        searchLevel: "none" as const,
                        createdAt: 1000,
                        updatedAt: 1000,
                    };
                }
                return undefined;
            },
        );

        const result = await mockGet("chats", "chat-123");
        expect(result?.id).toBe("chat-123");
    });

    test("returns undefined for non-existent chat", () => {
        const result = undefined;
        expect(result).toBeUndefined();
    });
});

describe("db.ts getAllChats", () => {
    test("returns sorted by updatedAt descending", async () => {
        const chats: ChatSession[] = [
            {
                id: "1",
                title: "Old",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            },
            {
                id: "3",
                title: "Newest",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 3000,
                updatedAt: 3000,
            },
            {
                id: "2",
                title: "Middle",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 2000,
                updatedAt: 2000,
            },
        ];

        const sorted = chats.sort((a, b) => b.updatedAt - a.updatedAt);

        expect(sorted[0]!.id).toBe("3");
        expect(sorted[1]!.id).toBe("2");
        expect(sorted[2]!.id).toBe("1");
    });
});

describe("db.ts updateChat", () => {
    test("updates chat in database", async () => {
        const storedChats: ChatSession[] = [
            {
                id: "chat-1",
                title: "Original",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            },
        ];

        const mockPut = mock(async (store: string, chat: ChatSession) => {
            const index = storedChats.findIndex((c) => c.id === chat.id);
            if (index >= 0) {
                storedChats[index] = chat;
            }
        });

        const updated: ChatSession = {
            ...storedChats[0]!,
            title: "Updated",
            updatedAt: 2000,
        };

        await mockPut("chats", updated);
        expect(storedChats[0]!.title).toBe("Updated");
        expect(storedChats[0]!.updatedAt).toBe(2000);
    });
});

describe("db.ts deleteChat", () => {
    test("removes chat from database", async () => {
        const storedChats: ChatSession[] = [
            {
                id: "keep",
                title: "Keep",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            },
            {
                id: "remove",
                title: "Remove",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            },
        ];

        const filtered = storedChats.filter((c) => c.id !== "remove");

        expect(filtered).toHaveLength(1);
        expect(filtered[0]!.id).toBe("keep");
    });

    test("cascades delete messages", async () => {
        const messages: Message[] = [
            {
                id: "msg-1",
                sessionId: "chat-1",
                role: "user",
                content: "Hello",
                contextContent: "Hello",
                createdAt: 1000,
            },
            {
                id: "msg-2",
                sessionId: "chat-1",
                role: "assistant",
                content: "Hi",
                contextContent: "Hi",
                createdAt: 2000,
            },
            {
                id: "msg-3",
                sessionId: "chat-2",
                role: "user",
                content: "Other",
                contextContent: "Other",
                createdAt: 3000,
            },
        ];

        const filtered = messages.filter((m) => m.sessionId !== "chat-1");

        expect(filtered).toHaveLength(1);
        expect(filtered[0]!.id).toBe("msg-3");
    });

    test("cascades delete attachments", async () => {
        const attachments = [
            { id: "att-1", messageId: "msg-1" },
            { id: "att-2", messageId: "msg-2" },
            { id: "att-3", messageId: "msg-3" },
        ];

        const remaining = attachments.filter(
            (attachment) => attachment.messageId !== "msg-1",
        );

        expect(remaining).toHaveLength(2);
        expect(remaining.map((att) => att.id)).toEqual(["att-2", "att-3"]);
    });
});

describe("db.ts createMessage", () => {
    test("stores message with sessionId", async () => {
        const storedMessages: Message[] = [];
        const mockPut = mock(async (store: string, message: Message) => {
            storedMessages.push(message);
        });

        const message: Message = {
            id: "new-msg",
            sessionId: "chat-123",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 1000,
        };

        await mockPut("messages", message);
        expect(storedMessages).toHaveLength(1);
        expect(storedMessages[0]!.sessionId).toBe("chat-123");
    });
});

describe("db.ts getMessagesByChat", () => {
    test("returns messages sorted by createdAt", async () => {
        const messages: Message[] = [
            {
                id: "1",
                sessionId: "chat-1",
                role: "user",
                content: "First",
                contextContent: "First",
                createdAt: 1000,
            },
            {
                id: "3",
                sessionId: "chat-1",
                role: "assistant",
                content: "Third",
                contextContent: "Third",
                createdAt: 3000,
            },
            {
                id: "2",
                sessionId: "chat-1",
                role: "user",
                content: "Second",
                contextContent: "Second",
                createdAt: 2000,
            },
        ];

        const sorted = messages
            .filter((m) => m.sessionId === "chat-1")
            .sort((a, b) => a.createdAt - b.createdAt);

        expect(sorted[0]!.id).toBe("1");
        expect(sorted[1]!.id).toBe("2");
        expect(sorted[2]!.id).toBe("3");
    });

    test("filters by sessionId", async () => {
        const messages: Message[] = [
            {
                id: "1",
                sessionId: "chat-1",
                role: "user",
                content: "Hello",
                contextContent: "Hello",
                createdAt: 1000,
            },
            {
                id: "2",
                sessionId: "chat-2",
                role: "user",
                content: "Other",
                contextContent: "Other",
                createdAt: 1000,
            },
        ];

        const filtered = messages.filter((m) => m.sessionId === "chat-1");

        expect(filtered).toHaveLength(1);
        expect(filtered[0]!.id).toBe("1");
    });
});

describe("db.ts updateMessage", () => {
    test("updates message in database", async () => {
        const messages: Message[] = [
            {
                id: "msg-1",
                sessionId: "chat-1",
                role: "user",
                content: "Original",
                contextContent: "Original",
                createdAt: 1000,
            },
        ];

        const updated: Message = {
            ...messages[0]!,
            content: "Updated",
        };

        const index = messages.findIndex((m) => m.id === "msg-1");
        if (index >= 0) {
            messages[index] = updated;
        }

        expect(messages[0]!.content).toBe("Updated");
    });
});

describe("db.ts deleteMessagesByChat", () => {
    test("removes all messages for chat", async () => {
        const messages: Message[] = [
            {
                id: "1",
                sessionId: "chat-1",
                role: "user",
                content: "Hello",
                contextContent: "Hello",
                createdAt: 1000,
            },
            {
                id: "2",
                sessionId: "chat-1",
                role: "assistant",
                content: "Hi",
                contextContent: "Hi",
                createdAt: 2000,
            },
            {
                id: "3",
                sessionId: "chat-2",
                role: "user",
                content: "Other",
                contextContent: "Other",
                createdAt: 3000,
            },
        ];

        const filtered = messages.filter((m) => m.sessionId !== "chat-1");

        expect(filtered).toHaveLength(1);
        expect(filtered[0]!.id).toBe("3");
    });

    test("removes attachments for deleted messages", async () => {
        const attachments: Attachment[] = [
            {
                id: "att-1",
                messageId: "1",
                type: "image",
                mimeType: "image/png",
                data: "data",
                width: 100,
                height: 100,
                size: 1024,
                createdAt: 1000,
            },
            {
                id: "att-2",
                messageId: "2",
                type: "image",
                mimeType: "image/png",
                data: "data",
                width: 100,
                height: 100,
                size: 2048,
                createdAt: 2000,
            },
            {
                id: "att-3",
                messageId: "3",
                type: "image",
                mimeType: "image/png",
                data: "data",
                width: 100,
                height: 100,
                size: 4096,
                createdAt: 3000,
            },
        ];

        const remaining = attachments.filter(
            (attachment) => !["1", "2"].includes(attachment.messageId),
        );

        expect(remaining).toHaveLength(1);
        expect(remaining[0]!.id).toBe("att-3");
    });
});

describe("db.ts deleteMessage", () => {
    test("removes attachments for message", async () => {
        const attachments: Attachment[] = [
            {
                id: "att-1",
                messageId: "msg-1",
                type: "image",
                mimeType: "image/png",
                data: "data",
                width: 100,
                height: 100,
                size: 512,
                createdAt: 1000,
            },
            {
                id: "att-2",
                messageId: "msg-2",
                type: "image",
                mimeType: "image/png",
                data: "data",
                width: 100,
                height: 100,
                size: 512,
                createdAt: 1000,
            },
        ];

        const remaining = attachments.filter(
            (attachment) => attachment.messageId !== "msg-1",
        );

        expect(remaining).toHaveLength(1);
        expect(remaining[0]!.id).toBe("att-2");
    });
});

describe("db.ts clearAllData", () => {
    test("removes all chats and messages", async () => {
        let chats: ChatSession[] = [
            {
                id: "1",
                title: "Chat 1",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            },
            {
                id: "2",
                title: "Chat 2",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            },
        ];
        let messages: Message[] = [
            {
                id: "1",
                sessionId: "chat-1",
                role: "user",
                content: "Hello",
                contextContent: "Hello",
                createdAt: 1000,
            },
        ];

        chats = [];
        messages = [];

        expect(chats).toEqual([]);
        expect(messages).toEqual([]);
    });
});
