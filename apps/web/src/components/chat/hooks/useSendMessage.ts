"use client";

import { useCallback, useState } from "react";
import {
    sendMessage,
    toMessageUsage,
    OpenRouterApiError,
    buildMessageContent,
    type MessageContent,
} from "@/lib/openrouter";
import {
    modelSupportsReasoning,
    modelSupportsSearch,
    type Attachment,
    type ChatSession,
    type ImageMimeType,
    type Message,
    type PendingAttachment,
    type SearchLevel,
    type ThinkingLevel,
} from "@/lib/types";
import type { OpenRouterModel } from "@shared/core/models";
import type { OpenRouterMessage } from "@shared/core/openrouter";
import type { Skill } from "@shared/core/skills";
import { trimTrailingEmptyLines } from "@shared/core/text";
import { generateUUID } from "@/lib/utils";
import { ConvexStorageAdapter } from "@/lib/sync/convex-adapter";
import type { StorageAdapter } from "@/lib/sync/storage-adapter";
import type { ChatError } from "../ChatErrorBanner";
import type { StreamingMessageState } from "./useStreamingMessage";

interface NewMessageInput {
    id?: string;
    role: Message["role"];
    content: string;
    contextContent: string;
    skill: Skill | null;
    modelId: string;
    thinkingLevel: ThinkingLevel;
    searchLevel: SearchLevel;
    attachmentIds?: string[];
    chatId: string;
}

export interface UseSendMessageParams {
    apiKey: string | null | undefined;
    currentChat: ChatSession | null;
    messages: Message[];
    selectedSkill: Skill | null;
    models: OpenRouterModel[];
    storageAdapter: StorageAdapter;
    promptCacheEnabled: boolean;
    /** Returns the freshest skill snapshot, including keybinding-driven changes. */
    getLastSkillChange: () => { skill: Skill | null; mode: "auto" | "manual" };
    addMessage: (msg: NewMessageInput) => Promise<Message>;
    updateMessage: (id: string, patch: Partial<Message>) => Promise<void>;
    updateChat: (chat: ChatSession) => Promise<void> | void;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (value: ThinkingLevel) => void;
    setDefaultSearchLevel: (value: SearchLevel) => void;
    updateSelectedSkill: (
        skill: Skill | null,
        options?: { mode?: "auto" | "manual" },
    ) => void;
    queueStreamingMessageUpdate: (next: StreamingMessageState | null) => void;
    clearStreamingMessage: () => void;
}

interface RetryChat {
    content: string;
    contextContent: string;
}

interface UseSendMessageReturn {
    sending: boolean;
    error: ChatError | null;
    setError: (error: ChatError | null) => void;
    handleSendMessage: (
        content: string,
        pendingAttachments?: PendingAttachment[],
    ) => Promise<void>;
    handleRetry: () => Promise<void>;
}

/**
 * Build the system prefix that gets cached when prompt caching is enabled.
 * Skill prompt only — search guidance is folded in by the request builder
 * when search is on.
 */
function buildCachedSystemPrefix(skill: Skill | null): string | undefined {
    if (!skill) return undefined;
    const trimmed = skill.prompt.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function getChatTitleUpdate(
    chat: ChatSession | null,
    content: string,
    messageCount: number,
): ChatSession | null {
    if (!chat || chat.title !== "New Chat" || messageCount !== 0) {
        return null;
    }

    const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
    return { ...chat, title };
}

export { getChatTitleUpdate };

export function useSendMessage(
    params: UseSendMessageParams,
): UseSendMessageReturn {
    const {
        apiKey,
        currentChat,
        messages,
        selectedSkill,
        models,
        storageAdapter,
        promptCacheEnabled,
        getLastSkillChange,
        addMessage,
        updateMessage,
        updateChat,
        setDefaultModel,
        setDefaultThinking,
        setDefaultSearchLevel,
        updateSelectedSkill,
        queueStreamingMessageUpdate,
        clearStreamingMessage,
    } = params;

    const [sending, setSending] = useState(false);
    const [error, setError] = useState<ChatError | null>(null);
    const [retryChat, setRetryChat] = useState<RetryChat | null>(null);

    const handleSendMessage = useCallback(
        async (content: string, pendingAttachments?: PendingAttachment[]) => {
            const chatSnapshot = currentChat;
            const messagesSnapshot = messages;

            if (!apiKey) {
                setError({
                    message: "Please add your OpenRouter API key in Settings",
                    isRetryable: false,
                });
                return;
            }

            if (!chatSnapshot) {
                setError({ message: "No chat selected", isRetryable: false });
                return;
            }

            setSending(true);
            setError(null);
            setRetryChat(null);
            clearStreamingMessage();

            const skillSnapshot = getLastSkillChange();
            let skillForMessage = selectedSkill;
            if (skillSnapshot.mode === "manual") {
                skillForMessage = skillSnapshot.skill;
            }

            let assistantMessageId: string | null = null;
            let fullResponse = "";
            let fullThinking = "";

            try {
                const currentModel = models.find(
                    (m) => m.id === chatSnapshot.modelId,
                );
                const supportsReasoning = modelSupportsReasoning(currentModel);
                const supportsSearch = modelSupportsSearch(currentModel);

                const effectiveThinking = supportsReasoning
                    ? chatSnapshot.thinking
                    : "none";
                const effectiveSearchLevel: SearchLevel =
                    supportsSearch && chatSnapshot.searchLevel !== "none"
                        ? chatSnapshot.searchLevel
                        : "none";

                const contextContent = skillForMessage
                    ? `${skillForMessage.prompt}\n\nUser: ${content}`
                    : content;

                const clonedSkill: Skill | null = skillForMessage
                    ? (JSON.parse(JSON.stringify(skillForMessage)) as Skill)
                    : null;

                // Generate a stable message ID for attachments.
                const messageId = generateUUID();
                const isCloudStorage =
                    storageAdapter instanceof ConvexStorageAdapter;

                let attachmentIds: string[] | undefined;
                const attachments: Attachment[] = pendingAttachments?.length
                    ? pendingAttachments.map((pa) => ({
                          id: generateUUID(),
                          messageId,
                          type: "image" as const,
                          mimeType: pa.mimeType as ImageMimeType,
                          data: pa.data,
                          width: pa.width,
                          height: pa.height,
                          size: pa.size,
                          ...(pa.url ? { url: pa.url } : {}),
                          createdAt: Date.now(),
                      }))
                    : [];

                if (attachments.length > 0) {
                    attachmentIds = attachments.map((a) => a.id);

                    if (isCloudStorage) {
                        // Cloud attachments must reference an existing message,
                        // so create the message, upload, then patch attachmentIds.
                        await addMessage({
                            id: messageId,
                            role: "user",
                            content: content,
                            contextContent: contextContent,
                            skill: clonedSkill,
                            modelId: chatSnapshot.modelId,
                            thinkingLevel: effectiveThinking,
                            searchLevel: effectiveSearchLevel,
                            chatId: chatSnapshot.id,
                        });

                        await storageAdapter.saveAttachments(attachments);

                        await updateMessage(messageId, { attachmentIds });
                    } else {
                        // Local storage saves attachments first so they render
                        // immediately.
                        await storageAdapter.saveAttachments(attachments);

                        await addMessage({
                            id: messageId,
                            role: "user",
                            content: content,
                            contextContent: contextContent,
                            skill: clonedSkill,
                            modelId: chatSnapshot.modelId,
                            thinkingLevel: effectiveThinking,
                            searchLevel: effectiveSearchLevel,
                            attachmentIds,
                            chatId: chatSnapshot.id,
                        });
                    }
                } else {
                    await addMessage({
                        id: messageId,
                        role: "user",
                        content: content,
                        contextContent: contextContent,
                        skill: clonedSkill,
                        modelId: chatSnapshot.modelId,
                        thinkingLevel: effectiveThinking,
                        searchLevel: effectiveSearchLevel,
                        chatId: chatSnapshot.id,
                    });
                }

                setDefaultModel(chatSnapshot.modelId);
                if (supportsReasoning) {
                    setDefaultThinking(effectiveThinking);
                }
                if (supportsSearch) {
                    setDefaultSearchLevel(effectiveSearchLevel);
                }

                updateSelectedSkill(null, { mode: "auto" });

                const updatedChat = getChatTitleUpdate(
                    chatSnapshot,
                    content,
                    messagesSnapshot.length,
                );
                if (updatedChat) {
                    await updateChat(updatedChat);
                }

                const currentMessages: OpenRouterMessage[] = [];

                for (const m of messagesSnapshot) {
                    // When caching is on we send the skill prompt as a cached
                    // system message, so historical messages that had it
                    // inlined into contextContent must use the raw user
                    // content instead — otherwise the skill text would
                    // appear twice and break cache prefix stability.
                    const baseContent =
                        promptCacheEnabled && m.skill
                            ? m.content
                            : m.contextContent;
                    let messageContent: MessageContent = baseContent;

                    if (m.attachmentIds && m.attachmentIds.length > 0) {
                        const msgAttachments =
                            await storageAdapter.getAttachmentsByMessage(m.id);
                        if (msgAttachments.length > 0) {
                            messageContent = buildMessageContent(
                                baseContent,
                                msgAttachments,
                            );
                        }
                    }

                    const outgoing: OpenRouterMessage = {
                        role: m.role,
                        content: messageContent,
                    };
                    // Replay reasoning back so providers (e.g. Anthropic) can
                    // resume their reasoning chain on the next turn.
                    if (
                        m.role === "assistant" &&
                        m.reasoningDetails &&
                        m.reasoningDetails.length > 0
                    ) {
                        outgoing.reasoning_details = m.reasoningDetails;
                    }
                    currentMessages.push(outgoing);
                }

                const newUserAttachments: Attachment[] | undefined =
                    pendingAttachments?.map((pa) => ({
                        id: generateUUID(),
                        messageId: "",
                        type: "image" as const,
                        mimeType: pa.mimeType as ImageMimeType,
                        data: pa.data,
                        width: pa.width,
                        height: pa.height,
                        size: pa.size,
                        ...(pa.url ? { url: pa.url } : {}),
                        createdAt: Date.now(),
                    }));

                const newUserContent =
                    promptCacheEnabled && skillForMessage
                        ? content
                        : contextContent;
                currentMessages.push({
                    role: "user",
                    content: buildMessageContent(
                        newUserContent,
                        newUserAttachments,
                    ),
                });

                const assistantMessage = await addMessage({
                    role: "assistant",
                    content: "",
                    contextContent: "",
                    skill: null,
                    modelId: chatSnapshot.modelId,
                    thinkingLevel: effectiveThinking,
                    searchLevel: effectiveSearchLevel,
                    chatId: chatSnapshot.id,
                });
                assistantMessageId = assistantMessage.id;
                queueStreamingMessageUpdate({
                    id: assistantMessage.id,
                    content: "",
                    thinking: undefined,
                });

                const cachedSystemPrefix = promptCacheEnabled
                    ? buildCachedSystemPrefix(skillForMessage)
                    : undefined;

                const response = await sendMessage(
                    apiKey,
                    currentMessages,
                    chatSnapshot,
                    currentModel,
                    (chunk, thinking) => {
                        if (thinking !== undefined) {
                            fullThinking += thinking;
                        } else {
                            fullResponse += chunk;
                        }

                        queueStreamingMessageUpdate({
                            id: assistantMessage.id,
                            content: fullResponse,
                            thinking: fullThinking || undefined,
                        });
                    },
                    {
                        cacheControl: promptCacheEnabled,
                        systemPrefix: cachedSystemPrefix,
                    },
                );

                const trimmedResponse =
                    trimTrailingEmptyLines(fullResponse) ?? "";
                const trimmedThinking = trimTrailingEmptyLines(fullThinking);
                const usage = toMessageUsage(response.usage) ?? undefined;
                const reasoningDetails =
                    response.choices[0]?.message.reasoningDetails;
                await updateMessage(assistantMessage.id, {
                    content: trimmedResponse,
                    contextContent: trimmedResponse,
                    thinking: trimmedThinking || undefined,
                    usage,
                    reasoningDetails,
                });
            } catch (err) {
                if (assistantMessageId && (fullResponse || fullThinking)) {
                    const partialResponse =
                        trimTrailingEmptyLines(fullResponse) ?? "";
                    const partialThinking =
                        trimTrailingEmptyLines(fullThinking);
                    try {
                        await updateMessage(assistantMessageId, {
                            content: partialResponse,
                            contextContent: partialResponse,
                            thinking: partialThinking || undefined,
                        });
                    } catch {
                        // Preserve the original streaming error as the surfaced
                        // failure.
                    }
                }

                if (err instanceof OpenRouterApiError) {
                    setError({
                        message: err.message,
                        isRetryable: err.isRetryable,
                    });
                    if (err.isRetryable) {
                        setRetryChat({
                            content: content,
                            contextContent: skillForMessage
                                ? `${skillForMessage.prompt}\n\nUser: ${content}`
                                : content,
                        });
                    }
                } else {
                    setError({
                        message:
                            err instanceof Error
                                ? err.message
                                : "Failed to send message",
                        isRetryable: true,
                    });
                }
            } finally {
                setSending(false);
                clearStreamingMessage();
            }
        },
        [
            addMessage,
            apiKey,
            clearStreamingMessage,
            currentChat,
            getLastSkillChange,
            messages,
            models,
            promptCacheEnabled,
            queueStreamingMessageUpdate,
            selectedSkill,
            setDefaultModel,
            setDefaultSearchLevel,
            setDefaultThinking,
            storageAdapter,
            updateChat,
            updateMessage,
            updateSelectedSkill,
        ],
    );

    const handleRetry = useCallback(async () => {
        if (!retryChat || !currentChat) return;
        const { content } = retryChat;
        setRetryChat(null);
        setError(null);
        await handleSendMessage(content);
    }, [currentChat, handleSendMessage, retryChat]);

    return {
        sending,
        error,
        setError,
        handleSendMessage,
        handleRetry,
    };
}
