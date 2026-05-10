import type { OpenRouterModel } from "../models";
import { parseOpenRouterError } from "../errors";
import { OPENROUTER_API_BASE } from "./constants";
import { OpenRouterApiErrorImpl } from "./error";
import { buildHeaders } from "./headers";
import { buildChatCompletionRequest } from "./request-builder";
import {
    buildResponseFromStreamState,
    consumeStreamText,
    createSseParser,
    streamFromAsyncIterable,
    streamFromReader,
    type StreamChunkHandler,
    type StreamParseState,
} from "./streaming";
import type {
    ChatCompletionRequest,
    ChatCompletionResponse,
    ChatSession,
    OpenRouterMessage,
    ProviderSort,
} from "./types";

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

function finalizeStreamingState(
    state: StreamParseState,
    session: ChatSession,
    onChunk: StreamChunkHandler,
): ChatCompletionResponse {
    if (state.sawData) {
        return buildResponseFromStreamState(state, session.modelId);
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

function parseStreamingTextResult(
    fallbackText: string,
    session: ChatSession,
    onChunk: StreamChunkHandler,
): ChatCompletionResponse {
    if (fallbackText.trim()) {
        const streamState = consumeStreamText(fallbackText, onChunk);
        if (streamState.sawData) {
            return buildResponseFromStreamState(streamState, session.modelId);
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

async function sendMessageWithXhr(
    apiKey: string,
    requestBody: ChatCompletionRequest,
    session: ChatSession,
    onChunk: StreamChunkHandler,
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
        const headers = buildHeaders({ apiKey, json: true });
        for (const [name, value] of Object.entries(headers)) {
            xhr.setRequestHeader(name, value);
        }

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

export interface SendMessageOptions {
    cacheControl?: boolean;
    systemPrefix?: string;
    providerSort?: ProviderSort;
}

export async function sendMessage(
    apiKey: string,
    messages: OpenRouterMessage[],
    session: ChatSession,
    model: OpenRouterModel | undefined,
    onChunk?: StreamChunkHandler,
    options: SendMessageOptions = {},
): Promise<ChatCompletionResponse> {
    const requestBody = buildChatCompletionRequest({
        messages,
        session,
        model,
        stream: !!onChunk,
        cacheControl: options.cacheControl,
        systemPrefix: options.systemPrefix,
        providerSort: options.providerSort,
    });

    if (onChunk) {
        if (shouldUseXhrStreaming()) {
            return sendMessageWithXhr(apiKey, requestBody, session, onChunk);
        }

        const response = await fetch(
            `${OPENROUTER_API_BASE}/chat/completions`,
            {
                method: "POST",
                headers: buildHeaders({ apiKey, json: true }),
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
    }

    const response = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
        method: "POST",
        headers: buildHeaders({ apiKey, json: true }),
        body: JSON.stringify(requestBody),
    });

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

    return (await response.json()) as ChatCompletionResponse;
}
