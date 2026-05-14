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
    modelSupportsTools,
    modelSupportsReasoning,
    modelSupportsSearch,
    type Attachment,
    type ChatSession,
    type Message,
    type PendingAttachment,
    type PdfParserEnginePreference,
    type ProviderSortPreference,
    type SearchLevel,
    type ThinkingLevel,
} from "@/lib/types";
import type { OpenRouterModel } from "@shared/core/models";
import type {
    OpenRouterMessage,
    OpenRouterPlugin,
    ToolCall,
} from "@shared/core/openrouter";
import type { Skill } from "@shared/core/skills";
import { trimTrailingEmptyLines } from "@shared/core/text";
import {
    executeLocalToolCall,
    getFunctionToolsForIds,
    isKnownLocalTool,
} from "@shared/core/tools";
import { generateUUID } from "@/lib/utils";
import { ConvexStorageAdapter } from "@/lib/sync/convex-adapter";
import type { StorageAdapter } from "@/lib/sync/storage-adapter";
import type { ChatError } from "../ChatErrorBanner";
import type { StreamingMessageState } from "./useStreamingMessage";

const MAX_TOOL_ROUNDS = 3;

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
    toolCalls?: Message["toolCalls"];
    toolCallId?: string;
    toolName?: string;
    toolExecutions?: Message["toolExecutions"];
    createdAt?: number;
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
    structuredOutputJson: boolean;
    providerSort: ProviderSortPreference;
    pdfParserEngine: PdfParserEnginePreference;
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

function buildToolResultContent(params: {
    call: ToolCall;
    result?: string;
    error?: string;
}): string {
    const { call, result, error } = params;
    if (error) {
        return JSON.stringify({
            ok: false,
            tool: call.function.name,
            error,
        });
    }

    return JSON.stringify({
        ok: true,
        tool: call.function.name,
        result: result ?? "",
    });
}

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
        structuredOutputJson,
        providerSort,
        pdfParserEngine,
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
            let lastPersistedMessageAt = Date.now();
            const nextMessageTimestamp = () => {
                lastPersistedMessageAt = Math.max(
                    Date.now(),
                    lastPersistedMessageAt + 1,
                );
                return lastPersistedMessageAt;
            };

            try {
                const currentModel = models.find(
                    (m) => m.id === chatSnapshot.modelId,
                );
                const supportsReasoning = modelSupportsReasoning(currentModel);
                const supportsSearch = modelSupportsSearch(currentModel);
                const supportsTools = modelSupportsTools(currentModel);

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
                          type: pa.type,
                          mimeType: pa.mimeType,
                          data: pa.data,
                          width: pa.width,
                          height: pa.height,
                          size: pa.size,
                          ...(pa.filename ? { filename: pa.filename } : {}),
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
                let hasPdfAttachment = false;

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
                            if (
                                msgAttachments.some(
                                    (attachment) =>
                                        attachment.type === "file" &&
                                        attachment.mimeType ===
                                            "application/pdf",
                                )
                            ) {
                                hasPdfAttachment = true;
                            }
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
                    if (
                        m.role === "assistant" &&
                        m.toolCalls &&
                        m.toolCalls.length > 0
                    ) {
                        outgoing.tool_calls = m.toolCalls;
                    }
                    if (m.role === "tool") {
                        if (m.toolCallId) outgoing.tool_call_id = m.toolCallId;
                        if (m.toolName) outgoing.name = m.toolName;
                    }
                    currentMessages.push(outgoing);
                }

                const newUserAttachments: Attachment[] | undefined =
                    pendingAttachments?.map((pa) => ({
                        id: generateUUID(),
                        messageId: "",
                        type: pa.type,
                        mimeType: pa.mimeType,
                        data: pa.data,
                        width: pa.width,
                        height: pa.height,
                        size: pa.size,
                        ...(pa.filename ? { filename: pa.filename } : {}),
                        ...(pa.url ? { url: pa.url } : {}),
                        createdAt: Date.now(),
                    }));
                if (
                    newUserAttachments?.some(
                        (attachment) =>
                            attachment.type === "file" &&
                            attachment.mimeType === "application/pdf",
                    )
                ) {
                    hasPdfAttachment = true;
                }

                const plugins: OpenRouterPlugin[] | undefined =
                    hasPdfAttachment && pdfParserEngine !== "auto"
                        ? [
                              {
                                  id: "file-parser",
                                  pdf: { engine: pdfParserEngine },
                              },
                          ]
                        : undefined;

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

                const cachedSystemPrefix = promptCacheEnabled
                    ? buildCachedSystemPrefix(skillForMessage)
                    : undefined;
                const functionTools = supportsTools
                    ? getFunctionToolsForIds(skillForMessage?.toolIds)
                    : [];

                let currentAssistantMessage = await addMessage({
                    role: "assistant",
                    content: "",
                    contextContent: "",
                    skill: null,
                    modelId: chatSnapshot.modelId,
                    thinkingLevel: effectiveThinking,
                    searchLevel: effectiveSearchLevel,
                    createdAt: nextMessageTimestamp(),
                    chatId: chatSnapshot.id,
                });
                assistantMessageId = currentAssistantMessage.id;
                queueStreamingMessageUpdate({
                    id: currentAssistantMessage.id,
                    content: "",
                    thinking: undefined,
                });

                for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
                    fullResponse = "";
                    fullThinking = "";

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
                                id: currentAssistantMessage.id,
                                content: fullResponse,
                                thinking: fullThinking || undefined,
                            });
                        },
                        {
                            cacheControl: promptCacheEnabled,
                            systemPrefix: cachedSystemPrefix,
                            responseFormat: structuredOutputJson
                                ? { type: "json_object" }
                                : undefined,
                            providerSort:
                                providerSort === "default"
                                    ? undefined
                                    : providerSort,
                            plugins,
                            functionTools,
                            toolChoice:
                                functionTools.length > 0 ? "auto" : undefined,
                            parallelToolCalls:
                                functionTools.length > 0 ? true : undefined,
                        },
                    );

                    const trimmedResponse =
                        trimTrailingEmptyLines(fullResponse) ?? "";
                    const trimmedThinking =
                        trimTrailingEmptyLines(fullThinking);
                    const usage = toMessageUsage(response.usage) ?? undefined;
                    const choice = response.choices[0];
                    const reasoningDetails = choice?.message.reasoningDetails;
                    const toolCalls = choice?.message.tool_calls ?? [];

                    if (
                        choice?.finish_reason === "tool_calls" &&
                        toolCalls.length > 0
                    ) {
                        const executions = toolCalls.map((call) => ({
                            id: call.id,
                            name: call.function.name,
                            arguments: call.function.arguments,
                            status: "pending" as const,
                        }));

                        await updateMessage(currentAssistantMessage.id, {
                            content: trimmedResponse,
                            contextContent: trimmedResponse,
                            thinking: trimmedThinking || undefined,
                            usage,
                            reasoningDetails,
                            toolCalls,
                            toolExecutions: executions,
                        });

                        currentMessages.push({
                            role: "assistant",
                            content: trimmedResponse,
                            reasoning_details: reasoningDetails,
                            tool_calls: toolCalls,
                        });

                        const completedExecutions = await Promise.all(
                            toolCalls.map(async (call) => {
                                const base = {
                                    id: call.id,
                                    name: call.function.name,
                                    arguments: call.function.arguments,
                                };

                                if (!isKnownLocalTool(call.function.name)) {
                                    const error = `Unknown local tool: ${call.function.name}`;
                                    return {
                                        ...base,
                                        status: "error" as const,
                                        error,
                                        content: buildToolResultContent({
                                            call,
                                            error,
                                        }),
                                    };
                                }

                                try {
                                    const result =
                                        await executeLocalToolCall(call);
                                    return {
                                        ...base,
                                        status: "success" as const,
                                        result,
                                        content: buildToolResultContent({
                                            call,
                                            result,
                                        }),
                                    };
                                } catch (toolError) {
                                    const error =
                                        toolError instanceof Error
                                            ? toolError.message
                                            : "Tool execution failed";
                                    return {
                                        ...base,
                                        status: "error" as const,
                                        error,
                                        content: buildToolResultContent({
                                            call,
                                            error,
                                        }),
                                    };
                                }
                            }),
                        );

                        await updateMessage(currentAssistantMessage.id, {
                            toolExecutions: completedExecutions.map(
                                ({ content: _content, ...execution }) =>
                                    execution,
                            ),
                        });

                        for (const execution of completedExecutions) {
                            await addMessage({
                                role: "tool",
                                content: execution.content,
                                contextContent: execution.content,
                                skill: null,
                                modelId: chatSnapshot.modelId,
                                thinkingLevel: effectiveThinking,
                                searchLevel: effectiveSearchLevel,
                                toolCallId: execution.id,
                                toolName: execution.name,
                                createdAt: nextMessageTimestamp(),
                                chatId: chatSnapshot.id,
                            });
                            currentMessages.push({
                                role: "tool",
                                content: execution.content,
                                tool_call_id: execution.id,
                                name: execution.name,
                            });
                        }

                        if (round === MAX_TOOL_ROUNDS) {
                            throw new Error(
                                "Tool call limit reached before the assistant produced a final response.",
                            );
                        }

                        currentAssistantMessage = await addMessage({
                            role: "assistant",
                            content: "",
                            contextContent: "",
                            skill: null,
                            modelId: chatSnapshot.modelId,
                            thinkingLevel: effectiveThinking,
                            searchLevel: effectiveSearchLevel,
                            createdAt: nextMessageTimestamp(),
                            chatId: chatSnapshot.id,
                        });
                        assistantMessageId = currentAssistantMessage.id;
                        queueStreamingMessageUpdate({
                            id: currentAssistantMessage.id,
                            content: "",
                            thinking: undefined,
                        });
                        continue;
                    }

                    await updateMessage(currentAssistantMessage.id, {
                        content: trimmedResponse,
                        contextContent: trimmedResponse,
                        thinking: trimmedThinking || undefined,
                        usage,
                        reasoningDetails,
                    });
                    break;
                }
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
            providerSort,
            pdfParserEngine,
            queueStreamingMessageUpdate,
            selectedSkill,
            setDefaultModel,
            setDefaultSearchLevel,
            setDefaultThinking,
            storageAdapter,
            structuredOutputJson,
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
