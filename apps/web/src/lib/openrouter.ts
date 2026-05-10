import type { ChatSession, Attachment } from "@/lib/types";
export type { SendMessageOptions } from "@shared/core/openrouter";
import {
    SupportedParameter,
    modelSupportsReasoning,
    modelSupportsSearch,
} from "@shared/core/models";
import {
    parseOpenRouterError,
    parseMidStreamError,
    type OpenRouterError,
} from "@shared/core/errors";
import {
    buildMessageContent,
    extractReasoningText,
    type TextContent,
    type ImageUrlContent,
    type MessageContent,
    type ChatCompletionRequest,
    type ChatCompletionResponse,
    type OpenRouterApiModel,
    type ReasoningDetailChunk,
    fetchModels,
    sendMessage,
    toMessageUsage,
    OpenRouterApiErrorImpl,
    validateApiKey,
    getKeyInfo,
    type KeyInfo,
    type OpenRouterMessage,
    type ChatSession as SharedChatSession,
} from "@shared/core/openrouter";

export type {
    TextContent,
    ImageUrlContent,
    MessageContent,
    ChatCompletionRequest,
    ChatCompletionResponse,
    KeyInfo,
};

export {
    fetchModels,
    buildMessageContent,
    validateApiKey,
    getKeyInfo,
    sendMessage,
    toMessageUsage,
    extractReasoningText,
};
export { OpenRouterApiErrorImpl as OpenRouterApiError };
