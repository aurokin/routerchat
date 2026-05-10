"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChat } from "@/contexts/ChatContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useStorageAdapter } from "@/contexts/SyncContext";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatErrorBanner } from "./ChatErrorBanner";
import { ChatUsageSummary } from "./ChatUsageSummary";
import {
    applyStreamingMessageOverlay,
    useStreamingMessage,
} from "./hooks/useStreamingMessage";
import { useChatKeybindings } from "./hooks/useChatKeybindings";
import { getChatTitleUpdate, useSendMessage } from "./hooks/useSendMessage";
import {
    modelSupportsSearch,
    modelSupportsReasoning,
    modelSupportsVision,
    type ThinkingLevel,
    type SearchLevel,
} from "@/lib/types";
import { APP_DEFAULT_MODEL } from "@shared/core/models";
import { type Skill, getSkillSelectionUpdate } from "@shared/core/skills";
import {
    applyModelCapabilities,
    getLastUserSettings,
    resolveInitialChatSettings,
} from "@shared/core/defaults";

export { applyStreamingMessageOverlay, getChatTitleUpdate };

export function ChatWindow() {
    const {
        currentChat,
        messages,
        isMessagesLoading,
        addMessage,
        updateMessage,
        updateChat,
        createChat,
    } = useChat();
    const {
        apiKey,
        defaultModel,
        defaultThinking,
        defaultSearchLevel,
        setDefaultModel,
        setDefaultThinking,
        setDefaultSearchLevel,
        selectedSkill,
        defaultSkill,
        selectedSkillMode,
        setSelectedSkill,
        models,
        favoriteModels,
        skills,
    } = useSettings();
    const storageAdapter = useStorageAdapter();

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const lastSkillChangeRef = useRef<{
        skill: Skill | null;
        mode: "auto" | "manual";
    }>({
        skill: selectedSkill,
        mode: selectedSkillMode,
    });
    const lastInitializedChatIdRef = useRef<string | null>(null);

    const updateSelectedSkill = useCallback(
        (skill: Skill | null, options?: { mode?: "auto" | "manual" }) => {
            const mode = options?.mode ?? "manual";
            lastSkillChangeRef.current = { skill, mode };
            setSelectedSkill(skill, { mode });
        },
        [setSelectedSkill],
    );

    const {
        streamingMessage,
        queueStreamingMessageUpdate,
        clearStreamingMessage,
    } = useStreamingMessage();

    const { sending, error, handleSendMessage, handleRetry } = useSendMessage({
        apiKey,
        currentChat,
        messages,
        selectedSkill,
        models,
        storageAdapter,
        getLastSkillChange: useCallback(() => lastSkillChangeRef.current, []),
        addMessage,
        updateMessage,
        updateChat,
        setDefaultModel,
        setDefaultThinking,
        setDefaultSearchLevel,
        updateSelectedSkill,
        queueStreamingMessageUpdate,
        clearStreamingMessage,
    });

    useEffect(() => {
        lastSkillChangeRef.current = {
            skill: selectedSkill,
            mode: selectedSkillMode,
        };
    }, [selectedSkill, selectedSkillMode]);

    useEffect(() => {
        if (!currentChat) {
            lastInitializedChatIdRef.current = null;
        }
    }, [currentChat]);

    const displayedMessages = useMemo(() => {
        return applyStreamingMessageOverlay(messages, streamingMessage);
    }, [messages, streamingMessage]);

    useEffect(() => {
        if (!currentChat || isMessagesLoading) return;
        if (lastInitializedChatIdRef.current === currentChat.id) return;
        const messagesMatchChat =
            messages.length === 0 ||
            messages.every((message) => message.sessionId === currentChat.id);
        if (!messagesMatchChat) return;

        const fallbackModelId =
            defaultModel || currentChat.modelId || APP_DEFAULT_MODEL;
        const defaults = {
            modelId: fallbackModelId,
            thinking: defaultThinking,
            searchLevel: defaultSearchLevel,
        };
        const lastUserSettings = getLastUserSettings(messages);
        const resolvedSettings = resolveInitialChatSettings({
            messageCount: messages.length,
            defaults,
            lastUser: lastUserSettings,
        });
        const modelForSettings = models.find(
            (model) => model.id === resolvedSettings.modelId,
        );
        const constrainedSettings = applyModelCapabilities(resolvedSettings, {
            supportsReasoning: modelForSettings
                ? modelSupportsReasoning(modelForSettings)
                : true,
            supportsSearch: modelForSettings
                ? modelSupportsSearch(modelForSettings)
                : true,
        });

        if (
            constrainedSettings.modelId !== currentChat.modelId ||
            constrainedSettings.thinking !== currentChat.thinking ||
            constrainedSettings.searchLevel !== currentChat.searchLevel
        ) {
            void updateChat({
                ...currentChat,
                modelId: constrainedSettings.modelId,
                thinking: constrainedSettings.thinking,
                searchLevel: constrainedSettings.searchLevel,
            });
        }
        lastInitializedChatIdRef.current = currentChat.id;
    }, [
        currentChat,
        defaultModel,
        defaultThinking,
        defaultSearchLevel,
        isMessagesLoading,
        messages,
        models,
        updateChat,
    ]);

    useEffect(() => {
        if (!currentChat || isMessagesLoading) return;
        const nextSkill = getSkillSelectionUpdate({
            messageCount: messages.length,
            defaultSkill,
            selectedSkill,
            selectedSkillMode,
        });
        if (nextSkill !== undefined) {
            updateSelectedSkill(nextSkill, { mode: "auto" });
        }
    }, [
        currentChat,
        defaultSkill,
        isMessagesLoading,
        messages.length,
        selectedSkill,
        selectedSkillMode,
        updateSelectedSkill,
    ]);

    useEffect(() => {
        if (currentChat && inputRef.current) {
            inputRef.current.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentChat?.id]);

    useChatKeybindings({
        inputRef,
        currentChat,
        models,
        favoriteModels,
        skills,
        selectedSkill,
        updateChat,
        setDefaultModel,
        setDefaultThinking,
        setDefaultSearchLevel,
        updateSelectedSkill,
    });

    const handleModelChange = async (modelId: string) => {
        if (!currentChat) return;
        const nextModel = models.find((model) => model.id === modelId);
        const supportsReasoning = nextModel
            ? modelSupportsReasoning(nextModel)
            : true;
        const supportsSearch = nextModel
            ? modelSupportsSearch(nextModel)
            : true;
        const nextThinking = supportsReasoning ? currentChat.thinking : "none";
        const nextSearchLevel = supportsSearch
            ? currentChat.searchLevel
            : "none";
        await updateChat({
            ...currentChat,
            modelId,
            thinking: nextThinking,
            searchLevel: nextSearchLevel,
        });
        setDefaultModel(modelId);
    };

    const handleThinkingChange = async (value: ThinkingLevel) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, thinking: value });
        setDefaultThinking(value);
    };

    const handleSearchChange = async (level: SearchLevel) => {
        if (!currentChat) return;
        await updateChat({ ...currentChat, searchLevel: level });
        setDefaultSearchLevel(level);
    };

    if (!currentChat) {
        return <ChatEmptyState onCreateChat={() => createChat()} />;
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
            {/* Decorative top line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            {error && (
                <ChatErrorBanner
                    error={error}
                    sending={sending}
                    onRetry={handleRetry}
                />
            )}

            <ChatUsageSummary messages={messages} />

            <div className="flex-1 overflow-y-auto relative z-10">
                <MessageList messages={displayedMessages} sending={sending} />
            </div>

            <div className="border-t border-border p-4 bg-background-elevated/30 relative z-10">
                <MessageInput
                    ref={inputRef}
                    onSend={handleSendMessage}
                    disabled={false}
                    canSend={!sending}
                    selectedModel={currentChat.modelId}
                    onModelChange={handleModelChange}
                    thinkingLevel={currentChat.thinking}
                    onThinkingChange={handleThinkingChange}
                    reasoningSupported={modelSupportsReasoning(
                        models.find((m) => m.id === currentChat.modelId),
                    )}
                    searchLevel={currentChat.searchLevel}
                    onSearchChange={handleSearchChange}
                    searchSupported={modelSupportsSearch(
                        models.find((m) => m.id === currentChat.modelId),
                    )}
                    visionSupported={modelSupportsVision(
                        models.find((m) => m.id === currentChat.modelId),
                    )}
                    sessionId={currentChat.id}
                />
            </div>
        </div>
    );
}
