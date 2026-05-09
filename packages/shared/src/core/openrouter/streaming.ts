import { parseMidStreamError } from "../errors";
import { OpenRouterApiErrorImpl } from "./error";
import { extractReasoningText } from "./types";
import type {
    ChatCompletionResponse,
    ReasoningDetailChunk,
    UsageDetails,
} from "./types";

export type StreamChunkHandler = (chunk: string, thinking?: string) => void;

interface ParsedDelta {
    contentDelta: string;
    thinkingDelta: string;
    streamComplete: boolean;
    parsed: boolean;
}

export interface StreamParseState {
    content: string;
    thinking: string;
    streamComplete: boolean;
    sawData: boolean;
    rawText: string;
    /** Final response id from the streamed chunks (no fabricated value). */
    id: string | null;
    /** Model id reported by the upstream server. */
    model: string | null;
    /** Server-reported `created` timestamp from the streamed chunks. */
    created: number | null;
    /** Captured `usage` from the final stream chunk (when `stream_options.include_usage`). */
    usage: UsageDetails | null;
    /** Last seen finish_reason from a non-error chunk. */
    finishReason: string | null;
}

function makeInitialState(): StreamParseState {
    return {
        content: "",
        thinking: "",
        streamComplete: false,
        sawData: false,
        rawText: "",
        id: null,
        model: null,
        created: null,
        usage: null,
        finishReason: null,
    };
}

function applyStreamDelta(
    data: string,
    state: StreamParseState,
    onChunk: StreamChunkHandler,
): ParsedDelta {
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
        const parsedChunk = JSON.parse(data) as Record<string, unknown> & {
            id?: string;
            model?: string;
            created?: number;
            usage?: UsageDetails;
            choices?: Array<{
                delta?: Record<string, unknown>;
                finish_reason?: string;
            }>;
        };
        parsed = true;

        const streamError = parseMidStreamError(parsedChunk);
        if (streamError) {
            throw new OpenRouterApiErrorImpl(streamError);
        }

        if (typeof parsedChunk.id === "string" && !state.id) {
            state.id = parsedChunk.id;
        }
        if (typeof parsedChunk.model === "string" && !state.model) {
            state.model = parsedChunk.model;
        }
        if (typeof parsedChunk.created === "number" && !state.created) {
            state.created = parsedChunk.created;
        }
        if (parsedChunk.usage && typeof parsedChunk.usage === "object") {
            state.usage = parsedChunk.usage;
        }

        const choice = parsedChunk.choices?.[0];
        const delta = choice?.delta;
        if (typeof delta?.content === "string") {
            contentDelta = delta.content;
            onChunk(contentDelta);
        }
        if (delta?.reasoning_details) {
            const reasoningText = extractReasoningText(
                delta.reasoning_details as ReasoningDetailChunk[],
            );
            if (reasoningText) {
                thinkingDelta += reasoningText;
                onChunk("", reasoningText);
            }
        } else if (typeof delta?.thinking === "string") {
            // Defensive fallback for older / non-conforming providers that
            // emit `delta.thinking` directly. Modern providers send
            // `delta.reasoning_details[]`.
            thinkingDelta += delta.thinking;
            onChunk("", delta.thinking);
        }
        if (choice?.finish_reason && choice.finish_reason !== "error") {
            streamComplete = true;
            state.finishReason = choice.finish_reason;
        }
    } catch (err) {
        if (err instanceof OpenRouterApiErrorImpl) {
            throw err;
        }
    }

    return { contentDelta, thinkingDelta, streamComplete, parsed };
}

export interface SseParser {
    push: (text: string) => boolean;
    flush: () => boolean;
    getState: () => StreamParseState;
}

export function createSseParser(onChunk: StreamChunkHandler): SseParser {
    let buffer = "";
    const state = makeInitialState();

    const applyLine = (line: string) => {
        if (!line.startsWith("data: ")) {
            return;
        }
        const data = line.slice(6).trim();
        if (!data) {
            return;
        }
        const result = applyStreamDelta(data, state, onChunk);
        if (result.parsed) {
            state.sawData = true;
        }
        if (result.contentDelta) {
            state.content += result.contentDelta;
        }
        if (result.thinkingDelta) {
            state.thinking += result.thinkingDelta;
        }
        if (result.streamComplete) {
            state.streamComplete = true;
        }
    };

    const push = (text: string) => {
        state.rawText += text;
        buffer += text;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
            applyLine(line);
        }
        return state.streamComplete;
    };

    const flush = () => {
        const trimmed = buffer.trim();
        buffer = "";
        if (!trimmed) {
            return state.streamComplete;
        }
        applyLine(trimmed);
        return state.streamComplete;
    };

    const getState = () => state;

    return { push, flush, getState };
}

/**
 * One-shot driver for an SSE blob (used as a fallback when streaming is
 * unavailable and we have to read the whole body as text).
 */
export function consumeStreamText(
    text: string,
    onChunk: StreamChunkHandler,
): StreamParseState {
    const parser = createSseParser(onChunk);
    parser.push(text);
    parser.flush();
    return parser.getState();
}

export async function streamFromReader(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onChunk: StreamChunkHandler,
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

export async function streamFromAsyncIterable(
    body: AsyncIterable<Uint8Array | string>,
    onChunk: StreamChunkHandler,
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

const ZERO_USAGE: UsageDetails = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
};

/**
 * Convert the streaming state into a `ChatCompletionResponse`. Uses the real
 * `id`, `model`, `created`, `usage`, and `finish_reason` reported by the
 * server when present (i.e. when `stream_options.include_usage` was set and
 * the provider honored it). Falls back to defaults only when the server
 * didn't include them.
 */
export function buildResponseFromStreamState(
    state: StreamParseState,
    fallbackModel: string,
): ChatCompletionResponse {
    return {
        id: state.id ?? "",
        object: "chat.completion",
        created: state.created ?? Date.now(),
        model: state.model ?? fallbackModel,
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: state.content,
                    thinking: state.thinking || undefined,
                },
                finish_reason:
                    state.finishReason ??
                    (state.streamComplete ? "stop" : "length"),
            },
        ],
        usage: state.usage ?? ZERO_USAGE,
    };
}
