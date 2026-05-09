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
}

export function buildChatCompletionRequest(
    options: BuildRequestOptions,
): ChatCompletionRequest {
    const { messages, session, model, stream } = options;

    const searchEnabled =
        session.searchLevel !== "none" && modelSupportsSearch(model);

    const requestMessages = searchEnabled
        ? [
              {
                  role: "system",
                  content: WEB_SEARCH_SYSTEM_GUIDANCE,
              },
              ...messages,
          ]
        : messages;

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
