import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment, ChatSession, Message } from "@/lib/types";
import type { Id } from "@convex/_generated/dataModel";
import {
    ConvexStorageAdapter,
    type ConvexClient,
} from "@/lib/sync/convex-adapter";
import * as storage from "@/lib/storage";

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

const createClient = (
    mutationResponses: unknown[] = [],
    queryResponses: unknown[] = [],
    actionResponses: unknown[] = [],
): {
    client: ConvexClient;
    mutation: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    action: ReturnType<typeof vi.fn>;
} => {
    let mutationIndex = 0;
    let queryIndex = 0;
    let actionIndex = 0;
    const mutation = vi.fn(async () => mutationResponses[mutationIndex++]);
    const query = vi.fn(async () => queryResponses[queryIndex++]);
    const action = vi.fn(async () => actionResponses[actionIndex++]);
    return {
        client: { mutation, query, action } as ConvexClient,
        mutation,
        query,
        action,
    };
};

describe("ConvexStorageAdapter", () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    const originalAtob = globalThis.atob;
    const originalFileReader = globalThis.FileReader;
    const originalFetch = globalThis.fetch;

    let storageMock: StorageMock;
    let fetchMock: ReturnType<typeof vi.fn>;
    const userId = "user-1" as Id<"users">;

    const chatDoc = {
        _id: "cx-chat-1",
        localId: "chat-1",
        title: "Chat",
        modelId: "model",
        thinking: "none",
        searchLevel: "none" as const,
        createdAt: 1,
        updatedAt: 2,
    };

    const messageDoc = {
        _id: "cx-msg-1",
        localId: "msg-1",
        chatId: chatDoc._id,
        role: "user" as const,
        content: "Hello",
        contextContent: "Hello",
        createdAt: 3,
    };

    const attachmentDoc = {
        _id: "cx-att-1",
        localId: "att-1",
        messageId: messageDoc._id,
        type: "image" as const,
        mimeType: "image/png" as const,
        storageId: "storage-1",
        width: 10,
        height: 10,
        size: 100,
        createdAt: 4,
    };

    const skillDoc = {
        _id: "cx-skill-1",
        localId: "skill-1",
        name: "Skill",
        description: "Desc",
        prompt: "Prompt",
        createdAt: 10,
    };

    beforeEach(() => {
        storageMock = createLocalStorageMock();
        globalThis.window = {
            localStorage: storageMock.localStorage,
        } as Window & typeof globalThis;
        globalThis.localStorage = storageMock.localStorage;

        globalThis.atob = (value: string) =>
            Buffer.from(value, "base64").toString("binary");

        class MockFileReader {
            result: string | null = null;
            onloadend: ((event: Event) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;

            readAsDataURL(blob: Blob) {
                blob.arrayBuffer()
                    .then((buffer) => {
                        const base64 = Buffer.from(buffer).toString("base64");
                        this.result = `data:${blob.type};base64,${base64}`;
                        this.onloadend?.(new Event("loadend"));
                    })
                    .catch(() => {
                        this.onerror?.(new Event("error"));
                    });
            }
        }

        globalThis.FileReader = MockFileReader as unknown as typeof FileReader;

        fetchMock = vi.fn(async (url: string) => {
            if (url === "https://upload.test") {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ storageId: "storage-1" }),
                    text: async () => "ok",
                } as Response;
            }

            if (url === "https://download.test") {
                const bytes = new TextEncoder().encode("downloaded");
                return {
                    ok: true,
                    status: 200,
                    blob: async () => new Blob([bytes], { type: "image/png" }),
                } as Response;
            }

            return {
                ok: false,
                status: 404,
                text: async () => "not found",
            } as Response;
        });

        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
        globalThis.atob = originalAtob;
        globalThis.FileReader = originalFileReader;
        globalThis.fetch = originalFetch;
    });

    it("creates and fetches chats via Convex", async () => {
        const { client, mutation, query } = createClient(
            [chatDoc._id],
            [chatDoc],
        );
        const adapter = new ConvexStorageAdapter(client, userId);
        const chat: ChatSession = {
            id: "chat-1",
            title: "Chat",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        };

        const id = await adapter.createChat(chat);
        expect(id).toBe("chat-1");
        expect(mutation).toHaveBeenCalledTimes(1);
        expect(mutation.mock.calls[0]?.[1]).toMatchObject({
            userId,
            localId: "chat-1",
            title: "Chat",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        });

        const fetched = await adapter.getChat("chat-1");
        expect(fetched).toEqual(chat);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it("updates chats by local id lookup", async () => {
        const { client, mutation, query } = createClient(
            [undefined],
            [chatDoc],
        );
        const adapter = new ConvexStorageAdapter(client, userId);
        const chat: ChatSession = {
            id: "chat-1",
            title: "Chat",
            modelId: "model",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        };

        await adapter.updateChat({ ...chat, title: "Updated" });
        expect(query).toHaveBeenCalledTimes(1);
        expect(mutation).toHaveBeenCalledTimes(1);
        expect(mutation.mock.calls[0]?.[1]).toMatchObject({ id: chatDoc._id });
    });

    it("creates and lists messages", async () => {
        const { client, mutation, query } = createClient(
            [messageDoc._id],
            [
                chatDoc,
                {
                    page: [messageDoc],
                    isDone: true,
                    continueCursor: "",
                },
            ],
        );
        const adapter = new ConvexStorageAdapter(client, userId);
        const message: Message = {
            id: "msg-1",
            sessionId: "chat-1",
            role: "user",
            content: "Hello",
            contextContent: "Hello",
            createdAt: 3,
        };

        const id = await adapter.createMessage(message);
        expect(id).toBe("msg-1");
        expect(mutation).toHaveBeenCalledTimes(1);

        const messages = await adapter.getMessagesByChat("chat-1");
        expect(messages[0]?.id).toBe("msg-1");
        expect(messages[0]?.sessionId).toBe("chat-1");
        expect(query).toHaveBeenCalledTimes(2);
    });

    it("uploads attachments and serves them from the in-memory cache", async () => {
        const { client, mutation, query } = createClient(
            ["https://upload.test", attachmentDoc._id],
            [messageDoc, attachmentDoc, "https://download.test"],
        );
        const adapter = new ConvexStorageAdapter(client, userId);
        const attachment: Attachment = {
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/png",
            data: "data:image/png;base64,QUJD",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 4,
        };

        const id = await adapter.saveAttachment(attachment);
        expect(id).toBe("att-1");
        expect(fetchMock).toHaveBeenCalled();
        expect(mutation).toHaveBeenCalledTimes(2);

        const fetched = await adapter.getAttachment("att-1");
        expect(fetched?.data).toBe("QUJD");

        // saveAttachment queries for the message id; getAttachment reads the attachment doc.
        // It should not download from the signed URL because the upload already seeded the cache.
        expect(query).toHaveBeenCalledTimes(2);
        expect(
            fetchMock.mock.calls.some(
                ([url]) => url === "https://download.test",
            ),
        ).toBe(false);
    });

    it("downloads attachments once and caches the result", async () => {
        const attachmentDoc2 = {
            ...attachmentDoc,
            _id: "cx-att-2",
            localId: "att-2",
            storageId: "storage-2",
        };
        const { client, query } = createClient(
            [],
            [
                attachmentDoc2,
                attachmentDoc2,
                "https://download.test",
                attachmentDoc2,
            ],
        );
        const adapter = new ConvexStorageAdapter(client, userId);

        const first = await adapter.getAttachment("att-2");
        const expectedBase64 = Buffer.from("downloaded").toString("base64");
        expect(first?.data).toBe(expectedBase64);

        const second = await adapter.getAttachment("att-2");
        expect(second?.data).toBe(expectedBase64);

        // First call: getByLocalId -> get -> getUrl
        // Second call: get (uses cached data, no getUrl)
        expect(query).toHaveBeenCalledTimes(4);
        expect(
            fetchMock.mock.calls.filter(
                ([url]) => url === "https://download.test",
            ),
        ).toHaveLength(1);
    });

    it("manages skills and skill settings", async () => {
        const { client, mutation, query } = createClient(
            [skillDoc._id, undefined, undefined],
            [
                {
                    page: [skillDoc],
                    isDone: true,
                    continueCursor: "",
                },
            ],
        );
        const adapter = new ConvexStorageAdapter(client, userId);
        storage.setCloudDefaultSkillId("skill-default");
        storage.setCloudSelectedSkillId("skill-selected");
        storage.setCloudSelectedSkillMode("manual");

        const settings = await adapter.getSkillSettings();
        expect(settings).toEqual({
            defaultSkillId: "skill-default",
            selectedSkillId: "skill-selected",
            selectedSkillMode: "manual",
        });

        await adapter.upsertSkillSettings({
            defaultSkillId: null,
            selectedSkillId: "skill-new",
            selectedSkillMode: "auto",
        });
        expect(storage.getCloudDefaultSkillId()).toBeNull();
        expect(storage.getCloudSelectedSkillId()).toBe("skill-new");
        expect(storage.getCloudSelectedSkillMode()).toBe("auto");

        const skills = await adapter.getSkills();
        expect(skills[0]?.id).toBe("skill-1");

        const createdId = await adapter.createSkill({
            id: "skill-2",
            name: "New",
            description: "Desc",
            prompt: "Prompt",
            createdAt: 11,
        });
        expect(createdId).toBe("skill-2");

        await adapter.updateSkill({
            id: "skill-1",
            name: "Updated",
            description: "Desc",
            prompt: "Prompt",
            createdAt: 10,
        });

        await adapter.deleteSkill("skill-1");
        expect(mutation).toHaveBeenCalledTimes(3);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it("reads quota usage from Convex", async () => {
        const { client, query } = createClient(
            [],
            [1234, { bytes: 1234, messageCount: 1, sessionCount: 1 }],
        );
        const adapter = new ConvexStorageAdapter(client, userId);
        const imageUsage = await adapter.getImageStorageUsage();
        expect(imageUsage).toBe(1234);

        const usage = await adapter.getStorageUsage();
        expect(usage).toEqual({
            bytes: 1234,
            messageCount: 1,
            sessionCount: 1,
        });
        expect(query).toHaveBeenCalledTimes(2);
    });
});
