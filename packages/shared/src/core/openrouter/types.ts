/**
 * `cache_control` is the OpenRouter prompt-cache marker. Providers that
 * honour it (e.g. Anthropic) will serve marked content from cache when the
 * prefix matches a recent request.
 *
 * Docs: https://openrouter.ai/docs/features/prompt-caching
 */
export type CacheControl = { type: "ephemeral" };

export type TextContent = {
    type: "text";
    text: string;
    cache_control?: CacheControl;
};

export type ImageUrlContent = {
    type: "image_url";
    image_url: {
        url: string;
    };
};

export type MessageContent = string | Array<TextContent | ImageUrlContent>;

export interface OpenRouterMessage {
    role: string;
    content: MessageContent;
}

export type ReasoningEffort = "high" | "medium" | "low" | "minimal";

export interface ReasoningOptions {
    effort: ReasoningEffort;
}

/**
 * Modern web-search tool — replaces the deprecated
 * `plugins:[{id:"web", max_results}]` shape.
 *
 * https://openrouter.ai/docs/guides/features/server-tools/web-search
 */
export interface WebSearchTool {
    type: "openrouter:web_search";
    parameters?: {
        max_results?: number;
        search_context_size?: "low" | "medium" | "high";
    };
}

export type OpenRouterTool = WebSearchTool;

export interface StreamOptions {
    include_usage?: boolean;
}

export interface ChatCompletionRequest {
    model: string;
    messages: OpenRouterMessage[];
    reasoning?: ReasoningOptions;
    tools?: OpenRouterTool[];
    stream?: boolean;
    stream_options?: StreamOptions;
}

export interface UsageDetails {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    /** Inline cost when the response server reports it. */
    cost?: number;
    /** Cache breakdown — present on providers that support prompt caching. */
    prompt_tokens_details?: {
        cached_tokens?: number;
    };
    cache_discount?: number;
    /** Server-tool usage breakdown — only present when web search ran. */
    server_tool_use?: {
        web_search_requests?: number;
    };
}

export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
            thinking?: string;
        };
        finish_reason: string;
    }>;
    usage: UsageDetails;
}

export interface OpenRouterApiModel {
    id: string;
    owned_by: string;
    supported_parameters?: string[];
    architecture?: {
        input_modalities?: string[];
        output_modalities?: string[];
    };
}

export interface ReasoningDetailChunk {
    id: string;
    type: "reasoning.text" | "reasoning.summary" | "reasoning.encrypted";
    format?: string;
    text?: string;
    signature?: string;
}

export interface ChatSession {
    id: string;
    modelId: string;
    thinking: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
    searchLevel: "none" | "low" | "medium" | "high";
}

export function extractReasoningText(details: ReasoningDetailChunk[]): string {
    return details
        .filter(
            (d) =>
                (d.type === "reasoning.text" ||
                    d.type === "reasoning.summary") &&
                d.text,
        )
        .map((d) => d.text)
        .join("");
}
