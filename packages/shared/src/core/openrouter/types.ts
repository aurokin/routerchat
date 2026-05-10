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

/**
 * File attachment content block (e.g., PDFs). `file_data` accepts either a
 * `data:application/pdf;base64,...` URL or a public `https://` URL.
 *
 * Docs: https://openrouter.ai/docs/features/multimodal/pdfs
 */
export type FileContent = {
    type: "file";
    file: {
        filename: string;
        file_data: string;
    };
};

export type MessageContent =
    | string
    | Array<TextContent | ImageUrlContent | FileContent>;

export interface OpenRouterMessage {
    role: string;
    content: MessageContent;
    /**
     * When present on an assistant message, the provider treats these as its
     * prior reasoning blocks. Pass them back unmodified — Anthropic relies on
     * the `signature` on `reasoning.encrypted` chunks for cross-turn
     * continuity.
     */
    reasoning_details?: ReasoningDetailChunk[];
    /**
     * Tool calls emitted by the assistant. Replay on follow-up turns so the
     * provider sees its prior tool invocations.
     */
    tool_calls?: ToolCall[];
    /** Set on `role: "tool"` messages — references the originating tool_call. */
    tool_call_id?: string;
    /** Optional name (function name) on `role: "tool"` messages. */
    name?: string;
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

/**
 * Function-calling tool definition. `parameters` is a JSON Schema describing
 * the function's argument shape; the model replies with a JSON-encoded
 * argument string conforming to the schema in `tool_calls[].function.arguments`.
 *
 * Docs: https://openrouter.ai/docs/features/tool-calling
 */
export interface FunctionDefinition {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
}

export interface FunctionTool {
    type: "function";
    function: FunctionDefinition;
}

export type OpenRouterTool = WebSearchTool | FunctionTool;

/**
 * Controls when (and whether) the model can call tools.
 * - `"auto"` (default): model decides
 * - `"none"`: disabled, even if tools are sent
 * - `"required"`: must call at least one tool
 * - object form: must call the named function
 */
export type ToolChoice =
    | "none"
    | "auto"
    | "required"
    | { type: "function"; function: { name: string } };

/**
 * Assistant-emitted tool invocation. `arguments` is a JSON-encoded **string**
 * — stream consumers must reassemble it across chunks before parsing. Callers
 * MUST wrap any `JSON.parse(call.function.arguments)` in `try/catch`: the
 * model can emit invalid or truncated JSON (notably when `finish_reason` is
 * `"length"`), and this library does not validate or pre-parse it.
 */
export interface ToolCall {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
}

/**
 * Streaming `delta.tool_calls[]` entry. Fields arrive piecemeal: `index` is
 * always present; `id` / `type` / `function.name` typically arrive in the
 * first chunk for a given index; `function.arguments` arrives as concatenated
 * string fragments across many chunks. Consumers merge by `index`.
 */
export interface ToolCallDelta {
    index: number;
    id?: string;
    type?: "function";
    function?: {
        name?: string;
        arguments?: string;
    };
}

/**
 * OpenRouter plugin spec. Currently only `file-parser` is modelled — used to
 * pin a specific PDF parsing engine. When omitted, OpenRouter picks
 * native-or-default automatically (recommended for general chat).
 *
 * Engines:
 * - `mistral-ocr` — best for scanned/image-heavy PDFs, $2 per 1k pages
 * - `pdf-text` / `cloudflare-ai` — markdown extraction, free
 * - `native` — forward PDF directly to models with native file input
 *
 * Docs: https://openrouter.ai/docs/features/multimodal/pdfs#parser-engines
 */
export type FileParserPlugin = {
    id: "file-parser";
    pdf?: {
        engine: "mistral-ocr" | "pdf-text" | "cloudflare-ai" | "native";
    };
};

export type OpenRouterPlugin = FileParserPlugin;

/**
 * Provider-routing knob (rough proxy for cheapest / fastest / lowest-latency).
 * When set, OpenRouter orders endpoints by the metric instead of load-balancing.
 *
 * Docs: https://openrouter.ai/docs/features/provider-routing#sorting
 */
export type ProviderSort = "price" | "throughput" | "latency";

export interface ProviderPreferences {
    sort?: ProviderSort;
}

/**
 * Structured-output request format. `json_object` asks the model to return
 * any valid JSON; `json_schema` constrains the response to a supplied schema
 * (provider-enforced where supported, prompt-only fallback elsewhere).
 *
 * Docs: https://openrouter.ai/docs/features/structured-outputs
 */
export type ResponseFormat =
    | { type: "json_object" }
    | {
          type: "json_schema";
          json_schema: {
              name: string;
              strict?: boolean;
              schema: Record<string, unknown>;
          };
      };

export interface StreamOptions {
    include_usage?: boolean;
}

export interface ChatCompletionRequest {
    model: string;
    messages: OpenRouterMessage[];
    reasoning?: ReasoningOptions;
    tools?: OpenRouterTool[];
    tool_choice?: ToolChoice;
    parallel_tool_calls?: boolean;
    provider?: ProviderPreferences;
    response_format?: ResponseFormat;
    plugins?: OpenRouterPlugin[];
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
            reasoningDetails?: ReasoningDetailChunk[];
            tool_calls?: ToolCall[];
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
