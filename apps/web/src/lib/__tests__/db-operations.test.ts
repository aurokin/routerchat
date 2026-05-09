import {
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";
import type { Attachment, ChatSession, Message, Skill } from "@/lib/types";

type StoreName = "chats" | "messages" | "attachments";

type FakeDb = {
    put: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    getAllFromIndex: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    getAll: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    transaction: (
        storeName: StoreName,
        mode: "readwrite" | "readonly",
    ) => {
        store: { put: (value: Attachment) => Promise<void> };
        done: Promise<void>;
    };
    createObjectStore?: ReturnType<typeof vi.fn>;
};

const stores = {
    chats: new Map<string, ChatSession>(),
    messages: new Map<string, Message>(),
    attachments: new Map<string, Attachment>(),
};

const resetStores = () => {
    stores.chats.clear();
    stores.messages.clear();
    stores.attachments.clear();
};

type StorageMock = {
    store: Map<string, string>;
    localStorage: Storage;
};

const createLocalStorageMock = (): StorageMock => {
    const store = new Map<string, string>();
    const localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size;
        },
    } as Storage;

    return { store, localStorage };
};

const getStoreValues = (store: StoreName): any[] => {
    if (store === "chats") return Array.from(stores.chats.values());
    if (store === "messages") return Array.from(stores.messages.values());
    return Array.from(stores.attachments.values());
};

const createFakeDb = (): FakeDb => {
    const put = vi.fn(async (store: StoreName, value: any) => {
        stores[store].set(value.id, value);
    });

    const get = vi.fn(async (store: StoreName, id: string) => {
        return stores[store].get(id);
    });

    const getAllFromIndex = vi.fn(
        async (store: StoreName, index: string, query?: string) => {
            const values = getStoreValues(store);
            if (store === "chats" && index === "by-updated") {
                return values.sort((a, b) => a.updatedAt - b.updatedAt);
            }
            if (store === "messages" && index === "by-session") {
                return values.filter((m) => m.sessionId === query);
            }
            if (store === "attachments" && index === "by-message") {
                return values.filter((a) => a.messageId === query);
            }
            if (store === "attachments" && index === "by-created") {
                return values.sort((a, b) => a.createdAt - b.createdAt);
            }
            return [];
        },
    );

    const del = vi.fn(async (store: StoreName, id: string) => {
        stores[store].delete(id);
    });

    const clear = vi.fn(async (store: StoreName) => {
        stores[store].clear();
    });

    const getAll = vi.fn(async (store: StoreName) => {
        return getStoreValues(store);
    });

    const count = vi.fn(async (store: StoreName) => {
        return stores[store].size;
    });

    const transaction = (storeName: StoreName) => {
        return {
            store: {
                put: async (value: any) => {
                    stores[storeName].set(value.id, value);
                },
            },
            done: Promise.resolve(),
        };
    };

    return {
        put,
        get,
        getAllFromIndex,
        delete: del,
        clear,
        getAll,
        count,
        transaction,
    };
};

let capturedUpgrade:
    | ((
          db: any,
          oldVersion: number,
          newVersion: number | null,
          transaction: any,
      ) => void)
    | null = null;

const fakeDb = createFakeDb();
const openDBMock = vi.fn((name: string, version: number, options: any) => {
    capturedUpgrade = options?.upgrade ?? null;
    return Promise.resolve(fakeDb);
});

vi.mock("idb", () => ({
    openDB: openDBMock,
}));

const db = await import("@/lib/db");

describe("db operations", () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    let storageMock: StorageMock;

    beforeAll(async () => {
        storageMock = createLocalStorageMock();
        globalThis.window = {
            localStorage: storageMock.localStorage,
        } as Window & typeof globalThis;
        globalThis.localStorage = storageMock.localStorage;
        await db.getDB();
    });

    afterAll(() => {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
    });

    beforeEach(() => {
        resetStores();
        storageMock.store.clear();
    });

    it("creates and fetches chats", async () => {
        const chat: ChatSession = {
            id: "chat-1",
            title: "Chat",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 10,
            updatedAt: 20,
        };
        await db.createChat(chat);
        const stored = await db.getChat("chat-1");
        expect(stored).toEqual(chat);
    });

    it("returns chats sorted by updatedAt desc", async () => {
        await db.createChat({
            id: "chat-1",
            title: "Old",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 1,
        });
        await db.createChat({
            id: "chat-2",
            title: "New",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 2,
            updatedAt: 3,
        });

        const chats = await db.getAllChats();
        expect(chats.map((c) => c.id)).toEqual(["chat-2", "chat-1"]);
    });

    it("sorts messages by createdAt asc", async () => {
        await db.createMessage({
            id: "msg-2",
            sessionId: "chat-1",
            role: "user",
            content: "Second",
            contextContent: "Second",
            createdAt: 200,
        });
        await db.createMessage({
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "First",
            contextContent: "First",
            createdAt: 100,
        });

        const messages = await db.getMessagesByChat("chat-1");
        expect(messages.map((m) => m.id)).toEqual(["msg-1", "msg-2"]);
    });

    it("deletes chat with related messages and attachments", async () => {
        await db.createChat({
            id: "chat-1",
            title: "Chat",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        });
        await db.createMessage({
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 10,
        });
        await db.saveAttachment({
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 11,
        });

        await db.deleteChat("chat-1");

        expect(await db.getChat("chat-1")).toBeUndefined();
        expect(await db.getMessagesByChat("chat-1")).toEqual([]);
        expect(await db.getAttachmentsByMessage("msg-1")).toEqual([]);
    });

    it("deletes message attachments", async () => {
        await db.createMessage({
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 10,
        });
        await db.saveAttachment({
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 11,
        });

        await db.deleteMessage("msg-1");

        expect(await db.getAttachmentsByMessage("msg-1")).toEqual([]);
    });

    it("deletes messages and attachments by chat", async () => {
        await db.createMessage({
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 10,
        });
        await db.createMessage({
            id: "msg-2",
            sessionId: "chat-1",
            role: "assistant",
            content: "Hi",
            contextContent: "Hi",
            createdAt: 11,
        });
        await db.saveAttachment({
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 12,
        });

        await db.deleteMessagesByChat("chat-1");

        expect(await db.getMessagesByChat("chat-1")).toEqual([]);
        expect(await db.getAttachmentsByMessage("msg-1")).toEqual([]);
    });

    it("saves attachments in batch", async () => {
        await db.saveAttachments([
            {
                id: "att-1",
                messageId: "msg-1",
                type: "image",
                mimeType: "image/png",
                data: "data-1",
                width: 10,
                height: 10,
                size: 100,
                createdAt: 1,
            },
            {
                id: "att-2",
                messageId: "msg-2",
                type: "image",
                mimeType: "image/png",
                data: "data-2",
                width: 10,
                height: 10,
                size: 200,
                createdAt: 2,
            },
        ]);

        expect(await db.getAttachment("att-1")).toBeDefined();
        expect(await db.getAttachment("att-2")).toBeDefined();
    });

    it("reports storage usage", async () => {
        await db.createChat({
            id: "chat-1",
            title: "Chat",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        });
        await db.createMessage({
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 10,
        });
        await db.saveAttachment({
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 250,
            createdAt: 11,
        });

        const usage = await db.getStorageUsage();
        expect(usage.sessions).toBe(1);
        expect(usage.messages).toBe(1);
        expect(usage.attachments).toBe(250);
    });

    it("sums attachment storage by session", async () => {
        await db.createMessage({
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 10,
        });
        await db.createMessage({
            id: "msg-2",
            sessionId: "chat-1",
            role: "assistant",
            content: "Hi",
            contextContent: "Hi",
            createdAt: 11,
        });
        await db.saveAttachment({
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 12,
        });
        await db.saveAttachment({
            id: "att-2",
            messageId: "msg-2",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 200,
            createdAt: 13,
        });

        const total = await db.getAttachmentStorageBySession("chat-1");
        expect(total).toBe(300);
    });

    it("purges old attachments until under quota", async () => {
        await db.saveAttachment({
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 1,
        });
        await db.saveAttachment({
            id: "att-2",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 200,
            createdAt: 2,
        });
        await db.saveAttachment({
            id: "att-3",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 300,
            createdAt: 3,
        });

        const freed = await db.cleanupOldAttachments(300);
        expect(freed).toBe(300);

        const att1 = await db.getAttachment("att-1");
        expect(att1).toBeDefined();
        expect(att1?.data).toBe("");
        expect(att1?.size).toBe(0);
        expect(att1?.purgedAt).toBeGreaterThan(0);

        const att2 = await db.getAttachment("att-2");
        expect(att2).toBeDefined();
        expect(att2?.data).toBe("");
        expect(att2?.size).toBe(0);
        expect(att2?.purgedAt).toBeGreaterThan(0);

        const att3 = await db.getAttachment("att-3");
        expect(att3).toBeDefined();
        expect(att3?.data).toBe("data");
        expect(att3?.purgedAt).toBeUndefined();
    });

    it("clears all data", async () => {
        await db.createChat({
            id: "chat-1",
            title: "Chat",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        });
        await db.createMessage({
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 10,
        });
        await db.saveAttachment({
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 11,
        });

        await db.clearAllData();

        expect(await db.getAllChats()).toEqual([]);
        expect(await db.getMessagesByChat("chat-1")).toEqual([]);
        expect(await db.getAttachment("att-1")).toBeUndefined();
    });

    it("runs upgrade migrations", async () => {
        const skillSeed: Skill[] = [
            {
                id: "skill-1",
                name: "Skill",
                description: "Desc",
                prompt: "Prompt",
                createdAt: 1000,
            },
        ];
        storageMock.store.set("routerchat-skills", JSON.stringify(skillSeed));

        const messageStore = createCursorStore([
            {
                id: "msg-1",
                sessionId: "chat-1",
                role: "user",
                content: "Hello",
                createdAt: 1,
                skillId: "skill-1",
                searchEnabled: true,
            },
            {
                id: "msg-2",
                sessionId: "chat-1",
                role: "assistant",
                content: "Hi",
                contextContent: "Hi",
                createdAt: 2,
                skillId: "missing",
                searchEnabled: false,
            },
            {
                id: "msg-3",
                sessionId: "chat-1",
                role: "assistant",
                content: "No search",
                createdAt: 3,
            },
        ]);

        const chatStore = createCursorStore([
            {
                id: "chat-1",
                title: "Chat",
                modelId: "model",
                thinking: "none",
                searchEnabled: true,
                createdAt: 1,
                updatedAt: 2,
            },
            {
                id: "chat-2",
                title: "Chat",
                modelId: "model",
                thinking: "none",
                searchEnabled: false,
                createdAt: 3,
                updatedAt: 4,
            },
        ]);

        const transaction = {
            objectStore: (name: string) => {
                if (name === "messages") return messageStore;
                if (name === "chats") return chatStore;
                throw new Error("Unexpected store");
            },
        };

        const createdStores: string[] = [];
        const upgradeDb = {
            createObjectStore: vi.fn((name: string) => {
                createdStores.push(name);
                return { createIndex: vi.fn(() => undefined) };
            }),
        };

        if (!capturedUpgrade) {
            throw new Error("Upgrade handler not captured");
        }

        await capturedUpgrade(upgradeDb, 0, 4, transaction);
        expect(createdStores).toEqual(["chats", "messages", "attachments"]);

        await capturedUpgrade(upgradeDb, 1, 4, transaction);
        await new Promise((resolve) => setTimeout(resolve, 0));

        const skillMigration = messageStore.updates.find(
            (item: any) => item.id === "msg-1" && item.skill,
        );
        expect(skillMigration?.contextContent).toBe("Hello");
        expect((skillMigration as any)?.skill?.id).toBe("skill-1");

        const searchUpdate = messageStore.updates.find(
            (item: any) => item.id === "msg-1" && "searchLevel" in item,
        );
        expect(searchUpdate?.searchLevel).toBe("medium");

        const msg3Updates = messageStore.updates.filter(
            (item: any) => item.id === "msg-3",
        );
        expect(msg3Updates.length).toBeGreaterThan(0);
        expect(msg3Updates.some((item: any) => "searchLevel" in item)).toBe(
            false,
        );

        const chatUpdate = chatStore.updates.find(
            (item: any) => item.id === "chat-1",
        );
        expect((chatUpdate as any)?.searchLevel).toBe("medium");
    });
});

type CursorStore<T> = {
    updates: any[];
    openCursor: ReturnType<typeof vi.fn>;
};

const createCursorStore = <T extends { id: string }>(
    values: T[],
): CursorStore<T> => {
    const updates: any[] = [];
    const openCursor = vi.fn(async () => {
        const makeCursor = (index: number): any => {
            return {
                value: values[index],
                update: async (updated: T) => {
                    updates.push(updated);
                },
                continue: async () => {
                    const nextIndex = index + 1;
                    return nextIndex < values.length
                        ? makeCursor(nextIndex)
                        : null;
                },
            };
        };

        return values.length > 0 ? makeCursor(0) : null;
    });

    return { updates, openCursor };
};
