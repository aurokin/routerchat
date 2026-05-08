import { openDB, DBSchema, IDBPDatabase } from "idb";
import type {
    ChatSession,
    Message,
    Skill,
    Attachment,
    SearchLevel,
} from "@/lib/types";
import * as storage from "@/lib/storage";

interface ChatDB extends DBSchema {
    chats: {
        key: string;
        value: ChatSession;
        indexes: { "by-updated": number };
    };
    messages: {
        key: string;
        value: Message;
        indexes: { "by-session": string; "by-created": number };
    };
    attachments: {
        key: string;
        value: Attachment;
        indexes: { "by-message": string; "by-created": number };
    };
}

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<ChatDB>> {
    if (typeof window === "undefined") {
        return Promise.reject(
            new Error("IndexedDB is not available on the server"),
        );
    }

    if (!dbPromise) {
        dbPromise = openDB<ChatDB>("routerchat", 4, {
            upgrade(db, oldVersion, _newVersion, transaction) {
                // Version 1: Initial schema
                if (oldVersion < 1) {
                    const chatStore = db.createObjectStore("chats", {
                        keyPath: "id",
                    });
                    chatStore.createIndex("by-updated", "updatedAt");

                    const messageStore = db.createObjectStore("messages", {
                        keyPath: "id",
                    });
                    messageStore.createIndex("by-session", "sessionId");
                    messageStore.createIndex("by-created", "createdAt");
                }

                // Version 2: Migrate messages from skillId to skill object, add contextContent
                if (oldVersion < 2 && oldVersion >= 1) {
                    const messageStore = transaction.objectStore("messages");
                    const skills = storage.getSkills();

                    messageStore
                        .openCursor()
                        .then(function migrateMessage(cursor) {
                            if (!cursor) return;

                            const message = cursor.value as Message & {
                                skillId?: string;
                            };

                            // Migrate the message
                            const updatedMessage: Message = {
                                id: message.id,
                                sessionId: message.sessionId,
                                role: message.role,
                                content: message.content,
                                contextContent:
                                    message.contextContent || message.content, // Default to content if not set
                                thinking: message.thinking,
                                skill: null,
                                createdAt: message.createdAt,
                            };

                            // Try to find and clone the skill if skillId exists
                            if (message.skillId) {
                                const skill = skills.find(
                                    (s: Skill) => s.id === message.skillId,
                                );
                                if (skill) {
                                    updatedMessage.skill = JSON.parse(
                                        JSON.stringify(skill),
                                    );
                                }
                            }

                            cursor.update(updatedMessage);
                            cursor.continue().then(migrateMessage);
                        });
                }

                // Version 3: Add attachments store for image support
                if (oldVersion < 3) {
                    const attachmentStore = db.createObjectStore(
                        "attachments",
                        {
                            keyPath: "id",
                        },
                    );
                    attachmentStore.createIndex("by-message", "messageId");
                    attachmentStore.createIndex("by-created", "createdAt");
                }

                // Version 4: Migrate searchEnabled boolean to searchLevel string
                if (oldVersion < 4 && oldVersion >= 1) {
                    // Migrate chats
                    const chatStore = transaction.objectStore("chats");
                    chatStore.openCursor().then(function migrateChat(cursor) {
                        if (!cursor) return;

                        const chat = cursor.value as ChatSession & {
                            searchEnabled?: boolean;
                        };
                        const searchLevel: SearchLevel = chat.searchEnabled
                            ? "medium"
                            : "none";
                        const updatedChat = {
                            ...chat,
                            searchLevel,
                        };
                        delete (
                            updatedChat as ChatSession & {
                                searchEnabled?: boolean;
                            }
                        ).searchEnabled;

                        cursor.update(updatedChat);
                        cursor.continue().then(migrateChat);
                    });

                    // Migrate messages
                    const messageStore = transaction.objectStore("messages");
                    messageStore
                        .openCursor()
                        .then(function migrateMessage(cursor) {
                            if (!cursor) return;

                            const message = cursor.value as Message & {
                                searchEnabled?: boolean;
                            };
                            // Only set searchLevel if searchEnabled was present
                            if (message.searchEnabled !== undefined) {
                                const searchLevel: SearchLevel =
                                    message.searchEnabled ? "medium" : "none";
                                const updatedMessage = {
                                    ...message,
                                    searchLevel,
                                };
                                delete (
                                    updatedMessage as Message & {
                                        searchEnabled?: boolean;
                                    }
                                ).searchEnabled;

                                cursor.update(updatedMessage);
                            }
                            cursor.continue().then(migrateMessage);
                        });
                }
            },
        });
    }

    return dbPromise;
}

// Chat operations
export async function createChat(chat: ChatSession): Promise<void> {
    const db = await getDB();
    await db.put("chats", chat);
}

export async function getChat(id: string): Promise<ChatSession | undefined> {
    const db = await getDB();
    return db.get("chats", id);
}

export async function getAllChats(): Promise<ChatSession[]> {
    const db = await getDB();
    const chats = await db.getAllFromIndex("chats", "by-updated");
    return chats.reverse(); // Most recent first
}

export async function updateChat(chat: ChatSession): Promise<void> {
    const db = await getDB();
    await db.put("chats", chat);
}

export async function deleteChat(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("chats", id);

    // Delete all messages and their attachments in this chat
    const messages = await db.getAllFromIndex("messages", "by-session", id);
    for (const message of messages) {
        // Delete attachments for this message
        const attachments = await db.getAllFromIndex(
            "attachments",
            "by-message",
            message.id,
        );
        await Promise.all(
            attachments.map((a) => db.delete("attachments", a.id)),
        );
        // Delete the message
        await db.delete("messages", message.id);
    }
}

// Message operations
export async function createMessage(message: Message): Promise<void> {
    const db = await getDB();
    await db.put("messages", message);
}

export async function updateMessage(message: Message): Promise<void> {
    const db = await getDB();
    await db.put("messages", message);
}

export async function getMessagesByChat(chatId: string): Promise<Message[]> {
    const db = await getDB();
    const messages = await db.getAllFromIndex("messages", "by-session", chatId);
    return messages.sort((a, b) => a.createdAt - b.createdAt);
}

export async function deleteMessagesByChat(chatId: string): Promise<void> {
    await deleteAttachmentsBySession(chatId);
    const db = await getDB();
    const messages = await db.getAllFromIndex("messages", "by-session", chatId);
    await Promise.all(messages.map((m) => db.delete("messages", m.id)));
}

export async function deleteMessage(id: string): Promise<void> {
    await deleteAttachmentsByMessage(id);
    const db = await getDB();
    await db.delete("messages", id);
}

export async function clearAllData(): Promise<void> {
    const db = await getDB();
    await db.clear("chats");
    await db.clear("messages");
    await db.clear("attachments");
}

// Attachment operations
export async function saveAttachment(attachment: Attachment): Promise<void> {
    const db = await getDB();
    await db.put("attachments", attachment);
}

export async function saveAttachments(
    attachments: Attachment[],
): Promise<void> {
    const db = await getDB();
    const tx = db.transaction("attachments", "readwrite");
    await Promise.all([...attachments.map((a) => tx.store.put(a)), tx.done]);
}

export async function getAttachment(
    id: string,
): Promise<Attachment | undefined> {
    const db = await getDB();
    return db.get("attachments", id);
}

export async function getAttachmentsByMessage(
    messageId: string,
): Promise<Attachment[]> {
    const db = await getDB();
    return db.getAllFromIndex("attachments", "by-message", messageId);
}

export async function deleteAttachment(id: string): Promise<void> {
    const db = await getDB();
    await db.delete("attachments", id);
}

export async function deleteAttachmentsByMessage(
    messageId: string,
): Promise<void> {
    const db = await getDB();
    const attachments = await db.getAllFromIndex(
        "attachments",
        "by-message",
        messageId,
    );
    await Promise.all(attachments.map((a) => db.delete("attachments", a.id)));
}

export async function deleteAttachmentsBySession(
    sessionId: string,
): Promise<void> {
    const db = await getDB();
    const messages = await db.getAllFromIndex(
        "messages",
        "by-session",
        sessionId,
    );
    for (const message of messages) {
        const attachments = await db.getAllFromIndex(
            "attachments",
            "by-message",
            message.id,
        );
        await Promise.all(
            attachments.map((a) => db.delete("attachments", a.id)),
        );
    }
}

// Storage management
export interface StorageUsage {
    attachments: number; // bytes
    messages: number; // count
    sessions: number; // count
}

export async function getStorageUsage(): Promise<StorageUsage> {
    const db = await getDB();
    const attachments = await db.getAll("attachments");
    const totalAttachmentSize = attachments.reduce((sum, a) => sum + a.size, 0);
    const messageCount = await db.count("messages");
    const sessionCount = await db.count("chats");

    return {
        attachments: totalAttachmentSize,
        messages: messageCount,
        sessions: sessionCount,
    };
}

export async function getAttachmentStorageBySession(
    sessionId: string,
): Promise<number> {
    const db = await getDB();
    const messages = await db.getAllFromIndex(
        "messages",
        "by-session",
        sessionId,
    );
    let totalSize = 0;

    for (const message of messages) {
        const attachments = await db.getAllFromIndex(
            "attachments",
            "by-message",
            message.id,
        );
        totalSize += attachments.reduce((sum, a) => sum + a.size, 0);
    }

    return totalSize;
}

export async function cleanupOldAttachments(maxBytes: number): Promise<number> {
    const db = await getDB();
    const attachments = await db.getAllFromIndex("attachments", "by-created");
    // Attachments are sorted by createdAt ascending (oldest first)

    const usage = await getStorageUsage();
    let currentSize = usage.attachments;
    let freedBytes = 0;

    // Purge oldest attachments until we're under the limit.
    // We keep the attachment record with `purgedAt` so the UI can display a placeholder
    // instead of silently removing the image from chat history.
    for (const attachment of attachments) {
        if (currentSize <= maxBytes) break;

        // Already purged or empty.
        if (attachment.purgedAt || !attachment.data || attachment.size <= 0) {
            continue;
        }

        const purgedAt = Date.now();
        await db.put("attachments", {
            ...attachment,
            data: "",
            size: 0,
            purgedAt,
        });

        currentSize -= attachment.size;
        freedBytes += attachment.size;
    }

    return freedBytes;
}
