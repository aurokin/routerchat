import { parseMidStreamError } from "../errors";
import { OpenRouterApiErrorImpl } from "./error";
import { extractReasoningText } from "./types";
import type {
    ChatCompletionResponse,
    ReasoningDetailChunk,
    ToolCall,
    ToolCallDelta,
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
    /**
     * Streamed `reasoning_details[]` chunks, merged by `id`. Persisted on the
     * assistant message and replayed back to the provider on follow-up turns.
     */
    reasoningDetails: ReasoningDetailChunk[];
    /**
     * Streamed `tool_calls[]` accumulator, keyed by `delta.tool_calls[].index`.
     * `arguments` is concatenated across chunks; `id` / `type` / `name` are
     * taken from the first chunk that supplies them. Finalized into a sorted
     * `ToolCall[]` via {@link finalizeToolCalls}.
     */
    toolCallsByIndex: Map<number, AccumulatingToolCall>;
}

interface AccumulatingToolCall {
    index: number;
    id?: string;
    type?: "function";
    name?: string;
    arguments: string;
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
        reasoningDetails: [],
        toolCallsByIndex: new Map(),
    };
}

/**
 * Streaming `delta.tool_calls[]` arrive piecemeal: each entry's `index` is
 * stable, `id` / `type` / `function.name` typically appear in the first chunk
 * for that index, and `function.arguments` is delivered as concatenated string
 * fragments across many subsequent chunks. Merge by `index`, taking the first
 * non-empty `id`/`type`/`name` and appending all `arguments` chunks.
 */
function mergeToolCallDeltas(
    target: Map<number, AccumulatingToolCall>,
    incoming: ToolCallDelta[],
): void {
    for (const chunk of incoming) {
        if (!chunk || typeof chunk !== "object") continue;
        if (typeof chunk.index !== "number") continue;
        let entry = target.get(chunk.index);
        if (!entry) {
            entry = { index: chunk.index, arguments: "" };
            target.set(chunk.index, entry);
        }
        if (chunk.id && !entry.id) entry.id = chunk.id;
        if (chunk.type && !entry.type) entry.type = chunk.type;
        if (chunk.function?.name && !entry.name) {
            entry.name = chunk.function.name;
        }
        if (typeof chunk.function?.arguments === "string") {
            entry.arguments += chunk.function.arguments;
        }
    }
}

/**
 * Convert the indexed accumulator into the final ordered `ToolCall[]`. Drops
 * entries with no `id` (providers must supply one per call); defaults missing
 * `type` to "function" and `name` to empty string for robustness.
 */
export function finalizeToolCalls(
    map: Map<number, AccumulatingToolCall>,
): ToolCall[] {
    const entries = Array.from(map.values()).sort((a, b) => a.index - b.index);
    const result: ToolCall[] = [];
    for (const entry of entries) {
        if (!entry.id) continue;
        result.push({
            id: entry.id,
            type: entry.type ?? "function",
            function: {
                name: entry.name ?? "",
                arguments: entry.arguments,
            },
        });
    }
    return result;
}

/**
 * Streaming providers emit `reasoning_details[]` across many SSE chunks; later
 * chunks for the same `id` append text and may finalize `format` / `signature`.
 * Merge in place so the final array carries one entry per block, in arrival
 * order, with all fields concatenated/overwritten as the stream advances.
 */
function mergeReasoningDetails(
    target: ReasoningDetailChunk[],
    incoming: ReasoningDetailChunk[],
): void {
    for (const chunk of incoming) {
        if (!chunk || typeof chunk !== "object") continue;
        const existing = chunk.id
            ? target.find((c) => c.id === chunk.id)
            : undefined;
        if (existing) {
            if (chunk.type) existing.type = chunk.type;
            if (chunk.format !== undefined) existing.format = chunk.format;
            if (typeof chunk.text === "string") {
                existing.text = (existing.text ?? "") + chunk.text;
            }
            if (chunk.signature !== undefined) {
                existing.signature = chunk.signature;
            }
        } else {
            target.push({ ...chunk });
        }
    }
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
            const incoming = delta.reasoning_details as ReasoningDetailChunk[];
            mergeReasoningDetails(state.reasoningDetails, incoming);
            const reasoningText = extractReasoningText(incoming);
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
        if (Array.isArray(delta?.tool_calls)) {
            mergeToolCallDeltas(
                state.toolCallsByIndex,
                delta.tool_calls as ToolCallDelta[],
            );
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
    const toolCalls = finalizeToolCalls(state.toolCallsByIndex);
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
                    reasoningDetails:
                        state.reasoningDetails.length > 0
                            ? state.reasoningDetails
                            : undefined,
                    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                },
                finish_reason:
                    state.finishReason ??
                    (state.streamComplete ? "stop" : "length"),
            },
        ],
        usage: state.usage ?? ZERO_USAGE,
    };
}
