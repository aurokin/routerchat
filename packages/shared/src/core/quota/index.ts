export const CLOUD_IMAGE_QUOTA = 1 * 1024 * 1024 * 1024;
export const LOCAL_IMAGE_QUOTA = 500 * 1024 * 1024;
// Local-only guardrail: maximum image bytes allowed per conversation.
// (Used to avoid a single chat consuming all local storage.)
export const MAX_SESSION_STORAGE = 50 * 1024 * 1024;
export const QUOTA_WARNING_80 = 0.8;
export const QUOTA_WARNING_95 = 0.95;

import type { StorageAdapter } from "../sync";
import type { ChatSession, Message, Attachment } from "../types";

export interface QuotaStatus {
    used: number;
    limit: number;
    percentage: number;
    isWarning80: boolean;
    isWarning95: boolean;
    isExceeded: boolean;
}

export interface ConversationStorageUsage {
    chatId: string;
    title: string;
    imageBytes: number;
    imageCount: number;
    lastMessageAt: number;
}

export function calculateQuotaStatus(used: number, limit: number): QuotaStatus {
    const percentage = used / limit;
    return {
        used,
        limit,
        percentage,
        isWarning80: percentage >= QUOTA_WARNING_80,
        isWarning95: percentage >= QUOTA_WARNING_95,
        isExceeded: percentage >= 1,
    };
}

export async function findOldestConversation(
    adapter: StorageAdapter,
): Promise<string | null> {
    const chats = await adapter.getAllChats();

    if (chats.length === 0) return null;

    const sorted = [...chats].sort((a, b) => a.updatedAt - b.updatedAt);
    return sorted[0]?.id ?? null;
}

export async function purgeConversationImages(
    adapter: StorageAdapter,
    chatId: string,
): Promise<number> {
    const messages = await adapter.getMessagesByChat(chatId);
    let bytesFreed = 0;

    for (const message of messages) {
        if (message.attachmentIds && message.attachmentIds.length > 0) {
            const attachments = await adapter.getAttachmentsByMessage(
                message.id,
            );

            for (const attachment of attachments) {
                bytesFreed += attachment.size;
                await adapter.deleteAttachment(attachment.id);
            }
        }
    }

    return bytesFreed;
}

export async function purgeOldestConversationImages(
    adapter: StorageAdapter,
    target: "local" | "cloud",
): Promise<number> {
    const limit = target === "local" ? LOCAL_IMAGE_QUOTA : CLOUD_IMAGE_QUOTA;
    let currentUsage = await adapter.getImageStorageUsage();
    let totalBytesFreed = 0;

    while (currentUsage > limit) {
        const oldestChatId = await findOldestConversation(adapter);

        if (!oldestChatId) {
            break;
        }

        const bytesFreed = await purgeConversationImages(adapter, oldestChatId);

        if (bytesFreed === 0) {
            break;
        }

        totalBytesFreed += bytesFreed;
        currentUsage -= bytesFreed;
    }

    return totalBytesFreed;
}

export async function enforceQuotaOnUpload(
    newImageSize: number,
    target: "local" | "cloud",
    adapter?: StorageAdapter,
): Promise<boolean> {
    const effectiveAdapter = adapter ?? null;
    if (!effectiveAdapter) {
        return true;
    }
    const limit = target === "local" ? LOCAL_IMAGE_QUOTA : CLOUD_IMAGE_QUOTA;

    let currentUsage = await effectiveAdapter.getImageStorageUsage();

    while (currentUsage + newImageSize > limit) {
        const oldestChatId = await findOldestConversation(effectiveAdapter);

        if (!oldestChatId) {
            return newImageSize <= limit;
        }

        const bytesFreed = await purgeConversationImages(
            effectiveAdapter,
            oldestChatId,
        );

        if (bytesFreed === 0) {
            return currentUsage + newImageSize <= limit;
        }

        currentUsage -= bytesFreed;
    }

    return true;
}

export async function getStorageUsageByConversation(
    adapter: StorageAdapter,
): Promise<ConversationStorageUsage[]> {
    const chats = await adapter.getAllChats();
    const usages: ConversationStorageUsage[] = [];

    for (const chat of chats) {
        const messages = await adapter.getMessagesByChat(chat.id);
        let imageBytes = 0;
        let imageCount = 0;

        for (const message of messages) {
            if (message.attachmentIds && message.attachmentIds.length > 0) {
                const attachments = await adapter.getAttachmentsByMessage(
                    message.id,
                );
                imageCount += attachments.length;
                imageBytes += attachments.reduce((sum, a) => sum + a.size, 0);
            }
        }

        if (imageBytes > 0) {
            usages.push({
                chatId: chat.id,
                title: chat.title,
                imageBytes,
                imageCount,
                lastMessageAt: chat.updatedAt,
            });
        }
    }

    return usages.sort((a, b) => a.lastMessageAt - b.lastMessageAt);
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

export function formatQuotaStatus(status: QuotaStatus): string {
    const usedStr = formatBytes(status.used);
    const limitStr = formatBytes(status.limit);
    const percentage = Math.round(status.percentage * 100);

    return `${usedStr} / ${limitStr} (${percentage}%)`;
}
