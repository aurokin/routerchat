import type { ChatSession, Attachment } from "@/lib/types";
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
    OpenRouterApiErrorImpl,
    validateApiKey,
    type OpenRouterMessage,
    type ChatSession as SharedChatSession,
} from "@shared/core/openrouter";

export type {
    TextContent,
    ImageUrlContent,
    MessageContent,
    ChatCompletionRequest,
    ChatCompletionResponse,
};

export {
    fetchModels,
    buildMessageContent,
    validateApiKey,
    sendMessage,
    extractReasoningText,
};
export { OpenRouterApiErrorImpl as OpenRouterApiError };

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
