import type { Attachment, ChatSession, Message } from "../types";
import type { Skill } from "../skills";
import type {
    StorageAdapter,
    SkillSettings,
    SkillSettingsUpdate,
} from "./index";

export interface ConvexFunctionReference<
    Type extends "mutation" | "query" | "action",
    _Args = unknown,
    _Result = unknown,
> {
    _type: Type;
    _args: _Args;
    _returnType: _Result;
}

export interface ConvexClientLike {
    mutation<Args, Result>(
        fn: ConvexFunctionReference<"mutation", Args, Result>,
        args: Args,
    ): Promise<Result>;
    query<Args, Result>(
        fn: ConvexFunctionReference<"query", Args, Result>,
        args: Args,
    ): Promise<Result>;
}

export interface ConvexChatLike {
    _id: string;
    localId?: string;
    title: string;
    modelId: string;
    thinking: ChatSession["thinking"];
    searchLevel: ChatSession["searchLevel"];
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessageLike {
    _id: string;
    localId?: string;
    chatId: string;
    role: Message["role"];
    content: string;
    contextContent: string;
    thinking?: string;
    skill?: Skill | null;
    modelId?: string;
    thinkingLevel?: Message["thinkingLevel"];
    searchLevel?: Message["searchLevel"];
    attachmentIds?: string[];
    createdAt: number;
}

export interface ConvexSkillLike {
    _id: string;
    localId?: string;
    name: Skill["name"];
    description: Skill["description"];
    prompt: Skill["prompt"];
    createdAt: number;
}

export interface ConvexAttachmentLike {
    _id: string;
    localId?: string;
    messageId: string;
    type: "image";
    mimeType: Attachment["mimeType"];
    storageId: string;
    width: number;
    height: number;
    size: number;
    createdAt: number;
    purgedAt?: number;
}

export interface ConvexAdapterServices {
    chats: {
        create(args: { userId: string; chat: ChatSession }): Promise<string>;
        get(args: { id: string }): Promise<ConvexChatLike | null>;
        getByLocalId(args: {
            userId: string;
            localId: string;
        }): Promise<ConvexChatLike | null>;
        listByUser(args: { userId: string }): Promise<ConvexChatLike[]>;
        update(args: { id: string; chat: ChatSession }): Promise<void>;
        remove(args: { id: string }): Promise<void>;
    };
    messages: {
        create(args: {
            userId: string;
            chatId: string;
            message: Message;
        }): Promise<string>;
        getByLocalId(args: {
            userId: string;
            localId: string;
        }): Promise<ConvexMessageLike | null>;
        listByChat(args: { chatId: string }): Promise<ConvexMessageLike[]>;
        update(args: { id: string; message: Message }): Promise<void>;
        remove(args: { id: string }): Promise<void>;
        deleteByChat(args: { chatId: string }): Promise<void>;
    };
    skills: {
        create(args: { userId: string; skill: Skill }): Promise<string>;
        listByUser(args: { userId: string }): Promise<ConvexSkillLike[]>;
        getByLocalId(args: {
            userId: string;
            localId: string;
        }): Promise<ConvexSkillLike | null>;
        update(args: { id: string; skill: Skill }): Promise<void>;
        remove(args: { id: string }): Promise<void>;
    };
    attachments: {
        generateUploadUrl(): Promise<string>;
        create(args: {
            userId: string;
            messageId: string;
            attachment: Attachment;
            storageId: string;
        }): Promise<string>;
        get(args: { id: string }): Promise<ConvexAttachmentLike | null>;
        getByLocalId(args: {
            userId: string;
            localId: string;
        }): Promise<ConvexAttachmentLike | null>;
        listByMessage(args: {
            messageId: string;
        }): Promise<ConvexAttachmentLike[]>;
        getUrl(args: { storageId: string }): Promise<string | null>;
        remove(args: { id: string }): Promise<void>;
        deleteByMessage(args: { messageId: string }): Promise<void>;
        getTotalBytesByUser(args: { userId: string }): Promise<number>;
    };
    users: {
        getStorageUsage(args: { userId: string }): Promise<{
            bytes: number;
            messageCount: number;
            sessionCount: number;
        }>;
    };
}

export interface AttachmentIO<
    ConvexAttachment extends ConvexAttachmentLike = ConvexAttachmentLike,
> {
    getUploadBody(attachment: Attachment): Promise<Blob>;
    downloadAttachmentData(
        url: string,
        attachment: ConvexAttachment,
    ): Promise<string | null>;
    getCachedAttachmentData?(attachmentId: string): string | null;
    setCachedAttachmentData?(
        attachmentId: string,
        data: string,
    ): void | Promise<void>;
    deleteCachedAttachmentData?(
        attachmentId: string,
        data?: string | null,
    ): void | Promise<void>;
}

export abstract class ConvexAdapterBase implements StorageAdapter {
    protected readonly client: ConvexClientLike;
    protected readonly userId: string;
    private readonly services: ConvexAdapterServices;
    private readonly attachmentIO: AttachmentIO;

    private chatIdMap: Map<string, string> = new Map();
    private messageIdMap: Map<string, string> = new Map();
    private messageConvexToLocal: Map<string, string> = new Map();
    private attachmentIdMap: Map<string, string> = new Map();
    private skillIdMap: Map<string, string> = new Map();

    constructor(params: {
        client: ConvexClientLike;
        userId: string;
        services: ConvexAdapterServices;
        attachmentIO: AttachmentIO;
    }) {
        this.client = params.client;
        this.userId = params.userId;
        this.services = params.services;
        this.attachmentIO = params.attachmentIO;
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
            storageId: uploadResult.storageId,
        });

        this.attachmentIdMap.set(attachment.id, convexId);
        await this.attachmentIO.setCachedAttachmentData?.(
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
        const cachedData =
            this.attachmentIO.getCachedAttachmentData?.(id) ?? null;
        await this.attachmentIO.deleteCachedAttachmentData?.(id, cachedData);
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

    abstract getSkillSettings(): Promise<SkillSettings>;

    abstract upsertSkillSettings(settings: SkillSettingsUpdate): Promise<void>;

    protected async getOrLookupSkillId(
        localId: string,
    ): Promise<string | null> {
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

    protected async getOrLookupChatId(localId: string): Promise<string | null> {
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

    protected async getOrLookupMessageId(
        localId: string,
    ): Promise<string | null> {
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

    protected convexChatToLocal(chat: ConvexChatLike): ChatSession {
        return {
            id: chat.localId ?? chat._id,
            title: chat.title,
            modelId: chat.modelId,
            thinking: chat.thinking,
            searchLevel: chat.searchLevel,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        };
    }

    protected convexMessageToLocal(
        msg: ConvexMessageLike,
        chatLocalId: string,
    ): Message {
        const localId = msg.localId ?? msg._id;
        this.messageIdMap.set(localId, msg._id);
        this.messageConvexToLocal.set(msg._id, localId);

        return {
            id: localId,
            sessionId: chatLocalId,
            role: msg.role,
            content: msg.content,
            contextContent: msg.contextContent,
            thinking: msg.thinking,
            skill: msg.skill,
            modelId: msg.modelId,
            thinkingLevel: msg.thinkingLevel,
            searchLevel: msg.searchLevel,
            attachmentIds: msg.attachmentIds,
            createdAt: msg.createdAt,
        };
    }

    protected convexSkillToLocal(skill: ConvexSkillLike): Skill {
        return {
            id: skill.localId ?? skill._id,
            name: skill.name,
            description: skill.description,
            prompt: skill.prompt,
            createdAt: skill.createdAt,
        };
    }

    protected async convexAttachmentToLocal(
        att: ConvexAttachmentLike,
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
                mimeType: att.mimeType,
                data: "",
                width: att.width,
                height: att.height,
                size: att.size,
                createdAt: att.createdAt,
                purgedAt: att.purgedAt,
            };
        }

        const cached = this.attachmentIO.getCachedAttachmentData?.(localId);
        if (cached) {
            return {
                id: localId,
                messageId: resolvedMessageId,
                type: "image",
                mimeType: att.mimeType,
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

        await this.attachmentIO.setCachedAttachmentData?.(localId, data);

        return {
            id: localId,
            messageId: resolvedMessageId,
            type: "image",
            mimeType: att.mimeType,
            data,
            width: att.width,
            height: att.height,
            size: att.size,
            createdAt: att.createdAt,
        };
    }
}
