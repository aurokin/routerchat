import { describe, expect, it } from "vitest";
import {
    consumeStreamText,
    buildResponseFromStreamState,
} from "../openrouter/streaming";
import { buildChatCompletionRequest } from "../openrouter/request-builder";
import type {
    ChatSession,
    OpenRouterMessage,
    ReasoningDetailChunk,
} from "../openrouter/types";

const baseSession: ChatSession = {
    id: "chat-1",
    modelId: "anthropic/claude-3.5-sonnet",
    thinking: "none",
    searchLevel: "none",
};

function sse(payload: object): string {
    return `data: ${JSON.stringify(payload)}\n\n`;
}

describe("streaming reasoning_details merger", () => {
    it("merges partial chunks with the same id into one entry", () => {
        const stream =
            sse({
                choices: [
                    {
                        delta: {
                            reasoning_details: [
                                {
                                    id: "rd-1",
                                    type: "reasoning.text",
                                    text: "Let me ",
                                },
                            ],
                        },
                    },
                ],
            }) +
            sse({
                choices: [
                    {
                        delta: {
                            reasoning_details: [
                                {
                                    id: "rd-1",
                                    type: "reasoning.text",
                                    text: "think about this.",
                                },
                            ],
                        },
                    },
                ],
            }) +
            "data: [DONE]\n\n";

        const state = consumeStreamText(stream, () => {});
        expect(state.reasoningDetails).toHaveLength(1);
        expect(state.reasoningDetails[0]).toMatchObject({
            id: "rd-1",
            type: "reasoning.text",
            text: "Let me think about this.",
        });
    });

    it("preserves encrypted chunks with their signature verbatim", () => {
        const stream =
            sse({
                choices: [
                    {
                        delta: {
                            reasoning_details: [
                                {
                                    id: "rd-enc",
                                    type: "reasoning.encrypted",
                                    format: "anthropic-claude-v1",
                                    signature: "sig-abc-123",
                                },
                            ],
                        },
                    },
                ],
            }) + "data: [DONE]\n\n";

        const state = consumeStreamText(stream, () => {});
        expect(state.reasoningDetails).toHaveLength(1);
        const chunk = state.reasoningDetails[0]!;
        expect(chunk.id).toBe("rd-enc");
        expect(chunk.type).toBe("reasoning.encrypted");
        expect(chunk.format).toBe("anthropic-claude-v1");
        expect(chunk.signature).toBe("sig-abc-123");
        expect(chunk.text).toBeUndefined();
    });

    it("preserves arrival order for multiple distinct ids", () => {
        const stream =
            sse({
                choices: [
                    {
                        delta: {
                            reasoning_details: [
                                {
                                    id: "rd-a",
                                    type: "reasoning.text",
                                    text: "first",
                                },
                                {
                                    id: "rd-b",
                                    type: "reasoning.summary",
                                    text: "second",
                                },
                            ],
                        },
                    },
                ],
            }) + "data: [DONE]\n\n";

        const state = consumeStreamText(stream, () => {});
        expect(state.reasoningDetails.map((c) => c.id)).toEqual([
            "rd-a",
            "rd-b",
        ]);
    });

    it("surfaces reasoningDetails on the response when present", () => {
        const stream =
            sse({
                choices: [
                    {
                        delta: {
                            content: "hi",
                            reasoning_details: [
                                {
                                    id: "rd-1",
                                    type: "reasoning.text",
                                    text: "thought",
                                },
                            ],
                        },
                    },
                ],
            }) + "data: [DONE]\n\n";

        const state = consumeStreamText(stream, () => {});
        const response = buildResponseFromStreamState(state, "fallback-model");
        expect(response.choices[0]?.message.reasoningDetails).toHaveLength(1);
        expect(response.choices[0]?.message.reasoningDetails?.[0]?.id).toBe(
            "rd-1",
        );
    });

    it("omits reasoningDetails on the response when no chunks were emitted", () => {
        const stream =
            sse({ choices: [{ delta: { content: "hi" } }] }) +
            "data: [DONE]\n\n";

        const state = consumeStreamText(stream, () => {});
        const response = buildResponseFromStreamState(state, "fallback-model");
        expect(response.choices[0]?.message.reasoningDetails).toBeUndefined();
    });
});

describe("request builder reasoning_details passthrough", () => {
    it("forwards reasoning_details on assistant messages", () => {
        const reasoning: ReasoningDetailChunk[] = [
            {
                id: "rd-1",
                type: "reasoning.encrypted",
                signature: "sig-xyz",
            },
        ];
        const messages: OpenRouterMessage[] = [
            { role: "user", content: "hello" },
            {
                role: "assistant",
                content: "hi",
                reasoning_details: reasoning,
            },
            { role: "user", content: "follow-up" },
        ];

        const req = buildChatCompletionRequest({
            messages,
            session: baseSession,
            model: undefined,
            stream: false,
        });

        const assistant = req.messages.find((m) => m.role === "assistant");
        expect(assistant?.reasoning_details).toEqual(reasoning);
        const userMsgs = req.messages.filter((m) => m.role === "user");
        for (const u of userMsgs) {
            expect(u.reasoning_details).toBeUndefined();
        }
    });
});
