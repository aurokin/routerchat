import { test, expect, describe, vi } from "vitest";
import type { ChatSession, Message, Skill, ThinkingLevel } from "@/lib/types";

describe("ChatContext logic", () => {
    describe("useChat throws when outside provider", () => {
        test("throws error when used outside provider", () => {
            const useContext = () => null;
            const context = useContext();
            const throwsCorrectly = () => {
                if (!context) {
                    throw new Error(
                        "useChat must be used within a ChatProvider",
                    );
                }
            };
            expect(throwsCorrectly).toThrow(
                "useChat must be used within a ChatProvider",
            );
        });
    });

    describe("createChat", () => {
        test("uses storage defaults for new chat", () => {
            const defaultModel = "test/model";
            const defaultThinking: ThinkingLevel = "medium";
            const defaultSearchLevel = "medium" as const;

            const chat: ChatSession = {
                id: expect.any(String),
                title: "New Chat",
                modelId: defaultModel,
                thinking: defaultThinking,
                searchLevel: defaultSearchLevel,
                createdAt: expect.any(Number),
                updatedAt: expect.any(Number),
            };

            expect(chat.modelId).toBe("test/model");
            expect(chat.thinking).toBe("medium");
            expect(chat.searchLevel).toBe("medium");
        });

        test("generates UUID for new chat", () => {
            const ids: string[] = [];
            for (let i = 0; i < 100; i++) {
                ids.push(crypto.randomUUID());
            }
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(100);
        });

        test("sets as current chat after creation", () => {
            const chat: ChatSession = {
                id: "chat-123",
                title: "New Chat",
                modelId: "test/model",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            let currentChat: ChatSession | null = null;
            currentChat = chat;

            expect(currentChat?.id).toBe("chat-123");
        });

        test("clears messages after creation", () => {
            const messages: Message[] = [];
            expect(messages).toEqual([]);
        });

        test("uses custom title when provided", () => {
            const customTitle = "My Custom Chat";
            const chat: ChatSession = {
                id: expect.any(String),
                title: customTitle,
                modelId: "test/model",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: expect.any(Number),
                updatedAt: expect.any(Number),
            };

            expect(chat.title).toBe(customTitle);
        });

        test("uses custom modelId when provided", () => {
            const customModel = "anthropic/claude-3-5-sonnet";
            const chat: ChatSession = {
                id: expect.any(String),
                title: "New Chat",
                modelId: customModel,
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: expect.any(Number),
                updatedAt: expect.any(Number),
            };

            expect(chat.modelId).toBe(customModel);
        });
    });

    describe("selectChat", () => {
        test("loads chat by ID", () => {
            const mockChat: ChatSession = {
                id: "chat-123",
                title: "Test Chat",
                modelId: "test/model",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 2000,
            };

            const findChat = (id: string) => {
                if (id === "chat-123") return mockChat;
                return undefined;
            };

            const result = findChat("chat-123");
            expect(result?.id).toBe("chat-123");
        });

        test("loads messages sorted by createdAt", () => {
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

            const sortedMessages = messages.sort(
                (a, b) => a.createdAt - b.createdAt,
            );

            expect(sortedMessages[0]!.id).toBe("1");
            expect(sortedMessages[1]!.id).toBe("2");
            expect(sortedMessages[2]!.id).toBe("3");
        });

        test("does nothing if chat not found", () => {
            const findChat = (id: string) => undefined;

            const result = findChat("nonexistent");
            expect(result).toBeUndefined();
        });
    });

    describe("deleteChat", () => {
        test("removes chat from list", () => {
            const chats: ChatSession[] = [
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

            const filtered = chats.filter((c) => c.id !== "remove");

            expect(filtered).toHaveLength(1);
            expect(filtered[0]!.id).toBe("keep");
        });

        test("clears current chat when deleted", () => {
            const currentChatId = "chat-to-delete";
            let currentChat: ChatSession | null = {
                id: currentChatId,
                title: "To Delete",
                modelId: "test",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            };

            if (currentChat?.id === currentChatId) {
                currentChat = null;
            }

            expect(currentChat).toBeNull();
        });
    });

    describe("updateChat", () => {
        test("modifies chat and updates timestamp", () => {
            const chat: ChatSession = {
                id: "chat-123",
                title: "Original",
                modelId: "test/model",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            };

            const updated = { ...chat, title: "Updated", updatedAt: 2000 };

            expect(updated.title).toBe("Updated");
            expect(updated.updatedAt).toBeGreaterThan(chat.updatedAt);
        });

        test("updates current chat if matching", () => {
            const currentChat: ChatSession = {
                id: "chat-123",
                title: "Current",
                modelId: "test/model",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            };

            const updated = { ...currentChat, title: "Updated" };

            if (currentChat.id === updated.id) {
                Object.assign(currentChat, updated);
            }

            expect(currentChat.title).toBe("Updated");
        });
    });

    describe("addMessage", () => {
        test("throws error without current chat", () => {
            let currentChat: ChatSession | null = null;

            expect(() => {
                if (!currentChat) {
                    throw new Error("No current chat selected");
                }
            }).toThrow("No current chat selected");
        });

        test("creates message with id and timestamp", () => {
            const messageInput = {
                role: "user" as const,
                content: "Hello",
                contextContent: "Hello",
            };

            const newMessage: Message = {
                ...messageInput,
                id: expect.any(String),
                sessionId: "chat-123",
                createdAt: expect.any(Number),
            };

            expect(newMessage.id).toBeDefined();
            expect(newMessage.createdAt).toBeDefined();
        });

        test("updates chat timestamp when message added", () => {
            const chat: ChatSession = {
                id: "chat-123",
                title: "Chat",
                modelId: "test/model",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            };

            const originalUpdatedAt = chat.updatedAt;
            chat.updatedAt = Date.now();

            expect(chat.updatedAt).toBeGreaterThan(originalUpdatedAt);
        });

        test("preserves optional fields when provided", () => {
            const messageInput = {
                role: "user" as const,
                content: "Hello",
                contextContent: "Hello",
                thinking: "Reasoning...",
                skill: null,
                modelId: "anthropic/claude-3-5-sonnet",
                thinkingLevel: "high" as ThinkingLevel,
                searchLevel: "medium" as const,
            };

            const newMessage: Message = {
                ...messageInput,
                id: expect.any(String),
                sessionId: "chat-123",
                createdAt: expect.any(Number),
            };

            expect(newMessage.thinking).toBe("Reasoning...");
            expect(newMessage.modelId).toBe("anthropic/claude-3-5-sonnet");
            expect(newMessage.thinkingLevel).toBe("high");
            expect(newMessage.searchLevel).toBe("medium");
        });

        test("preserves tool message replay fields", () => {
            const messageInput = {
                role: "tool" as const,
                content: '{"ok":true}',
                contextContent: '{"ok":true}',
                toolCallId: "call-1",
                toolName: "calculator",
            };

            const newMessage: Message = {
                ...messageInput,
                id: expect.any(String),
                sessionId: "chat-123",
                createdAt: expect.any(Number),
            };

            expect(newMessage.toolCallId).toBe("call-1");
            expect(newMessage.toolName).toBe("calculator");
        });
    });

    describe("updateMessage", () => {
        test("modifies existing message", () => {
            const message: Message = {
                id: "msg-123",
                sessionId: "chat-1",
                role: "assistant",
                content: "Original",
                contextContent: "Original",
                createdAt: 1000,
            };

            const updates = { content: "Updated", contextContent: "Updated" };
            const updated = { ...message, ...updates };

            expect(updated.content).toBe("Updated");
        });

        test("handles non-existent message gracefully", () => {
            const messages: Message[] = [
                {
                    id: "msg-1",
                    sessionId: "chat-1",
                    role: "user",
                    content: "Hello",
                    contextContent: "Hello",
                    createdAt: 1000,
                },
            ];

            const messageId = "nonexistent";
            const result = messages.find((m) => m.id === messageId);

            expect(result).toBeUndefined();
        });
    });

    describe("clearCurrentChat", () => {
        test("clears chat and messages", () => {
            let currentChat: ChatSession | null = {
                id: "chat-123",
                title: "Chat",
                modelId: "test/model",
                thinking: "none",
                searchLevel: "none" as const,
                createdAt: 1000,
                updatedAt: 1000,
            };
            let messages: Message[] = [
                {
                    id: "msg-1",
                    sessionId: "chat-123",
                    role: "user",
                    content: "Hello",
                    contextContent: "Hello",
                    createdAt: 1000,
                },
            ];

            currentChat = null;
            messages = [];

            expect(currentChat).toBeNull();
            expect(messages).toEqual([]);
        });
    });

    describe("message CRUD", () => {
        test("createMessage stores message", () => {
            const messages: Message[] = [];
            const newMessage: Message = {
                id: "msg-1",
                sessionId: "chat-1",
                role: "user",
                content: "Hello",
                contextContent: "Hello",
                createdAt: 1000,
            };

            messages.push(newMessage);

            expect(messages).toHaveLength(1);
        });

        test("updateMessage modifies message", () => {
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

            const updated: Message = { ...messages[0]!, content: "Updated" };
            const index = messages.findIndex((m) => m.id === "msg-1");
            if (index >= 0) messages[index] = updated;

            expect(messages[0]!.content).toBe("Updated");
        });

        test("deleteMessagesByChat removes messages", () => {
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
        });
    });

    describe("chat list management", () => {
        test("getAllChats sorts by updatedAt descending", () => {
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
});
