import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type {
    ConvexAdapterServices,
    ConvexAttachmentLike,
    ConvexChatLike,
    ConvexMessageLike,
    ConvexSkillLike,
} from "../sync/convex-adapter-base";
import {
    ConvexAdapterBase,
    type AttachmentIO,
    type ConvexClientLike,
} from "../sync/convex-adapter-base";
import type { SkillSettings, SkillSettingsUpdate } from "../sync";
import type { Attachment, ChatSession, Message } from "../types";
import type { Skill } from "../skills";

const originalFetch = globalThis.fetch;

const mockFetch = (
    responder: (input: RequestInfo | URL, init?: RequestInit) => Response,
) => {
    const mock = async (input: RequestInfo | URL, init?: RequestInit) =>
        responder(input, init);
    const preconnect =
        "preconnect" in originalFetch &&
        typeof originalFetch.preconnect === "function"
            ? originalFetch.preconnect.bind(originalFetch)
            : () => undefined;
    globalThis.fetch = Object.assign(mock, { preconnect });
};

type Store = {
    chats: Map<string, ConvexChatLike>;
    chatsByLocalId: Map<string, string>;
    messages: Map<string, ConvexMessageLike>;
    messagesByLocalId: Map<string, string>;
    attachments: Map<string, ConvexAttachmentLike>;
    attachmentsByLocalId: Map<string, string>;
    skills: Map<string, ConvexSkillLike>;
    skillsByLocalId: Map<string, string>;
};

type Calls = {
    getUrl: number;
    download: number;
    getUploadBody: number;
    setCached: number;
    deleteCached: number;
};

const createStore = (): Store => ({
    chats: new Map(),
    chatsByLocalId: new Map(),
    messages: new Map(),
    messagesByLocalId: new Map(),
    attachments: new Map(),
    attachmentsByLocalId: new Map(),
    skills: new Map(),
    skillsByLocalId: new Map(),
});

const insertAttachment = (store: Store, attachment: ConvexAttachmentLike) => {
    store.attachments.set(attachment._id, attachment);
    store.attachmentsByLocalId.set(
        attachment.localId ?? attachment._id,
        attachment._id,
    );
};

const createServices = (store: Store, calls: Calls): ConvexAdapterServices => {
    let chatCounter = 0;
    let messageCounter = 0;
    let attachmentCounter = 0;
    let skillCounter = 0;

    const toConvexChat = (chat: ChatSession, id: string): ConvexChatLike => ({
        _id: id,
        localId: chat.id,
        title: chat.title,
        modelId: chat.modelId,
        thinking: chat.thinking,
        searchLevel: chat.searchLevel,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
    });

    const toConvexMessage = (
        message: Message,
        id: string,
        chatId: string,
    ): ConvexMessageLike => ({
        _id: id,
        localId: message.id,
        chatId,
        role: message.role,
        content: message.content,
        contextContent: message.contextContent,
        thinking: message.thinking,
        skill: message.skill,
        modelId: message.modelId,
        thinkingLevel: message.thinkingLevel,
        searchLevel: message.searchLevel,
        attachmentIds: message.attachmentIds,
        createdAt: message.createdAt,
    });

    const toConvexSkill = (skill: Skill, id: string): ConvexSkillLike => ({
        _id: id,
        localId: skill.id,
        name: skill.name,
        description: skill.description,
        prompt: skill.prompt,
        createdAt: skill.createdAt,
    });

    return {
        chats: {
            async create({ chat }) {
                const id = `chat-${(chatCounter += 1)}`;
                const entry = toConvexChat(chat, id);
                store.chats.set(id, entry);
                store.chatsByLocalId.set(chat.id, id);
                return id;
            },
            async get({ id }) {
                return store.chats.get(id) ?? null;
            },
            async getByLocalId({ localId }) {
                const id = store.chatsByLocalId.get(localId);
                return id ? (store.chats.get(id) ?? null) : null;
            },
            async listByUser() {
                return Array.from(store.chats.values());
            },
            async update({ id, chat }) {
                const existing = store.chats.get(id);
                if (!existing) return;
                store.chats.set(id, toConvexChat(chat, id));
            },
            async remove({ id }) {
                const existing = store.chats.get(id);
                if (existing?.localId) {
                    store.chatsByLocalId.delete(existing.localId);
                }
                store.chats.delete(id);
            },
        },
        messages: {
            async create({ message, chatId }) {
                const id = `message-${(messageCounter += 1)}`;
                const entry = toConvexMessage(message, id, chatId);
                store.messages.set(id, entry);
                store.messagesByLocalId.set(message.id, id);
                return id;
            },
            async getByLocalId({ localId }) {
                const id = store.messagesByLocalId.get(localId);
                return id ? (store.messages.get(id) ?? null) : null;
            },
            async listByChat({ chatId }) {
                return Array.from(store.messages.values()).filter(
                    (message) => message.chatId === chatId,
                );
            },
            async update({ id, message }) {
                const existing = store.messages.get(id);
                if (!existing) return;
                store.messages.set(
                    id,
                    toConvexMessage(message, id, existing.chatId),
                );
            },
            async remove({ id }) {
                const existing = store.messages.get(id);
                if (existing?.localId) {
                    store.messagesByLocalId.delete(existing.localId);
                }
                store.messages.delete(id);
            },
            async deleteByChat({ chatId }) {
                for (const [id, message] of store.messages.entries()) {
                    if (message.chatId === chatId) {
                        store.messages.delete(id);
                        if (message.localId) {
                            store.messagesByLocalId.delete(message.localId);
                        }
                    }
                }
            },
        },
        skills: {
            async create({ skill }) {
                const id = `skill-${(skillCounter += 1)}`;
                const entry = toConvexSkill(skill, id);
                store.skills.set(id, entry);
                store.skillsByLocalId.set(skill.id, id);
                return id;
            },
            async listByUser() {
                return Array.from(store.skills.values());
            },
            async getByLocalId({ localId }) {
                const id = store.skillsByLocalId.get(localId);
                return id ? (store.skills.get(id) ?? null) : null;
            },
            async update({ id, skill }) {
                const existing = store.skills.get(id);
                if (!existing) return;
                store.skills.set(id, toConvexSkill(skill, id));
            },
            async remove({ id }) {
                const existing = store.skills.get(id);
                if (existing?.localId) {
                    store.skillsByLocalId.delete(existing.localId);
                }
                store.skills.delete(id);
            },
        },
        attachments: {
            async generateUploadUrl() {
                return "https://upload.test";
            },
            async create({ attachment, messageId, storageId }) {
                const id = `attachment-${(attachmentCounter += 1)}`;
                const entry: ConvexAttachmentLike = {
                    _id: id,
                    localId: attachment.id,
                    messageId,
                    type: "image",
                    mimeType: attachment.mimeType,
                    storageId,
                    width: attachment.width,
                    height: attachment.height,
                    size: attachment.size,
                    createdAt: attachment.createdAt,
                    purgedAt: attachment.purgedAt,
                };
                store.attachments.set(id, entry);
                store.attachmentsByLocalId.set(attachment.id, id);
                return id;
            },
            async get({ id }) {
                return store.attachments.get(id) ?? null;
            },
            async getByLocalId({ localId }) {
                const id = store.attachmentsByLocalId.get(localId);
                return id ? (store.attachments.get(id) ?? null) : null;
            },
            async listByMessage({ messageId }) {
                return Array.from(store.attachments.values()).filter(
                    (attachment) => attachment.messageId === messageId,
                );
            },
            async getUrl({ storageId }) {
                calls.getUrl += 1;
                return `https://download.test/${storageId}`;
            },
            async remove({ id }) {
                const existing = store.attachments.get(id);
                if (existing?.localId) {
                    store.attachmentsByLocalId.delete(existing.localId);
                }
                store.attachments.delete(id);
            },
            async deleteByMessage({ messageId }) {
                for (const [id, attachment] of store.attachments.entries()) {
                    if (attachment.messageId === messageId) {
                        store.attachments.delete(id);
                        if (attachment.localId) {
                            store.attachmentsByLocalId.delete(
                                attachment.localId,
                            );
                        }
                    }
                }
            },
            async getTotalBytesByUser() {
                return Array.from(store.attachments.values()).reduce(
                    (sum, attachment) => sum + attachment.size,
                    0,
                );
            },
        },
        users: {
            async getStorageUsage() {
                return {
                    bytes: 0,
                    messageCount: 0,
                    sessionCount: 0,
                };
            },
        },
    };
};

class TestAdapter extends ConvexAdapterBase {
    private settings: SkillSettings = {
        defaultSkillId: null,
        selectedSkillId: null,
        selectedSkillMode: "auto",
    };

    async getSkillSettings(): Promise<SkillSettings> {
        return { ...this.settings };
    }

    async upsertSkillSettings(settings: SkillSettingsUpdate): Promise<void> {
        this.settings = { ...this.settings, ...settings };
    }
}

const createAdapter = () => {
    const store = createStore();
    const cached = new Map<string, string>();
    const calls: Calls = {
        getUrl: 0,
        download: 0,
        getUploadBody: 0,
        setCached: 0,
        deleteCached: 0,
    };

    const services = createServices(store, calls);
    const attachmentIO: AttachmentIO = {
        async getUploadBody() {
            calls.getUploadBody += 1;
            return new Blob(["data"]);
        },
        async downloadAttachmentData() {
            calls.download += 1;
            return "downloaded";
        },
        getCachedAttachmentData(id) {
            return cached.get(id) ?? null;
        },
        setCachedAttachmentData(id, data) {
            calls.setCached += 1;
            cached.set(id, data);
        },
        deleteCachedAttachmentData(id) {
            calls.deleteCached += 1;
            cached.delete(id);
        },
    };

    const client: ConvexClientLike = {
        mutation: async () => {
            throw new Error("unused");
        },
        query: async () => {
            throw new Error("unused");
        },
    };

    const adapter = new TestAdapter({
        client,
        userId: "user-1",
        services,
        attachmentIO,
    });

    return { adapter, store, cached, calls, services };
};

const seedChatAndMessage = async (adapter: ConvexAdapterBase) => {
    const chat: ChatSession = {
        id: "chat-1",
        title: "Chat",
        modelId: "model-1",
        thinking: "none",
        searchLevel: "none",
        createdAt: 1,
        updatedAt: 2,
    };

    const message: Message = {
        id: "message-1",
        sessionId: chat.id,
        role: "user",
        content: "hello",
        contextContent: "",
        createdAt: 3,
    };

    await adapter.createChat(chat);
    await adapter.createMessage(message);

    return { chat, message };
};

describe("ConvexAdapterBase", () => {
    beforeEach(() => {
        globalThis.fetch = originalFetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("uploads and caches attachments", async () => {
        const { adapter, store, cached, calls } = createAdapter();

        const { message } = await seedChatAndMessage(adapter);

        mockFetch(
            () =>
                new Response(JSON.stringify({ storageId: "storage-1" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const attachment: Attachment = {
            id: "attachment-1",
            messageId: message.id,
            type: "image",
            mimeType: "image/png",
            data: "data-1",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 4,
        };

        const id = await adapter.saveAttachment(attachment);
        expect(id).toBe("attachment-1");
        expect(calls.getUploadBody).toBe(1);
        expect(calls.setCached).toBe(1);
        expect(cached.get("attachment-1")).toBe("data-1");

        const stored = Array.from(store.attachments.values())[0];
        expect(stored?.storageId).toBe("storage-1");
    });

    it("uses cached data when fetching attachments", async () => {
        const { adapter, calls } = createAdapter();

        const { message } = await seedChatAndMessage(adapter);

        mockFetch(
            () =>
                new Response(JSON.stringify({ storageId: "storage-1" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const attachment: Attachment = {
            id: "attachment-1",
            messageId: message.id,
            type: "image",
            mimeType: "image/png",
            data: "data-1",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 4,
        };

        await adapter.saveAttachment(attachment);

        const fetched = await adapter.getAttachment("attachment-1");
        expect(fetched?.data).toBe("data-1");
        expect(calls.download).toBe(0);
        expect(calls.getUrl).toBe(0);
    });

    it("returns purged attachments without downloads", async () => {
        const { adapter, store, calls } = createAdapter();

        insertAttachment(store, {
            _id: "convex-att-1",
            localId: "attachment-1",
            messageId: "message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-1",
            width: 1,
            height: 1,
            size: 12,
            createdAt: 1,
            purgedAt: 2,
        });

        const fetched = await adapter.getAttachment("attachment-1");
        expect(fetched?.data).toBe("");
        expect(fetched?.purgedAt).toBe(2);
        expect(calls.download).toBe(0);
        expect(calls.getUrl).toBe(0);
    });

    it("throws when upload fails", async () => {
        const { adapter } = createAdapter();
        const { message } = await seedChatAndMessage(adapter);

        mockFetch(() => new Response("bad", { status: 500 }));

        const attachment: Attachment = {
            id: "attachment-1",
            messageId: message.id,
            type: "image",
            mimeType: "image/png",
            data: "data-1",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 4,
        };

        await expect(adapter.saveAttachment(attachment)).rejects.toThrow(
            "Attachment upload failed (500): bad",
        );
    });

    it("throws when upload JSON is invalid", async () => {
        const { adapter } = createAdapter();
        const { message } = await seedChatAndMessage(adapter);

        mockFetch(
            () =>
                new Response("not-json", {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const attachment: Attachment = {
            id: "attachment-1",
            messageId: message.id,
            type: "image",
            mimeType: "image/png",
            data: "data-1",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 4,
        };

        await expect(adapter.saveAttachment(attachment)).rejects.toThrow(
            "Attachment upload returned invalid JSON",
        );
    });

    it("throws when upload response lacks storageId", async () => {
        const { adapter } = createAdapter();
        const { message } = await seedChatAndMessage(adapter);

        mockFetch(
            () =>
                new Response("{}", {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const attachment: Attachment = {
            id: "attachment-1",
            messageId: message.id,
            type: "image",
            mimeType: "image/png",
            data: "data-1",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 4,
        };

        await expect(adapter.saveAttachment(attachment)).rejects.toThrow(
            "Attachment upload did not return a storageId",
        );
    });

    it("downloads and caches when no cached data", async () => {
        const { adapter, store, cached, calls } = createAdapter();
        const { message } = await seedChatAndMessage(adapter);
        const convexMessageId = store.messagesByLocalId.get(message.id);

        insertAttachment(store, {
            _id: "convex-att-1",
            localId: "attachment-1",
            messageId: convexMessageId ?? "convex-message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-1",
            width: 1,
            height: 1,
            size: 12,
            createdAt: 1,
        });

        const fetched = await adapter.getAttachment("attachment-1");
        expect(fetched?.data).toBe("downloaded");
        expect(fetched?.messageId).toBe(message.id);
        expect(calls.getUrl).toBe(1);
        expect(calls.download).toBe(1);
        expect(calls.setCached).toBe(1);
        expect(cached.get("attachment-1")).toBe("downloaded");
    });

    it("falls back to convex message id when not mapped", async () => {
        const { adapter, store } = createAdapter();

        insertAttachment(store, {
            _id: "convex-att-1",
            localId: "attachment-1",
            messageId: "convex-message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-1",
            width: 1,
            height: 1,
            size: 12,
            createdAt: 1,
            purgedAt: 2,
        });

        const fetched = await adapter.getAttachment("attachment-1");
        expect(fetched?.messageId).toBe("convex-message-1");
    });

    it("returns undefined when attachment url is unavailable", async () => {
        const { adapter, store, calls, services } = createAdapter();

        insertAttachment(store, {
            _id: "convex-att-1",
            localId: "attachment-1",
            messageId: "convex-message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-1",
            width: 1,
            height: 1,
            size: 12,
            createdAt: 1,
        });

        services.attachments.getUrl = async () => {
            calls.getUrl += 1;
            return null;
        };

        const fetched = await adapter.getAttachment("attachment-1");
        expect(fetched).toBeUndefined();
        expect(calls.getUrl).toBe(1);
        expect(calls.download).toBe(0);
    });

    it("supports chat CRUD via local-id lookups", async () => {
        const { adapter, store } = createAdapter();

        store.chats.set("convex-chat-1", {
            _id: "convex-chat-1",
            localId: "chat-local-1",
            title: "Original",
            modelId: "model-1",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        });
        store.chatsByLocalId.set("chat-local-1", "convex-chat-1");

        const fetched = await adapter.getChat("chat-local-1");
        expect(fetched?.id).toBe("chat-local-1");

        await adapter.updateChat({
            id: "chat-local-1",
            title: "Updated",
            modelId: "model-2",
            thinking: "low",
            searchLevel: "medium",
            createdAt: 1,
            updatedAt: 3,
        });

        expect(store.chats.get("convex-chat-1")?.title).toBe("Updated");
        expect(store.chats.get("convex-chat-1")?.modelId).toBe("model-2");

        await adapter.deleteChat("chat-local-1");
        expect(store.chats.get("convex-chat-1")).toBeUndefined();
    });

    it("throws when updating a missing chat", async () => {
        const { adapter } = createAdapter();

        await expect(
            adapter.updateChat({
                id: "missing-chat",
                title: "Missing",
                modelId: "model",
                thinking: "none",
                searchLevel: "none",
                createdAt: 1,
                updatedAt: 1,
            }),
        ).rejects.toThrow("Chat not found: missing-chat");
    });

    it("creates, updates, lists, and deletes messages", async () => {
        const { adapter, store } = createAdapter();
        const { chat } = await seedChatAndMessage(adapter);

        const created: Message = {
            id: "message-2",
            sessionId: chat.id,
            role: "assistant",
            content: "hi",
            contextContent: "hi",
            createdAt: 10,
        };

        await adapter.createMessage(created);
        await adapter.updateMessage({
            ...created,
            content: "updated",
            contextContent: "updated",
        });

        const listed = await adapter.getMessagesByChat(chat.id);
        expect(listed.length).toBeGreaterThanOrEqual(1);
        expect(listed.some((message) => message.content === "updated")).toBe(
            true,
        );

        await adapter.deleteMessage("message-2");
        expect(store.messagesByLocalId.has("message-2")).toBe(false);
    });

    it("returns empty messages when chat lookup fails", async () => {
        const { adapter } = createAdapter();
        const listed = await adapter.getMessagesByChat("missing-chat");
        expect(listed).toEqual([]);
    });

    it("throws when creating a message for a missing chat", async () => {
        const { adapter } = createAdapter();

        await expect(
            adapter.createMessage({
                id: "message-missing-chat",
                sessionId: "missing-chat",
                role: "user",
                content: "hello",
                contextContent: "hello",
                createdAt: 1,
            }),
        ).rejects.toThrow("Chat not found: missing-chat");
    });

    it("throws when updating a missing message", async () => {
        const { adapter } = createAdapter();

        await expect(
            adapter.updateMessage({
                id: "missing-message",
                sessionId: "chat-1",
                role: "assistant",
                content: "content",
                contextContent: "content",
                createdAt: 1,
            }),
        ).rejects.toThrow("Message not found: missing-message");
    });

    it("creates, updates, lists, and deletes skills", async () => {
        const { adapter } = createAdapter();
        const skill: Skill = {
            id: "skill-local-1",
            name: "Helper",
            description: "desc",
            prompt: "prompt",
            createdAt: 1,
        };

        await adapter.createSkill(skill);
        let listed = await adapter.getSkills();
        expect(listed).toHaveLength(1);

        await adapter.updateSkill({ ...skill, name: "Updated helper" });
        listed = await adapter.getSkills();
        expect(listed[0]?.name).toBe("Updated helper");

        await adapter.deleteSkill(skill.id);
        listed = await adapter.getSkills();
        expect(listed).toHaveLength(0);
    });

    it("throws when updating a missing skill", async () => {
        const { adapter } = createAdapter();
        await expect(
            adapter.updateSkill({
                id: "missing-skill",
                name: "Missing",
                description: "desc",
                prompt: "prompt",
                createdAt: 1,
            }),
        ).rejects.toThrow("Skill not found: missing-skill");
    });

    it("stores and retrieves skill settings", async () => {
        const { adapter } = createAdapter();
        expect(await adapter.getSkillSettings()).toEqual({
            defaultSkillId: null,
            selectedSkillId: null,
            selectedSkillMode: "auto",
        });

        await adapter.upsertSkillSettings({
            defaultSkillId: "skill-1",
            selectedSkillId: "skill-1",
            selectedSkillMode: "manual",
        });

        expect(await adapter.getSkillSettings()).toEqual({
            defaultSkillId: "skill-1",
            selectedSkillId: "skill-1",
            selectedSkillMode: "manual",
        });
    });

    it("throws when saving an attachment for a missing message", async () => {
        const { adapter } = createAdapter();

        await expect(
            adapter.saveAttachment({
                id: "attachment-missing-message",
                messageId: "missing-message",
                type: "image",
                mimeType: "image/png",
                data: "data",
                width: 1,
                height: 1,
                size: 10,
                createdAt: 1,
            }),
        ).rejects.toThrow("Message not found: missing-message");
    });

    it("filters out unresolved attachments when listing by message", async () => {
        const { adapter, store, services } = createAdapter();
        const { message } = await seedChatAndMessage(adapter);
        const convexMessageId = store.messagesByLocalId.get(message.id);

        insertAttachment(store, {
            _id: "convex-att-1",
            localId: "attachment-1",
            messageId: convexMessageId ?? "convex-message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-ok",
            width: 1,
            height: 1,
            size: 12,
            createdAt: 1,
        });
        insertAttachment(store, {
            _id: "convex-att-2",
            localId: "attachment-2",
            messageId: convexMessageId ?? "convex-message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-missing",
            width: 1,
            height: 1,
            size: 12,
            createdAt: 1,
        });

        services.attachments.getUrl = async ({ storageId }) => {
            if (storageId === "storage-missing") return null;
            return `https://download.test/${storageId}`;
        };

        const attachments = await adapter.getAttachmentsByMessage(message.id);
        expect(attachments).toHaveLength(1);
        expect(attachments[0]?.id).toBe("attachment-1");
    });

    it("returns empty attachments when message lookup fails", async () => {
        const { adapter } = createAdapter();
        const attachments =
            await adapter.getAttachmentsByMessage("missing-message");
        expect(attachments).toEqual([]);
    });

    it("deletes cached attachment data when removing attachment", async () => {
        const { adapter, calls, cached } = createAdapter();
        const { message } = await seedChatAndMessage(adapter);

        mockFetch(
            () =>
                new Response(JSON.stringify({ storageId: "storage-1" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        await adapter.saveAttachment({
            id: "attachment-delete-1",
            messageId: message.id,
            type: "image",
            mimeType: "image/png",
            data: "data-1",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 4,
        });

        expect(cached.get("attachment-delete-1")).toBe("data-1");

        await adapter.deleteAttachment("attachment-delete-1");

        expect(calls.deleteCached).toBe(1);
        expect(cached.get("attachment-delete-1")).toBeUndefined();
    });

    it("deletes all attachments for a message", async () => {
        const { adapter, store } = createAdapter();
        const { message } = await seedChatAndMessage(adapter);
        const convexMessageId = store.messagesByLocalId.get(message.id);

        insertAttachment(store, {
            _id: "convex-att-1",
            localId: "attachment-1",
            messageId: convexMessageId ?? "convex-message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-1",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 1,
        });
        insertAttachment(store, {
            _id: "convex-att-2",
            localId: "attachment-2",
            messageId: convexMessageId ?? "convex-message-1",
            type: "image",
            mimeType: "image/png",
            storageId: "storage-2",
            width: 1,
            height: 1,
            size: 10,
            createdAt: 1,
        });

        await adapter.deleteAttachmentsByMessage(message.id);

        expect(
            Array.from(store.attachments.values()).filter(
                (attachment) =>
                    attachment.messageId ===
                    (convexMessageId ?? "convex-message-1"),
            ),
        ).toHaveLength(0);
    });

    it("returns storage usage values from services", async () => {
        const { adapter, services } = createAdapter();
        services.users.getStorageUsage = async () => ({
            bytes: 42,
            messageCount: 7,
            sessionCount: 3,
        });

        expect(await adapter.getImageStorageUsage()).toBe(0);
        expect(await adapter.getStorageUsage()).toEqual({
            bytes: 42,
            messageCount: 7,
            sessionCount: 3,
        });
    });
});
