import type { OpenRouterModel } from "../models";
import { SupportedParameter } from "../models";
import type { Attachment } from "../types";
import type { OpenRouterError } from "../errors";
import { parseOpenRouterError, parseMidStreamError } from "../errors";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

const WEB_SEARCH_SYSTEM_GUIDANCE =
    "Web search is available for this request. When the user asks to keep searching, verify, retry, or find more sources, run fresh web searches using the conversation context instead of relying only on earlier search snippets. If results are weak, reformulate and search again before concluding data is unavailable.";

export type TextContent = {
    type: "text";
    text: string;
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

export interface ChatCompletionRequest {
    model: string;
    messages: OpenRouterMessage[];
    reasoning?: {
        effort: "xhigh" | "high" | "medium" | "low" | "minimal";
    };
    plugins?: Array<{ id: string; max_results?: number }>;
    stream?: boolean;
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
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface OpenRouterApiError extends Error {
    code: number;
    isRetryable: boolean;
    metadata?: {
        providerName?: string;
        rawError?: unknown;
        moderationReasons?: string[];
        flaggedInput?: string;
    };
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

function applyStreamDelta(
    data: string,
    onChunk: (chunk: string, thinking?: string) => void,
): {
    contentDelta: string;
    thinkingDelta: string;
    streamComplete: boolean;
    parsed: boolean;
} {
    if (data === "[DONE]") {
        return {
            contentDelta: "",
            thinkingDelta: "",
            streamComplete: true,
            parsed: true,
        };
    }

    let contentDelta = "";
    let thinkingDelta = "";
    let streamComplete = false;
    let parsed = false;

    try {
        const parsedChunk = JSON.parse(data);
        parsed = true;

        const streamError = parseMidStreamError(parsedChunk);
        if (streamError) {
            throw new OpenRouterApiErrorImpl(streamError);
        }

        const choice = parsedChunk.choices?.[0];
        if (choice?.delta?.content) {
            contentDelta = choice.delta.content;
            onChunk(contentDelta);
        }
        if (choice?.delta?.reasoning_details) {
            const reasoningText = extractReasoningText(
                choice.delta.reasoning_details as ReasoningDetailChunk[],
            );
            if (reasoningText) {
                thinkingDelta += reasoningText;
                onChunk("", reasoningText);
            }
        }
        if (choice?.delta?.thinking) {
            thinkingDelta += choice.delta.thinking;
            onChunk("", choice.delta.thinking);
        }
        if (choice?.finish_reason && choice.finish_reason !== "error") {
            streamComplete = true;
        }
    } catch (err) {
        if (err instanceof OpenRouterApiErrorImpl) {
            throw err;
        }
    }

    return { contentDelta, thinkingDelta, streamComplete, parsed };
}

function consumeStreamText(
    text: string,
    onChunk: (chunk: string, thinking?: string) => void,
): {
    content: string;
    thinking: string;
    streamComplete: boolean;
    sawData: boolean;
} {
    const lines = text.split(/\r?\n/);
    let content = "";
    let thinking = "";
    let streamComplete = false;
    let sawData = false;

    for (const line of lines) {
        if (!line.startsWith("data: ")) {
            continue;
        }
        const data = line.slice(6).trim();
        if (!data) {
            continue;
        }
        const result = applyStreamDelta(data, onChunk);
        if (result.parsed) {
            sawData = true;
        }
        if (result.contentDelta) {
            content += result.contentDelta;
        }
        if (result.thinkingDelta) {
            thinking += result.thinkingDelta;
        }
        if (result.streamComplete) {
            streamComplete = true;
        }
    }

    return { content, thinking, streamComplete, sawData };
}

interface StreamParseState {
    content: string;
    thinking: string;
    streamComplete: boolean;
    sawData: boolean;
    rawText: string;
}

function createSseParser(onChunk: (chunk: string, thinking?: string) => void): {
    push: (text: string) => boolean;
    flush: () => boolean;
    getState: () => StreamParseState;
} {
    let buffer = "";
    let content = "";
    let thinking = "";
    let streamComplete = false;
    let sawData = false;
    let rawText = "";

    const applyLine = (line: string) => {
        if (!line.startsWith("data: ")) {
            return;
        }
        const data = line.slice(6).trim();
        if (!data) {
            return;
        }
        const result = applyStreamDelta(data, onChunk);
        if (result.parsed) {
            sawData = true;
        }
        if (result.contentDelta) {
            content += result.contentDelta;
        }
        if (result.thinkingDelta) {
            thinking += result.thinkingDelta;
        }
        if (result.streamComplete) {
            streamComplete = true;
        }
    };

    const push = (text: string) => {
        rawText += text;
        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
            applyLine(line);
        }
        return streamComplete;
    };

    const flush = () => {
        const trimmed = buffer.trim();
        buffer = "";
        if (!trimmed) {
            return streamComplete;
        }
        applyLine(trimmed);
        return streamComplete;
    };

    const getState = () => ({
        content,
        thinking,
        streamComplete,
        sawData,
        rawText,
    });

    return { push, flush, getState };
}

function buildStreamingResponse(session: ChatSession): ChatCompletionResponse {
    return {
        id: "streaming",
        object: "chat.completion",
        created: Date.now(),
        model: session.modelId,
        choices: [],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
}

function parseStreamingTextResult(
    fallbackText: string,
    session: ChatSession,
    onChunk: (chunk: string, thinking?: string) => void,
): ChatCompletionResponse {
    if (fallbackText.trim()) {
        const streamResult = consumeStreamText(fallbackText, onChunk);
        if (streamResult.sawData) {
            return {
                id: "streaming",
                object: "chat.completion",
                created: Date.now(),
                model: session.modelId,
                choices: [
                    {
                        index: 0,
                        message: {
                            role: "assistant",
                            content: streamResult.content,
                            thinking: streamResult.thinking || undefined,
                        },
                        finish_reason: streamResult.streamComplete
                            ? "stop"
                            : "length",
                    },
                ],
                usage: {
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                },
            };
        }

        try {
            const parsed = JSON.parse(fallbackText) as ChatCompletionResponse;
            const content = parsed.choices?.[0]?.message?.content;
            const thinking = parsed.choices?.[0]?.message?.thinking;
            if (content) {
                onChunk(content);
            }
            if (thinking) {
                onChunk("", thinking);
            }
            return parsed;
        } catch {
            // fall through to error below
        }
    }

    throw new OpenRouterApiErrorImpl({
        code: 0,
        message: "No response body",
        userMessage: "No response from server. Please try again.",
        isRetryable: true,
    });
}

function finalizeStreamingState(
    state: StreamParseState,
    session: ChatSession,
    onChunk: (chunk: string, thinking?: string) => void,
): ChatCompletionResponse {
    if (state.sawData) {
        return buildStreamingResponse(session);
    }
    if (state.rawText.trim()) {
        return parseStreamingTextResult(state.rawText, session, onChunk);
    }
    throw new OpenRouterApiErrorImpl({
        code: 0,
        message: "No response body",
        userMessage: "No response from server. Please try again.",
        isRetryable: true,
    });
}

async function streamFromReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: (chunk: string, thinking?: string) => void,
): Promise<StreamParseState> {
    const decoder = new TextDecoder();
    const parser = createSseParser(onChunk);

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        parser.push(decoder.decode(value, { stream: true }));
        if (parser.getState().streamComplete) {
            await reader.cancel().catch(() => undefined);
            break;
        }
    }

    parser.flush();
    return parser.getState();
}

async function streamFromAsyncIterable(
    body: AsyncIterable<Uint8Array | string>,
    onChunk: (chunk: string, thinking?: string) => void,
): Promise<StreamParseState> {
    const decoder = new TextDecoder();
    const parser = createSseParser(onChunk);

    for await (const value of body) {
        const text =
            typeof value === "string"
                ? value
                : decoder.decode(value, { stream: true });
        parser.push(text);
        if (parser.getState().streamComplete) {
            break;
        }
    }

    parser.flush();
    return parser.getState();
}

function shouldUseXhrStreaming(): boolean {
    const isReactNative =
        typeof navigator !== "undefined" && navigator.product === "ReactNative";
    if (isReactNative) {
        return typeof XMLHttpRequest !== "undefined";
    }
    return (
        typeof XMLHttpRequest !== "undefined" &&
        typeof ReadableStream === "undefined"
    );
}

async function sendMessageWithXhr(
    apiKey: string,
    requestBody: ChatCompletionRequest,
    session: ChatSession,
    onChunk: (chunk: string, thinking?: string) => void,
): Promise<ChatCompletionResponse> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const parser = createSseParser(onChunk);
        let settled = false;
        let lastIndex = 0;

        const finalizeFromParser = () => {
            if (settled) return;
            settled = true;
            try {
                parser.flush();
                resolve(
                    finalizeStreamingState(parser.getState(), session, onChunk),
                );
            } catch (err) {
                reject(err);
            }
        };

        const processPendingText = () => {
            const responseText = xhr.responseText || "";
            if (responseText.length <= lastIndex) return false;
            const nextText = responseText.slice(lastIndex);
            lastIndex = responseText.length;
            return parser.push(nextText);
        };

        xhr.open("POST", `${OPENROUTER_API_BASE}/chat/completions`);
        xhr.setRequestHeader("Authorization", `Bearer ${apiKey}`);
        xhr.setRequestHeader("Content-Type", "application/json");

        xhr.onprogress = () => {
            if (settled) return;
            try {
                const completed = processPendingText();
                if (completed) {
                    xhr.abort();
                }
            } catch (err) {
                if (err instanceof OpenRouterApiErrorImpl) {
                    settled = true;
                    xhr.abort();
                    reject(err);
                }
            }
        };

        xhr.onload = () => {
            if (settled) return;
            try {
                processPendingText();
            } catch (err) {
                settled = true;
                reject(err);
                return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
                finalizeFromParser();
                return;
            }

            let body: unknown;
            try {
                body = xhr.responseText
                    ? JSON.parse(xhr.responseText)
                    : undefined;
            } catch {
                body = undefined;
            }
            const error = parseOpenRouterError(
                {
                    status: xhr.status,
                    statusText: xhr.statusText,
                } as Response,
                body,
            );
            settled = true;
            reject(new OpenRouterApiErrorImpl(error));
        };

        xhr.onabort = () => {
            if (settled) return;
            finalizeFromParser();
        };

        xhr.onerror = () => {
            if (settled) return;
            settled = true;
            reject(
                new OpenRouterApiErrorImpl({
                    code: 0,
                    message: "Network error",
                    userMessage: "Network error. Please try again.",
                    isRetryable: true,
                }),
            );
        };

        xhr.send(JSON.stringify(requestBody));
    });
}

function supportsTextModality(model: OpenRouterApiModel): boolean {
    const inputModalities = model.architecture?.input_modalities ?? [];
    const outputModalities = model.architecture?.output_modalities ?? [];
    return (
        inputModalities.includes("text") && outputModalities.includes("text")
    );
}

function supportsVisionInput(model: OpenRouterApiModel): boolean {
    const inputModalities = model.architecture?.input_modalities ?? [];
    return inputModalities.includes("image");
}

function mapSupportedParameters(
    params: string[] | undefined,
): SupportedParameter[] {
    if (!params) return [];
    const result: SupportedParameter[] = [];
    for (const param of params) {
        if (param === SupportedParameter.Tools) {
            result.push(SupportedParameter.Tools);
        } else if (param === SupportedParameter.Reasoning) {
            result.push(SupportedParameter.Reasoning);
        }
    }
    return result;
}

export async function fetchModels(): Promise<OpenRouterModel[]> {
    const response = await fetch(`${OPENROUTER_API_BASE}/models`);

    if (!response.ok) {
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            body = undefined;
        }
        const error = parseOpenRouterError(response, body);
        throw new OpenRouterApiErrorImpl(error);
    }

    const data = await response.json();
    return data.data
        .filter((model: OpenRouterApiModel) => supportsTextModality(model))
        .map((model: OpenRouterApiModel) => {
            const supportedParams = mapSupportedParameters(
                model.supported_parameters,
            );
            if (supportsVisionInput(model)) {
                supportedParams.push(SupportedParameter.Vision);
            }
            return {
                id: model.id,
                name: model.id.split("/").pop() || model.id,
                provider: model.owned_by,
                supportedParameters: supportedParams,
            };
        });
}

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

export class OpenRouterApiErrorImpl extends Error {
    public readonly code: number;
    public readonly isRetryable: boolean;
    public readonly metadata?: OpenRouterError["metadata"];

    constructor(error: OpenRouterError) {
        super(error.message);
        this.name = "OpenRouterApiError";
        this.code = error.code;
        this.isRetryable = error.isRetryable;
        this.metadata = error.metadata;
    }
}

export interface ChatSession {
    id: string;
    modelId: string;
    thinking: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
    searchLevel: "none" | "low" | "medium" | "high";
}

export async function sendMessage(
    apiKey: string,
    messages: OpenRouterMessage[],
    session: ChatSession,
    model: OpenRouterModel | undefined,
    onChunk?: (chunk: string, thinking?: string) => void,
): Promise<ChatCompletionResponse> {
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

    const effortMap: Record<
        string,
        "xhigh" | "high" | "medium" | "low" | "minimal"
    > = {
        xhigh: "xhigh",
        high: "high",
        medium: "medium",
        low: "low",
        minimal: "minimal",
    };

    const requestBody: ChatCompletionRequest = {
        model: session.modelId,
        messages: formattedMessages,
        stream: !!onChunk,
    };

    if (searchEnabled && session.searchLevel !== "none") {
        const maxResultsMap = { low: 3, medium: 6, high: 10 } as const;
        requestBody.plugins = [
            { id: "web", max_results: maxResultsMap[session.searchLevel] },
        ];
    }

    if (session.thinking !== "none" && modelSupportsReasoning(model)) {
        requestBody.reasoning = {
            effort: effortMap[session.thinking] || "medium",
        };
    }

    if (onChunk) {
        if (shouldUseXhrStreaming()) {
            return sendMessageWithXhr(apiKey, requestBody, session, onChunk);
        }

        const response = await fetch(
            `${OPENROUTER_API_BASE}/chat/completions`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            },
        );

        if (!response.ok) {
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                body = undefined;
            }
            const error = parseOpenRouterError(response, body);
            throw new OpenRouterApiErrorImpl(error);
        }

        const reader = response.body?.getReader?.();
        if (reader) {
            const streamState = await streamFromReader(reader, onChunk);
            return finalizeStreamingState(streamState, session, onChunk);
        }

        const asyncBody = response.body as
            | AsyncIterable<Uint8Array | string>
            | null
            | undefined;
        if (
            asyncBody &&
            typeof (asyncBody as AsyncIterable<Uint8Array | string>)[
                Symbol.asyncIterator
            ] === "function"
        ) {
            const streamState = await streamFromAsyncIterable(
                asyncBody as AsyncIterable<Uint8Array | string>,
                onChunk,
            );
            return finalizeStreamingState(streamState, session, onChunk);
        }

        const fallbackText = await response.text();
        return parseStreamingTextResult(fallbackText, session, onChunk);
    } else {
        const response = await fetch(
            `${OPENROUTER_API_BASE}/chat/completions`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            },
        );

        if (!response.ok) {
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                body = undefined;
            }
            const error = parseOpenRouterError(response, body);
            throw new OpenRouterApiErrorImpl(error);
        }

        return response.json();
    }
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${OPENROUTER_API_BASE}/key`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        return response.ok;
    } catch {
        return false;
    }
}

function modelSupportsSearch(model: OpenRouterModel | undefined): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Tools) ?? false
    );
}

function modelSupportsReasoning(model: OpenRouterModel | undefined): boolean {
    return (
        model?.supportedParameters?.includes(SupportedParameter.Reasoning) ??
        false
    );
}
