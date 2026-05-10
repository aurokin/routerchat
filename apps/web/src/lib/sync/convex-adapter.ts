/**
 * Convex Storage Adapter
 *
 * Single-file implementation of `StorageAdapter` backed by Convex. Owns the
 * id-mapping caches, the per-table service surface, and attachment IO.
 */

import type {
    StorageAdapter,
    SkillSettings,
    SkillSettingsUpdate,
} from "./storage-adapter";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type {
    FunctionReference,
    FunctionArgs,
    FunctionReturnType,
} from "convex/server";
import type { Attachment, ChatSession, Message, Skill } from "@/lib/types";
import * as storage from "@/lib/storage";
import {
    clearPersistentCloudAttachmentCache,
    deletePersistentCachedAttachmentData,
    getPersistentCachedAttachmentData,
    setPersistentCachedAttachmentData,
} from "@/lib/sync/cloud-attachment-cache";

// --- Public types ---------------------------------------------------------

/**
 * Minimal structural shape we need from a Convex client. Both
 * `ConvexReactClient` (browser) and `ConvexClient` (other surfaces) satisfy
 * this. Exported so other modules and tests don't have to depend on the
 * concrete React client class.
 */
export interface ConvexClient {
    mutation<Mutation extends FunctionReference<"mutation">>(
        fn: Mutation,
        args: FunctionArgs<Mutation>,
    ): Promise<FunctionReturnType<Mutation>>;
    query<Query extends FunctionReference<"query">>(
        fn: Query,
        args: FunctionArgs<Query>,
    ): Promise<FunctionReturnType<Query>>;
    action<Action extends FunctionReference<"action">>(
        fn: Action,
        args: FunctionArgs<Action>,
    ): Promise<FunctionReturnType<Action>>;
}

// --- Internal service surface --------------------------------------------

interface AdapterServices {
    chats: {
        create(args: {
            userId: Id<"users">;
            chat: ChatSession;
        }): Promise<Id<"chats">>;
        get(args: { id: Id<"chats"> }): Promise<Doc<"chats"> | null>;
        getByLocalId(args: {
            userId: Id<"users">;
            localId: string;
        }): Promise<Doc<"chats"> | null>;
        listByUser(args: { userId: Id<"users"> }): Promise<Doc<"chats">[]>;
        update(args: { id: Id<"chats">; chat: ChatSession }): Promise<void>;
        remove(args: { id: Id<"chats"> }): Promise<void>;
    };
    messages: {
        create(args: {
            userId: Id<"users">;
            chatId: Id<"chats">;
            message: Message;
        }): Promise<Id<"messages">>;
        getByLocalId(args: {
            userId: Id<"users">;
            localId: string;
        }): Promise<Doc<"messages"> | null>;
        listByChat(args: { chatId: Id<"chats"> }): Promise<Doc<"messages">[]>;
        update(args: { id: Id<"messages">; message: Message }): Promise<void>;
        remove(args: { id: Id<"messages"> }): Promise<void>;
        deleteByChat(args: { chatId: Id<"chats"> }): Promise<void>;
    };
    skills: {
        create(args: {
            userId: Id<"users">;
            skill: Skill;
        }): Promise<Id<"skills">>;
        listByUser(args: { userId: Id<"users"> }): Promise<Doc<"skills">[]>;
        getByLocalId(args: {
            userId: Id<"users">;
            localId: string;
        }): Promise<Doc<"skills"> | null>;
        update(args: { id: Id<"skills">; skill: Skill }): Promise<void>;
        remove(args: { id: Id<"skills"> }): Promise<void>;
    };
    attachments: {
        generateUploadUrl(): Promise<string>;
        create(args: {
            userId: Id<"users">;
            messageId: Id<"messages">;
            attachment: Attachment;
            storageId: Id<"_storage">;
        }): Promise<Id<"attachments">>;
        get(args: {
            id: Id<"attachments">;
        }): Promise<Doc<"attachments"> | null>;
        getByLocalId(args: {
            userId: Id<"users">;
            localId: string;
        }): Promise<Doc<"attachments"> | null>;
        listByMessage(args: {
            messageId: Id<"messages">;
        }): Promise<Doc<"attachments">[]>;
        getUrl(args: { storageId: string }): Promise<string | null>;
        remove(args: { id: Id<"attachments"> }): Promise<void>;
        deleteByMessage(args: { messageId: Id<"messages"> }): Promise<void>;
        getTotalBytesByUser(args: { userId: Id<"users"> }): Promise<number>;
    };
    users: {
        getStorageUsage(args: { userId: Id<"users"> }): Promise<{
            bytes: number;
            messageCount: number;
            sessionCount: number;
        }>;
    };
}

interface AttachmentIO {
    getUploadBody(attachment: Attachment): Promise<Blob>;
    downloadAttachmentData(
        url: string,
        attachment: Doc<"attachments">,
    ): Promise<string | null>;
    getCachedAttachmentData(attachmentId: string): string | null;
    setCachedAttachmentData(
        attachmentId: string,
        data: string,
    ): void | Promise<void>;
    deleteCachedAttachmentData(
        attachmentId: string,
        data?: string | null,
    ): void | Promise<void>;
}

// --- Internal helpers ----------------------------------------------------

const CHAT_PAGE_SIZE = 250;
const MESSAGE_PAGE_SIZE = 200;
const SKILL_PAGE_SIZE = 250;

function base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(",")[1];
            resolve(base64 ?? "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

type AttachmentCacheEntry = {
    data: string;
    bytes: number;
};

const MAX_ATTACHMENT_CACHE_BYTES = 50 * 1024 * 1024; // ~50MB
const MAX_ATTACHMENT_CACHE_ITEMS = 100;
const attachmentDataCache = new Map<string, AttachmentCacheEntry>();
let attachmentCacheBytes = 0;

function estimateBase64Bytes(base64: string): number {
    return Math.ceil((base64.length * 3) / 4);
}

function normalizeBase64Data(input: string): string {
    if (input.startsWith("data:")) {
        return input.split(",")[1] ?? "";
    }
    return input;
}

function getMemoryCachedAttachmentData(attachmentId: string): string | null {
    const cached = attachmentDataCache.get(attachmentId);
    if (!cached) return null;

    // Mark as recently used (LRU).
    attachmentDataCache.delete(attachmentId);
    attachmentDataCache.set(attachmentId, cached);
    return cached.data;
}

function setMemoryCachedAttachmentData(
    attachmentId: string,
    data: string,
): void {
    const normalized = normalizeBase64Data(data);
    const bytes = estimateBase64Bytes(normalized);

    const existing = attachmentDataCache.get(attachmentId);
    if (existing) {
        attachmentCacheBytes -= existing.bytes;
        attachmentDataCache.delete(attachmentId);
    }

    attachmentDataCache.set(attachmentId, { data: normalized, bytes });
    attachmentCacheBytes += bytes;

    while (
        attachmentCacheBytes > MAX_ATTACHMENT_CACHE_BYTES ||
        attachmentDataCache.size > MAX_ATTACHMENT_CACHE_ITEMS
    ) {
        const oldestKey = attachmentDataCache.keys().next().value as
            | string
            | undefined;
        if (!oldestKey) break;
        const oldest = attachmentDataCache.get(oldestKey);
        attachmentDataCache.delete(oldestKey);
        attachmentCacheBytes -= oldest?.bytes ?? 0;
    }
}

function deleteMemoryCachedAttachmentData(attachmentId: string): void {
    const existing = attachmentDataCache.get(attachmentId);
    if (!existing) return;
    attachmentDataCache.delete(attachmentId);
    attachmentCacheBytes -= existing.bytes;
}

export function clearCloudAttachmentMemoryCache(): void {
    attachmentDataCache.clear();
    attachmentCacheBytes = 0;
}

export async function clearCloudAttachmentCaches(): Promise<void> {
    clearCloudAttachmentMemoryCache();
    await clearPersistentCloudAttachmentCache();
}

async function collectAllPages<T>(
    fetchPage: (cursor: string | null) => Promise<{
        page: T[];
        isDone: boolean;
        continueCursor: string;
    }>,
): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | null = null;

    // Prevent accidental infinite loops if something goes wrong with cursors.
    for (let i = 0; i < 10_000; i++) {
        const page = await fetchPage(cursor);
        results.push(...(page.page ?? []));

        if (page.isDone) return results;

        if (page.continueCursor === cursor) {
            throw new Error("Pagination cursor did not advance");
        }
        cursor = page.continueCursor;
    }

    throw new Error("Pagination exceeded maximum number of pages");
}

function createServices(client: ConvexClient): AdapterServices {
    return {
        chats: {
            create: async ({ userId, chat }) =>
                await client.mutation(api.chats.create, {
                    userId,
                    localId: chat.id,
                    title: chat.title,
                    modelId: chat.modelId,
                    thinking: chat.thinking,
                    searchLevel: chat.searchLevel,
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt,
                }),
            get: async ({ id }) => await client.query(api.chats.get, { id }),
            getByLocalId: async ({ userId, localId }) =>
                await client.query(api.chats.getByLocalId, { userId, localId }),
            listByUser: async ({ userId }) =>
                await collectAllPages(async (cursor) => {
                    const result = await client.query(
                        api.chats.listByUserPaginated,
                        {
                            userId,
                            paginationOpts: {
                                numItems: CHAT_PAGE_SIZE,
                                cursor,
                            },
                        },
                    );
                    return {
                        page: result.page,
                        isDone: result.isDone,
                        continueCursor: result.continueCursor,
                    };
                }),
            update: async ({ id, chat }) => {
                await client.mutation(api.chats.update, {
                    id,
                    title: chat.title,
                    modelId: chat.modelId,
                    thinking: chat.thinking,
                    searchLevel: chat.searchLevel,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(api.chats.remove, { id });
            },
        },
        messages: {
            create: async ({ userId, chatId, message }) =>
                await client.mutation(api.messages.create, {
                    userId,
                    chatId,
                    localId: message.id,
                    role: message.role,
                    content: message.content,
                    contextContent: message.contextContent,
                    thinking: message.thinking,
                    skill: message.skill,
                    modelId: message.modelId,
                    thinkingLevel: message.thinkingLevel,
                    searchLevel: message.searchLevel,
                    attachmentIds: message.attachmentIds,
                    usage: message.usage,
                    reasoningDetails: message.reasoningDetails,
                    createdAt: message.createdAt,
                }),
            getByLocalId: async ({ userId, localId }) =>
                await client.query(api.messages.getByLocalId, {
                    userId,
                    localId,
                }),
            listByChat: async ({ chatId }) =>
                await collectAllPages(async (cursor) => {
                    const result = await client.query(
                        api.messages.listByChatPaginated,
                        {
                            chatId,
                            paginationOpts: {
                                numItems: MESSAGE_PAGE_SIZE,
                                cursor,
                            },
                        },
                    );
                    return {
                        page: result.page,
                        isDone: result.isDone,
                        continueCursor: result.continueCursor,
                    };
                }),
            update: async ({ id, message }) => {
                await client.mutation(api.messages.update, {
                    id,
                    content: message.content,
                    contextContent: message.contextContent,
                    thinking: message.thinking,
                    attachmentIds: message.attachmentIds,
                    usage: message.usage,
                    reasoningDetails: message.reasoningDetails,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(api.messages.remove, { id });
            },
            deleteByChat: async ({ chatId }) => {
                await client.mutation(api.messages.deleteByChat, { chatId });
            },
        },
        skills: {
            create: async ({ userId, skill }) =>
                await client.mutation(api.skills.create, {
                    userId,
                    localId: skill.id,
                    name: skill.name,
                    description: skill.description,
                    prompt: skill.prompt,
                    createdAt: skill.createdAt,
                }),
            listByUser: async ({ userId }) =>
                await collectAllPages(async (cursor) => {
                    const result = await client.query(
                        api.skills.listByUserPaginated,
                        {
                            userId,
                            paginationOpts: {
                                numItems: SKILL_PAGE_SIZE,
                                cursor,
                            },
                        },
                    );
                    return {
                        page: result.page,
                        isDone: result.isDone,
                        continueCursor: result.continueCursor,
                    };
                }),
            getByLocalId: async ({ userId, localId }) =>
                await client.query(api.skills.getByLocalId, {
                    userId,
                    localId,
                }),
            update: async ({ id, skill }) => {
                await client.mutation(api.skills.update, {
                    id,
                    name: skill.name,
                    description: skill.description,
                    prompt: skill.prompt,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(api.skills.remove, { id });
            },
        },
        attachments: {
            generateUploadUrl: async () =>
                await client.mutation(api.attachments.generateUploadUrl, {}),
            create: async ({ userId, messageId, attachment, storageId }) =>
                await client.mutation(api.attachments.create, {
                    userId,
                    messageId,
                    localId: attachment.id,
                    type: "image",
                    mimeType: attachment.mimeType,
                    storageId,
                    width: attachment.width,
                    height: attachment.height,
                    size: attachment.size,
                    createdAt: attachment.createdAt,
                }),
            get: async ({ id }) =>
                await client.query(api.attachments.get, { id }),
            getByLocalId: async ({ userId, localId }) =>
                await client.query(api.attachments.getByLocalId, {
                    userId,
                    localId,
                }),
            listByMessage: async ({ messageId }) =>
                await client.query(api.attachments.listByMessage, {
                    messageId,
                }),
            getUrl: async ({ storageId }) =>
                await client.query(api.attachments.getUrl, {
                    storageId: storageId as Id<"_storage">,
                }),
            remove: async ({ id }) => {
                await client.mutation(api.attachments.remove, { id });
            },
            deleteByMessage: async ({ messageId }) => {
                await client.mutation(api.attachments.deleteByMessage, {
                    messageId,
                });
            },
            getTotalBytesByUser: async ({ userId }) =>
                await client.query(api.attachments.getTotalBytesByUser, {
                    userId,
                }),
        },
        users: {
            getStorageUsage: async ({ userId }) =>
                await client.query(api.users.getStorageUsage, { userId }),
        },
    };
}

const webAttachmentIO: AttachmentIO = {
    async getUploadBody(attachment) {
        const base64 = attachment.data.startsWith("data:")
            ? (attachment.data.split(",")[1] ?? "")
            : attachment.data;
        return base64ToBlob(base64, attachment.mimeType);
    },
    async downloadAttachmentData(url, attachment) {
        // Second-level cache: IndexedDB-backed persistent cache (survives reloads).
        // `getCachedAttachmentData` is synchronous (in-memory), so this check
        // must live here rather than in the in-memory accessor.
        const attachmentId = attachment.localId ?? attachment._id;
        if (typeof attachmentId === "string" && attachmentId) {
            const persisted =
                await getPersistentCachedAttachmentData(attachmentId);
            if (persisted) {
                return persisted;
            }
        }

        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const blob = await response.blob();
            return await blobToBase64(blob);
        } catch {
            return null;
        }
    },
    getCachedAttachmentData(attachmentId) {
        return getMemoryCachedAttachmentData(attachmentId);
    },
    async setCachedAttachmentData(attachmentId, data) {
        setMemoryCachedAttachmentData(attachmentId, data);
        await setPersistentCachedAttachmentData(attachmentId, data);
    },
    async deleteCachedAttachmentData(attachmentId) {
        deleteMemoryCachedAttachmentData(attachmentId);
        await deletePersistentCachedAttachmentData(attachmentId);
    },
};

// --- The adapter --------------------------------------------------------

export class ConvexStorageAdapter implements StorageAdapter {
    private readonly userId: Id<"users">;
    private readonly services: AdapterServices;
    private readonly attachmentIO: AttachmentIO;

    private chatIdMap = new Map<string, Id<"chats">>();
    private messageIdMap = new Map<string, Id<"messages">>();
    private messageConvexToLocal = new Map<Id<"messages">, string>();
    private attachmentIdMap = new Map<string, Id<"attachments">>();
    private skillIdMap = new Map<string, Id<"skills">>();

    constructor(
        client: ConvexClient,
        userId: Id<"users">,
        // Test seam: callers can inject custom services / IO. Production paths
        // pass only `client` + `userId`; tests pass mocks for full isolation.
        overrides?: {
            services?: AdapterServices;
            attachmentIO?: AttachmentIO;
        },
    ) {
        this.userId = userId;
        this.services = overrides?.services ?? createServices(client);
        this.attachmentIO = overrides?.attachmentIO ?? webAttachmentIO;
    }

    async createChat(chat: ChatSession): Promise<string> {
        const convexId = await this.services.chats.create({
            userId: this.userId,
            chat,
        });
        this.chatIdMap.set(chat.id, convexId);
        return chat.id;
    }

    async getChat(id: string): Promise<ChatSession | undefined> {
        let convexId = this.chatIdMap.get(id);

        if (!convexId) {
            const chat = await this.services.chats.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!chat) return undefined;
            convexId = chat._id;
            this.chatIdMap.set(id, convexId);
        }

        const chat = await this.services.chats.get({ id: convexId });
        if (!chat) return undefined;

        return this.convexChatToLocal(chat);
    }

    async getAllChats(): Promise<ChatSession[]> {
        const chats = await this.services.chats.listByUser({
            userId: this.userId,
        });

        return chats.map((chat) => {
            this.chatIdMap.set(chat.localId ?? chat._id, chat._id);
            return this.convexChatToLocal(chat);
        });
    }

    async updateChat(chat: ChatSession): Promise<void> {
        let convexId = this.chatIdMap.get(chat.id);

        if (!convexId) {
            const existing = await this.services.chats.getByLocalId({
                userId: this.userId,
                localId: chat.id,
            });
            if (!existing) {
                throw new Error(`Chat not found: ${chat.id}`);
            }
            convexId = existing._id;
            this.chatIdMap.set(chat.id, convexId);
        }

        await this.services.chats.update({ id: convexId, chat });
    }

    async deleteChat(id: string): Promise<void> {
        let convexId = this.chatIdMap.get(id);

        if (!convexId) {
            const existing = await this.services.chats.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!existing) return;
            convexId = existing._id;
        }

        await this.services.chats.remove({ id: convexId });
        this.chatIdMap.delete(id);
    }

    async createMessage(message: Message): Promise<string> {
        const chatConvexId = await this.getOrLookupChatId(message.sessionId);
        if (!chatConvexId) {
            throw new Error(`Chat not found: ${message.sessionId}`);
        }

        const convexId = await this.services.messages.create({
            userId: this.userId,
            chatId: chatConvexId,
            message,
        });

        this.messageIdMap.set(message.id, convexId);
        this.messageConvexToLocal.set(convexId, message.id);
        return message.id;
    }

    async updateMessage(message: Message): Promise<void> {
        let convexId = this.messageIdMap.get(message.id);

        if (!convexId) {
            const existing = await this.services.messages.getByLocalId({
                userId: this.userId,
                localId: message.id,
            });
            if (!existing) {
                throw new Error(`Message not found: ${message.id}`);
            }
            convexId = existing._id;
            this.messageIdMap.set(message.id, convexId);
            this.messageConvexToLocal.set(convexId, message.id);
        }

        await this.services.messages.update({ id: convexId, message });
    }

    async getMessagesByChat(chatId: string): Promise<Message[]> {
        const chatConvexId = await this.getOrLookupChatId(chatId);
        if (!chatConvexId) return [];

        const messages = await this.services.messages.listByChat({
            chatId: chatConvexId,
        });

        return messages.map((msg) => this.convexMessageToLocal(msg, chatId));
    }

    async deleteMessagesByChat(chatId: string): Promise<void> {
        const chatConvexId = await this.getOrLookupChatId(chatId);
        if (!chatConvexId) return;

        await this.services.messages.deleteByChat({ chatId: chatConvexId });
    }

    async deleteMessage(id: string): Promise<void> {
        let convexId = this.messageIdMap.get(id);

        if (!convexId) {
            const existing = await this.services.messages.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!existing) return;
            convexId = existing._id;
        }

        await this.services.messages.remove({ id: convexId });
        this.messageIdMap.delete(id);
        this.messageConvexToLocal.delete(convexId);
    }

    async saveAttachment(attachment: Attachment): Promise<string> {
        const messageConvexId = await this.getOrLookupMessageId(
            attachment.messageId,
        );
        if (!messageConvexId) {
            throw new Error(`Message not found: ${attachment.messageId}`);
        }

        const uploadUrl = await this.services.attachments.generateUploadUrl();
        const blob = await this.attachmentIO.getUploadBody(attachment);

        const uploadResponse = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": attachment.mimeType },
            body: blob,
        });

        if (!uploadResponse.ok) {
            const errorText = await uploadResponse.text();
            throw new Error(
                `Attachment upload failed (${uploadResponse.status}): ${errorText}`,
            );
        }

        let uploadResult: { storageId?: string };
        try {
            uploadResult = (await uploadResponse.json()) as {
                storageId?: string;
            };
        } catch {
            throw new Error("Attachment upload returned invalid JSON");
        }

        if (!uploadResult.storageId) {
            throw new Error("Attachment upload did not return a storageId");
        }

        const convexId = await this.services.attachments.create({
            userId: this.userId,
            messageId: messageConvexId,
            attachment,
            // The upload endpoint returns the real Convex storage id as a
            // plain string — Convex's branded `Id<"_storage">` type isn't
            // exposed at the wire boundary, so we coerce here.
            storageId: uploadResult.storageId as Id<"_storage">,
        });

        this.attachmentIdMap.set(attachment.id, convexId);
        await this.attachmentIO.setCachedAttachmentData(
            attachment.id,
            attachment.data,
        );
        return attachment.id;
    }

    async saveAttachments(attachments: Attachment[]): Promise<string[]> {
        const ids: string[] = [];
        for (const attachment of attachments) {
            const id = await this.saveAttachment(attachment);
            ids.push(id);
        }
        return ids;
    }

    async getAttachment(id: string): Promise<Attachment | undefined> {
        let convexId = this.attachmentIdMap.get(id);

        if (!convexId) {
            const existing = await this.services.attachments.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!existing) return undefined;
            convexId = existing._id;
            this.attachmentIdMap.set(id, convexId);
        }

        const attachment = await this.services.attachments.get({
            id: convexId,
        });
        if (!attachment) return undefined;

        const localMessageId = this.messageConvexToLocal.get(
            attachment.messageId,
        );
        const result = await this.convexAttachmentToLocal(
            attachment,
            localMessageId ?? null,
        );

        return result ?? undefined;
    }

    async getAttachmentsByMessage(messageId: string): Promise<Attachment[]> {
        const messageConvexId = await this.getOrLookupMessageId(messageId);
        if (!messageConvexId) return [];

        const attachments = await this.services.attachments.listByMessage({
            messageId: messageConvexId,
        });

        const results: Attachment[] = [];
        for (const att of attachments) {
            const local = await this.convexAttachmentToLocal(att, messageId);
            if (local) results.push(local);
        }
        return results;
    }

    async deleteAttachment(id: string): Promise<void> {
        let convexId = this.attachmentIdMap.get(id);

        if (!convexId) {
            const existing = await this.services.attachments.getByLocalId({
                userId: this.userId,
                localId: id,
            });
            if (!existing) return;
            convexId = existing._id;
        }

        await this.services.attachments.remove({ id: convexId });
        const cachedData = this.attachmentIO.getCachedAttachmentData(id);
        await this.attachmentIO.deleteCachedAttachmentData(id, cachedData);
        this.attachmentIdMap.delete(id);
    }

    async deleteAttachmentsByMessage(messageId: string): Promise<void> {
        const messageConvexId = await this.getOrLookupMessageId(messageId);
        if (!messageConvexId) return;

        await this.services.attachments.deleteByMessage({
            messageId: messageConvexId,
        });
    }

    async getImageStorageUsage(): Promise<number> {
        return await this.services.attachments.getTotalBytesByUser({
            userId: this.userId,
        });
    }

    async getStorageUsage(): Promise<{
        bytes: number;
        messageCount: number;
        sessionCount: number;
    }> {
        return await this.services.users.getStorageUsage({
            userId: this.userId,
        });
    }

    async getSkills(): Promise<Skill[]> {
        const skills = await this.services.skills.listByUser({
            userId: this.userId,
        });

        skills.forEach((skill) => {
            this.skillIdMap.set(skill.localId ?? skill._id, skill._id);
        });

        return skills.map((skill) => this.convexSkillToLocal(skill));
    }

    async createSkill(skill: Skill): Promise<string> {
        const convexId = await this.services.skills.create({
            userId: this.userId,
            skill,
        });

        this.skillIdMap.set(skill.id, convexId);
        return skill.id;
    }

    async updateSkill(skill: Skill): Promise<void> {
        const convexId = await this.getOrLookupSkillId(skill.id);
        if (!convexId) {
            throw new Error(`Skill not found: ${skill.id}`);
        }

        await this.services.skills.update({ id: convexId, skill });
    }

    async deleteSkill(id: string): Promise<void> {
        const convexId = await this.getOrLookupSkillId(id);
        if (!convexId) return;

        await this.services.skills.remove({ id: convexId });
        this.skillIdMap.delete(id);
    }

    async getSkillSettings(): Promise<SkillSettings> {
        return {
            defaultSkillId: storage.getCloudDefaultSkillId(),
            selectedSkillId: storage.getCloudSelectedSkillId(),
            selectedSkillMode: storage.getCloudSelectedSkillMode(),
        };
    }

    async upsertSkillSettings(settings: SkillSettingsUpdate): Promise<void> {
        if ("defaultSkillId" in settings) {
            storage.setCloudDefaultSkillId(settings.defaultSkillId ?? null);
        }
        if ("selectedSkillId" in settings) {
            storage.setCloudSelectedSkillId(settings.selectedSkillId ?? null);
        }
        if (settings.selectedSkillMode) {
            storage.setCloudSelectedSkillMode(settings.selectedSkillMode);
        }
    }

    private async getOrLookupSkillId(
        localId: string,
    ): Promise<Id<"skills"> | null> {
        const cached = this.skillIdMap.get(localId);
        if (cached) return cached;

        const skill = await this.services.skills.getByLocalId({
            userId: this.userId,
            localId,
        });

        if (skill) {
            this.skillIdMap.set(localId, skill._id);
            return skill._id;
        }

        return null;
    }

    private async getOrLookupChatId(
        localId: string,
    ): Promise<Id<"chats"> | null> {
        const cached = this.chatIdMap.get(localId);
        if (cached) return cached;

        const chat = await this.services.chats.getByLocalId({
            userId: this.userId,
            localId,
        });

        if (chat) {
            this.chatIdMap.set(localId, chat._id);
            return chat._id;
        }

        return null;
    }

    private async getOrLookupMessageId(
        localId: string,
    ): Promise<Id<"messages"> | null> {
        const cached = this.messageIdMap.get(localId);
        if (cached) return cached;

        const message = await this.services.messages.getByLocalId({
            userId: this.userId,
            localId,
        });

        if (message) {
            this.messageIdMap.set(localId, message._id);
            this.messageConvexToLocal.set(message._id, localId);
            return message._id;
        }

        return null;
    }

    private convexChatToLocal(chat: Doc<"chats">): ChatSession {
        return {
            id: chat.localId ?? chat._id,
            title: chat.title,
            modelId: chat.modelId,
            thinking: chat.thinking as ChatSession["thinking"],
            searchLevel: chat.searchLevel as ChatSession["searchLevel"],
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        };
    }

    private convexMessageToLocal(
        msg: Doc<"messages">,
        chatLocalId: string,
    ): Message {
        const localId = msg.localId ?? msg._id;
        this.messageIdMap.set(localId, msg._id);
        this.messageConvexToLocal.set(msg._id, localId);

        return {
            id: localId,
            sessionId: chatLocalId,
            role: msg.role as Message["role"],
            content: msg.content,
            contextContent: msg.contextContent,
            thinking: msg.thinking,
            skill: msg.skill ?? undefined,
            modelId: msg.modelId,
            thinkingLevel: msg.thinkingLevel as Message["thinkingLevel"],
            searchLevel: msg.searchLevel as Message["searchLevel"],
            attachmentIds: msg.attachmentIds,
            usage: msg.usage,
            reasoningDetails: msg.reasoningDetails,
            createdAt: msg.createdAt,
        };
    }

    private convexSkillToLocal(skill: Doc<"skills">): Skill {
        return {
            id: skill.localId ?? skill._id,
            name: skill.name,
            description: skill.description,
            prompt: skill.prompt,
            createdAt: skill.createdAt,
        };
    }

    private async convexAttachmentToLocal(
        att: Doc<"attachments">,
        localMessageId: string | null,
    ): Promise<Attachment | null> {
        const localId = att.localId ?? att._id;
        const resolvedMessageId =
            localMessageId ??
            this.messageConvexToLocal.get(att.messageId) ??
            att.messageId;

        if (att.purgedAt) {
            return {
                id: localId,
                messageId: resolvedMessageId,
                type: "image",
                mimeType: att.mimeType as Attachment["mimeType"],
                data: "",
                width: att.width,
                height: att.height,
                size: att.size,
                createdAt: att.createdAt,
                purgedAt: att.purgedAt,
            };
        }

        const cached = this.attachmentIO.getCachedAttachmentData(localId);
        if (cached) {
            return {
                id: localId,
                messageId: resolvedMessageId,
                type: "image",
                mimeType: att.mimeType as Attachment["mimeType"],
                data: cached,
                width: att.width,
                height: att.height,
                size: att.size,
                createdAt: att.createdAt,
            };
        }

        const url = await this.services.attachments.getUrl({
            storageId: att.storageId,
        });

        if (!url) return null;

        const data = await this.attachmentIO.downloadAttachmentData(url, att);
        if (!data) return null;

        await this.attachmentIO.setCachedAttachmentData(localId, data);

        return {
            id: localId,
            messageId: resolvedMessageId,
            type: "image",
            mimeType: att.mimeType as Attachment["mimeType"],
            data,
            width: att.width,
            height: att.height,
            size: att.size,
            createdAt: att.createdAt,
        };
    }
}

// Re-export the test-seam types so tests can construct mocks without
// re-deriving the shapes.
export type { AdapterServices, AttachmentIO };
