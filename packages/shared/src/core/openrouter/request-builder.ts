import type { Attachment } from "../types";
import type { OpenRouterModel } from "../models";
import { WEB_SEARCH_SYSTEM_GUIDANCE } from "./constants";
import { buildReasoningOptions } from "./reasoning";
import { buildWebSearchTool, modelSupportsSearch } from "./web-search";
import type {
    ChatCompletionRequest,
    ChatSession,
    FunctionTool,
    ImageUrlContent,
    OpenRouterMessage,
    OpenRouterPlugin,
    ProviderSort,
    ResponseFormat,
    TextContent,
    ToolChoice,
} from "./types";

export function buildMessageContent(
    text: string,
    attachments?: Attachment[],
): string | Array<TextContent | ImageUrlContent> {
    if (!attachments || attachments.length === 0) {
        return text;
    }

    const content: Array<TextContent | ImageUrlContent> = [];

    for (const attachment of attachments) {
        // URL-passthrough attachments carry a remote image URL; everything
        // else is locally-stored bytes we encode as a data URI.
        const url =
            attachment.url ??
            `data:${attachment.mimeType};base64,${attachment.data}`;
        content.push({
            type: "image_url",
            image_url: { url },
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
    /**
     * Provider-routing sort preference. When set, emits a `provider.sort`
     * field so OpenRouter orders endpoints by the named metric instead of
     * load-balancing. Omit (or pass `undefined`) to leave the field off.
     */
    providerSort?: ProviderSort;
    /**
     * Constrains the model's reply to JSON (free-form or schema-validated).
     * Pass-through to OpenRouter's `response_format` field. UI surface for
     * configuring schemas is deferred — wire support lands first so callers
     * can opt in programmatically.
     */
    responseFormat?: ResponseFormat;
    /**
     * Top-level plugins (e.g. `file-parser` for PDF engine selection).
     * Pass-through to OpenRouter's `plugins` field. Omit to let OpenRouter
     * pick native-or-default automatically — recommended for general chat.
     */
    plugins?: OpenRouterPlugin[];
    /**
     * Function-calling tool definitions. Merged with the implicit web-search
     * tool when search is enabled. Pass-through to OpenRouter's `tools` field.
     */
    functionTools?: FunctionTool[];
    /** Mirrors OpenRouter's `tool_choice` — controls whether/which tool is invoked. */
    toolChoice?: ToolChoice;
    /** Mirrors OpenRouter's `parallel_tool_calls` flag. */
    parallelToolCalls?: boolean;
}

export function buildChatCompletionRequest(
    options: BuildRequestOptions,
): ChatCompletionRequest {
    const {
        messages,
        session,
        model,
        stream,
        cacheControl,
        systemPrefix,
        providerSort,
        responseFormat,
        plugins,
        functionTools,
        toolChoice,
        parallelToolCalls,
    } = options;

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

    const formattedMessages: OpenRouterMessage[] = requestMessages.map((m) => {
        const formatted: OpenRouterMessage = {
            role: m.role,
            content: m.content,
        };
        if (m.reasoning_details) {
            formatted.reasoning_details = m.reasoning_details;
        }
        if (m.tool_calls) {
            formatted.tool_calls = m.tool_calls;
        }
        if (m.tool_call_id) {
            formatted.tool_call_id = m.tool_call_id;
        }
        if (m.name) {
            formatted.name = m.name;
        }
        return formatted;
    });

    const requestBody: ChatCompletionRequest = {
        model: session.modelId,
        messages: formattedMessages,
        stream,
    };

    if (stream) {
        requestBody.stream_options = { include_usage: true };
    }

    // User-supplied function tools land before the implicit web-search tool
    // so that any downstream tool-count cap (e.g. Anthropic via OR) truncates
    // server-injected tools first rather than the user's.
    const tools: NonNullable<ChatCompletionRequest["tools"]> = [];
    if (functionTools && functionTools.length > 0) {
        tools.push(...functionTools);
    }
    if (searchEnabled) {
        const webTools = buildWebSearchTool(session.searchLevel);
        if (webTools) tools.push(...webTools);
    }
    if (tools.length > 0) {
        requestBody.tools = tools;
    }

    if (toolChoice !== undefined) {
        requestBody.tool_choice = toolChoice;
    }

    if (parallelToolCalls !== undefined) {
        requestBody.parallel_tool_calls = parallelToolCalls;
    }

    const reasoning = buildReasoningOptions(session.thinking, model);
    if (reasoning) {
        requestBody.reasoning = reasoning;
    }

    if (providerSort) {
        requestBody.provider = { sort: providerSort };
    }

    if (responseFormat) {
        requestBody.response_format = responseFormat;
    }

    if (plugins && plugins.length > 0) {
        requestBody.plugins = plugins;
    }

    return requestBody;
}
