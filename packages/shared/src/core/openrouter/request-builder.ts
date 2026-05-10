import type { Attachment } from "../types";
import type { OpenRouterModel } from "../models";
import { WEB_SEARCH_SYSTEM_GUIDANCE } from "./constants";
import { buildReasoningOptions } from "./reasoning";
import { buildWebSearchTool, modelSupportsSearch } from "./web-search";
import type {
    ChatCompletionRequest,
    ChatSession,
    ImageUrlContent,
    MessageContent,
    OpenRouterMessage,
    TextContent,
} from "./types";

export function buildMessageContent(
    text: string,
    attachments?: Attachment[],
): MessageContent {
    if (!attachments || attachments.length === 0) {
        return text;
    }

    const content: Array<TextContent | ImageUrlContent> = [];

    for (const attachment of attachments) {
        content.push({
            type: "image_url",
            image_url: {
                url: `data:${attachment.mimeType};base64,${attachment.data}`,
            },
        });
    }

    if (text) {
        content.push({
            type: "text",
            text,
        });
    }

    return content;
}

export interface BuildRequestOptions {
    messages: OpenRouterMessage[];
    session: ChatSession;
    model: OpenRouterModel | undefined;
    /** Whether this request will be streamed (controls `stream` and `stream_options`). */
    stream: boolean;
    /**
     * When true, mark stable prefixes (skill prompt + search guidance) with
     * `cache_control: ephemeral`. When provided alongside a non-empty
     * `systemPrefix`, the search guidance is folded into that single cached
     * system message rather than emitted as its own block.
     */
    cacheControl?: boolean;
    /**
     * Skill preamble to send as a leading system message. The send flow
     * passes this when the caller has stripped the skill from the user
     * messages so the cache prefix stays stable across requests.
     */
    systemPrefix?: string;
}

export function buildChatCompletionRequest(
    options: BuildRequestOptions,
): ChatCompletionRequest {
    const { messages, session, model, stream, cacheControl, systemPrefix } =
        options;

    const searchEnabled =
        session.searchLevel !== "none" && modelSupportsSearch(model);

    const trimmedPrefix = systemPrefix?.trim() ?? "";
    const useCachedSystem = !!cacheControl && trimmedPrefix.length > 0;

    let requestMessages: OpenRouterMessage[];
    if (useCachedSystem) {
        const cachedText = searchEnabled
            ? `${trimmedPrefix}\n\n${WEB_SEARCH_SYSTEM_GUIDANCE}`
            : trimmedPrefix;
        requestMessages = [
            {
                role: "system",
                content: [
                    {
                        type: "text",
                        text: cachedText,
                        cache_control: { type: "ephemeral" },
                    },
                ],
            },
            ...messages,
        ];
    } else if (searchEnabled) {
        requestMessages = [
            {
                role: "system",
                content: WEB_SEARCH_SYSTEM_GUIDANCE,
            },
            ...messages,
        ];
    } else {
        requestMessages = messages;
    }

    const formattedMessages = requestMessages.map((m) => ({
        role: m.role,
        content: m.content,
    }));

    const requestBody: ChatCompletionRequest = {
        model: session.modelId,
        messages: formattedMessages,
        stream,
    };

    if (stream) {
        requestBody.stream_options = { include_usage: true };
    }

    if (searchEnabled) {
        const tools = buildWebSearchTool(session.searchLevel);
        if (tools) {
            requestBody.tools = tools;
        }
    }

    const reasoning = buildReasoningOptions(session.thinking, model);
    if (reasoning) {
        requestBody.reasoning = reasoning;
    }

    return requestBody;
}
