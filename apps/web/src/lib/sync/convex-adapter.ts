/**
 * Convex Storage Adapter
 *
 * Implements the StorageAdapter interface using Convex as the backend.
 * This adapter is only used when cloud sync is enabled.
 */

import type {
    StorageAdapter,
    SkillSettings,
    SkillSettingsUpdate,
} from "./storage-adapter";
import { api } from "@convex/_generated/api";
import * as storage from "@/lib/storage";
import type {
    ConvexId,
    ConvexClientInterface,
    ConvexAPI,
} from "./convex-types";
import {
    ConvexAdapterBase,
    type AttachmentIO,
    type ConvexAdapterServices,
} from "@shared/core/sync/convex-adapter-base";
import {
    clearPersistentCloudAttachmentCache,
    deletePersistentCachedAttachmentData,
    getPersistentCachedAttachmentData,
    setPersistentCachedAttachmentData,
} from "@/lib/sync/cloud-attachment-cache";

const convexApi = api as unknown as ConvexAPI;

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

const CHAT_PAGE_SIZE = 250;
const MESSAGE_PAGE_SIZE = 200;
const SKILL_PAGE_SIZE = 250;

type AttachmentCacheEntry = {
    data: string;
    bytes: number;
};

// In-memory cache for attachment base64 payloads to avoid repeated downloads.
// This is intentionally bounded to keep memory usage predictable.
const MAX_ATTACHMENT_CACHE_BYTES = 50 * 1024 * 1024; // ~50MB
const MAX_ATTACHMENT_CACHE_ITEMS = 100;
const attachmentDataCache = new Map<string, AttachmentCacheEntry>();
let attachmentCacheBytes = 0;

function estimateBase64Bytes(base64: string): number {
    // Roughly: bytes = base64_length * 3/4 (ignoring padding)
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

function createServices(client: ConvexClientInterface): ConvexAdapterServices {
    return {
        chats: {
            create: async ({ userId, chat }) =>
                (await client.mutation(convexApi.chats.create, {
                    userId: userId as ConvexId<"users">,
                    localId: chat.id,
                    title: chat.title,
                    modelId: chat.modelId,
                    thinking: chat.thinking,
                    searchLevel: chat.searchLevel,
                    createdAt: chat.createdAt,
                    updatedAt: chat.updatedAt,
                })) as string,
            get: async ({ id }) =>
                (await client.query(convexApi.chats.get, {
                    id: id as ConvexId<"chats">,
                })) as any,
            getByLocalId: async ({ userId, localId }) =>
                (await client.query(convexApi.chats.getByLocalId, {
                    userId: userId as ConvexId<"users">,
                    localId,
                })) as any,
            listByUser: async ({ userId }) =>
                await collectAllPages(async (cursor) => {
                    return (await client.query(
                        convexApi.chats.listByUserPaginated,
                        {
                            userId: userId as ConvexId<"users">,
                            paginationOpts: {
                                numItems: CHAT_PAGE_SIZE,
                                cursor,
                            },
                        },
                    )) as any;
                }),
            update: async ({ id, chat }) => {
                await client.mutation(convexApi.chats.update, {
                    id: id as ConvexId<"chats">,
                    title: chat.title,
                    modelId: chat.modelId,
                    thinking: chat.thinking,
                    searchLevel: chat.searchLevel,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(convexApi.chats.remove, {
                    id: id as ConvexId<"chats">,
                });
            },
        },
        messages: {
            create: async ({ userId, chatId, message }) =>
                (await client.mutation(convexApi.messages.create, {
                    userId: userId as ConvexId<"users">,
                    chatId: chatId as ConvexId<"chats">,
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
                    createdAt: message.createdAt,
                })) as string,
            getByLocalId: async ({ userId, localId }) =>
                (await client.query(convexApi.messages.getByLocalId, {
                    userId: userId as ConvexId<"users">,
                    localId,
                })) as any,
            listByChat: async ({ chatId }) =>
                await collectAllPages(async (cursor) => {
                    return (await client.query(
                        convexApi.messages.listByChatPaginated,
                        {
                            chatId: chatId as ConvexId<"chats">,
                            paginationOpts: {
                                numItems: MESSAGE_PAGE_SIZE,
                                cursor,
                            },
                        },
                    )) as any;
                }),
            update: async ({ id, message }) => {
                await client.mutation(convexApi.messages.update, {
                    id: id as ConvexId<"messages">,
                    content: message.content,
                    contextContent: message.contextContent,
                    thinking: message.thinking,
                    attachmentIds: message.attachmentIds,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(convexApi.messages.remove, {
                    id: id as ConvexId<"messages">,
                });
            },
            deleteByChat: async ({ chatId }) => {
                await client.mutation(convexApi.messages.deleteByChat, {
                    chatId: chatId as ConvexId<"chats">,
                });
            },
        },
        skills: {
            create: async ({ userId, skill }) =>
                (await client.mutation(convexApi.skills.create, {
                    userId: userId as ConvexId<"users">,
                    localId: skill.id,
                    name: skill.name,
                    description: skill.description,
                    prompt: skill.prompt,
                    createdAt: skill.createdAt,
                })) as string,
            listByUser: async ({ userId }) =>
                await collectAllPages(async (cursor) => {
                    return (await client.query(
                        convexApi.skills.listByUserPaginated,
                        {
                            userId: userId as ConvexId<"users">,
                            paginationOpts: {
                                numItems: SKILL_PAGE_SIZE,
                                cursor,
                            },
                        },
                    )) as any;
                }),
            getByLocalId: async ({ userId, localId }) =>
                (await client.query(convexApi.skills.getByLocalId, {
                    userId: userId as ConvexId<"users">,
                    localId,
                })) as any,
            update: async ({ id, skill }) => {
                await client.mutation(convexApi.skills.update, {
                    id: id as ConvexId<"skills">,
                    name: skill.name,
                    description: skill.description,
                    prompt: skill.prompt,
                });
            },
            remove: async ({ id }) => {
                await client.mutation(convexApi.skills.remove, {
                    id: id as ConvexId<"skills">,
                });
            },
        },
        attachments: {
            generateUploadUrl: async () =>
                (await client.mutation(
                    convexApi.attachments.generateUploadUrl,
                    {},
                )) as string,
            create: async ({ userId, messageId, attachment, storageId }) =>
                (await client.mutation(convexApi.attachments.create, {
                    userId: userId as ConvexId<"users">,
                    messageId: messageId as ConvexId<"messages">,
                    localId: attachment.id,
                    type: "image",
                    mimeType: attachment.mimeType,
                    storageId,
                    width: attachment.width,
                    height: attachment.height,
                    size: attachment.size,
                    createdAt: attachment.createdAt,
                })) as string,
            get: async ({ id }) =>
                (await client.query(convexApi.attachments.get, {
                    id: id as ConvexId<"attachments">,
                })) as any,
            getByLocalId: async ({ userId, localId }) =>
                (await client.query(convexApi.attachments.getByLocalId, {
                    userId: userId as ConvexId<"users">,
                    localId,
                })) as any,
            listByMessage: async ({ messageId }) =>
                (await client.query(convexApi.attachments.listByMessage, {
                    messageId: messageId as ConvexId<"messages">,
                })) as any,
            getUrl: async ({ storageId }) =>
                (await client.query(convexApi.attachments.getUrl, {
                    storageId,
                })) as string | null,
            remove: async ({ id }) => {
                await client.mutation(convexApi.attachments.remove, {
                    id: id as ConvexId<"attachments">,
                });
            },
            deleteByMessage: async ({ messageId }) => {
                await client.mutation(convexApi.attachments.deleteByMessage, {
                    messageId: messageId as ConvexId<"messages">,
                });
            },
            getTotalBytesByUser: async ({ userId }) =>
                (await client.query(convexApi.attachments.getTotalBytesByUser, {
                    userId: userId as ConvexId<"users">,
                })) as number,
        },
        users: {
            getStorageUsage: async ({ userId }) =>
                (await client.query(convexApi.users.getStorageUsage, {
                    userId: userId as ConvexId<"users">,
                })) as {
                    bytes: number;
                    messageCount: number;
                    sessionCount: number;
                },
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
        // `getCachedAttachmentData` is synchronous (in-memory), so this check must live here.
        const attachmentId =
            (attachment as any)?.localId ?? (attachment as any)?._id;
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

export class ConvexStorageAdapter
    extends ConvexAdapterBase
    implements StorageAdapter
{
    constructor(client: ConvexClientInterface, userId: ConvexId<"users">) {
        super({
            client,
            userId,
            services: createServices(client),
            attachmentIO: webAttachmentIO,
        });
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
}
