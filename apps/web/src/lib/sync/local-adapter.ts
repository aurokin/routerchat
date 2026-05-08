/**
 * Local Storage Adapter
 *
 * Implements the StorageAdapter interface using IndexedDB.
 * This wraps the existing db.ts functions.
 */

import type { ChatSession, Message, Attachment, Skill } from "@/lib/types";
import type {
    StorageAdapter,
    SkillSettings,
    SkillSettingsUpdate,
} from "./storage-adapter";
import * as db from "@/lib/db";
import * as storage from "@/lib/storage";

/**
 * Local storage adapter implementation using IndexedDB.
 */
export class LocalStorageAdapter implements StorageAdapter {
    // Chat operations
    async createChat(chat: ChatSession): Promise<string> {
        await db.createChat(chat);
        return chat.id;
    }

    async getChat(id: string): Promise<ChatSession | undefined> {
        return db.getChat(id);
    }

    async getAllChats(): Promise<ChatSession[]> {
        return db.getAllChats();
    }

    async updateChat(chat: ChatSession): Promise<void> {
        await db.updateChat(chat);
    }

    async deleteChat(id: string): Promise<void> {
        await db.deleteChat(id);
    }

    // Message operations
    async createMessage(message: Message): Promise<string> {
        await db.createMessage(message);
        return message.id;
    }

    async updateMessage(message: Message): Promise<void> {
        await db.updateMessage(message);
    }

    async getMessagesByChat(chatId: string): Promise<Message[]> {
        return db.getMessagesByChat(chatId);
    }

    async deleteMessagesByChat(chatId: string): Promise<void> {
        await db.deleteMessagesByChat(chatId);
    }

    async deleteMessage(id: string): Promise<void> {
        await db.deleteMessage(id);
    }

    // Attachment operations
    async saveAttachment(attachment: Attachment): Promise<string> {
        await db.saveAttachment(attachment);
        return attachment.id;
    }

    async saveAttachments(attachments: Attachment[]): Promise<string[]> {
        await db.saveAttachments(attachments);
        return attachments.map((a) => a.id);
    }

    async getAttachment(id: string): Promise<Attachment | undefined> {
        return db.getAttachment(id);
    }

    async getAttachmentsByMessage(messageId: string): Promise<Attachment[]> {
        return db.getAttachmentsByMessage(messageId);
    }

    async deleteAttachment(id: string): Promise<void> {
        await db.deleteAttachment(id);
    }

    async deleteAttachmentsByMessage(messageId: string): Promise<void> {
        await db.deleteAttachmentsByMessage(messageId);
    }

    // Storage stats
    async getImageStorageUsage(): Promise<number> {
        const usage = await db.getStorageUsage();
        return usage.attachments;
    }

    async getStorageUsage(): Promise<{
        bytes: number;
        messageCount: number;
        sessionCount: number;
    }> {
        const usage = await db.getStorageUsage();
        return {
            bytes: usage.attachments,
            messageCount: usage.messages,
            sessionCount: usage.sessions,
        };
    }

    // Skill operations
    async getSkills(): Promise<Skill[]> {
        return storage.getSkills();
    }

    async createSkill(skill: Skill): Promise<string> {
        const skills = storage.getSkills();
        storage.setSkills([...skills, skill]);
        return skill.id;
    }

    async updateSkill(skill: Skill): Promise<void> {
        const skills = storage.getSkills();
        const updated = skills.map((item) =>
            item.id === skill.id ? skill : item,
        );
        storage.setSkills(updated);
    }

    async deleteSkill(id: string): Promise<void> {
        const skills = storage.getSkills();
        storage.setSkills(skills.filter((skill) => skill.id !== id));
    }

    async getSkillSettings(): Promise<SkillSettings> {
        return {
            defaultSkillId: storage.getDefaultSkillId(),
            selectedSkillId: storage.getSelectedSkillId(),
            selectedSkillMode: storage.getSelectedSkillMode(),
        };
    }

    async upsertSkillSettings(settings: SkillSettingsUpdate): Promise<void> {
        if ("defaultSkillId" in settings) {
            storage.setDefaultSkillId(settings.defaultSkillId ?? null);
        }
        if ("selectedSkillId" in settings) {
            storage.setSelectedSkillId(settings.selectedSkillId ?? null);
        }
        if (settings.selectedSkillMode) {
            storage.setSelectedSkillMode(settings.selectedSkillMode);
        }
    }
}

/**
 * Singleton instance of the local storage adapter.
 */
let localAdapterInstance: LocalStorageAdapter | null = null;

export function getLocalStorageAdapter(): LocalStorageAdapter {
    if (!localAdapterInstance) {
        localAdapterInstance = new LocalStorageAdapter();
    }
    return localAdapterInstance;
}
