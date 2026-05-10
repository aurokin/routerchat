import { describe, expect, it } from "vitest";
import {
    buildResponseFromStreamState,
    consumeStreamText,
    createSseParser,
} from "../openrouter/streaming";
import type { ToolCallDelta } from "../openrouter/types";

function makeChunk(toolCalls: ToolCallDelta[], finish?: string): string {
    return `data: ${JSON.stringify({
        id: "stream-1",
        model: "openai/gpt-4o",
        created: 1,
        choices: [
            {
                delta: { tool_calls: toolCalls },
                ...(finish ? { finish_reason: finish } : {}),
            },
        ],
    })}\n\n`;
}

describe("streaming tool_calls accumulation", () => {
    it("merges arguments string fragments across chunks", () => {
        const parser = createSseParser(() => {});
        parser.push(
            makeChunk([
                {
                    index: 0,
                    id: "call_1",
                    type: "function",
                    function: { name: "lookup", arguments: '{"q' },
                },
            ]),
        );
        parser.push(
            makeChunk([{ index: 0, function: { arguments: '":"cats"' } }]),
        );
        parser.push(makeChunk([{ index: 0, function: { arguments: "}" } }]));
        parser.push(makeChunk([], "tool_calls"));
        parser.flush();

        const response = buildResponseFromStreamState(
            parser.getState(),
            "openai/gpt-4o",
        );
        expect(response.choices[0]?.message.tool_calls).toEqual([
            {
                id: "call_1",
                type: "function",
                function: { name: "lookup", arguments: '{"q":"cats"}' },
            },
        ]);
        expect(response.choices[0]?.finish_reason).toBe("tool_calls");
        // Parsing the assembled arguments yields valid JSON
        const args = response.choices[0]?.message.tool_calls?.[0]?.function
            .arguments as string;
        expect(JSON.parse(args)).toEqual({ q: "cats" });
    });

    it("accumulates parallel calls by index, in order", () => {
        const sse = [
            makeChunk([
                {
                    index: 0,
                    id: "call_a",
                    type: "function",
                    function: { name: "fn_a", arguments: "{" },
                },
                {
                    index: 1,
                    id: "call_b",
                    type: "function",
                    function: { name: "fn_b", arguments: "{" },
                },
            ]),
            makeChunk([
                { index: 0, function: { arguments: '"x":1}' } },
                { index: 1, function: { arguments: '"y":2}' } },
            ]),
            makeChunk([], "tool_calls"),
        ].join("");

        const state = consumeStreamText(sse, () => {});
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        const calls = response.choices[0]?.message.tool_calls ?? [];
        expect(calls).toHaveLength(2);
        expect(calls[0]?.id).toBe("call_a");
        expect(calls[0]?.function.arguments).toBe('{"x":1}');
        expect(calls[1]?.id).toBe("call_b");
        expect(calls[1]?.function.arguments).toBe('{"y":2}');
    });

    it("sorts the result by index when indices arrive out of order", () => {
        const sse = [
            makeChunk([
                {
                    index: 1,
                    id: "call_late",
                    type: "function",
                    function: { name: "second", arguments: "{}" },
                },
            ]),
            makeChunk([
                {
                    index: 0,
                    id: "call_early",
                    type: "function",
                    function: { name: "first", arguments: "{}" },
                },
            ]),
            makeChunk([], "tool_calls"),
        ].join("");
        const state = consumeStreamText(sse, () => {});
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        const calls = response.choices[0]?.message.tool_calls ?? [];
        expect(calls.map((c) => c.id)).toEqual(["call_early", "call_late"]);
    });

    it("drops entries that never receive an id (provider must supply one)", () => {
        const sse = [
            makeChunk([{ index: 0, function: { arguments: "{}" } }]),
            makeChunk([], "tool_calls"),
        ].join("");
        const state = consumeStreamText(sse, () => {});
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        expect(response.choices[0]?.message.tool_calls).toBeUndefined();
    });

    it("takes id from a later chunk if absent in the first one", () => {
        const sse = [
            makeChunk([
                {
                    index: 0,
                    type: "function",
                    function: { name: "fn", arguments: "{" },
                },
            ]),
            makeChunk([
                {
                    index: 0,
                    id: "call_late_id",
                    function: { arguments: "}" },
                },
            ]),
            makeChunk([], "tool_calls"),
        ].join("");
        const state = consumeStreamText(sse, () => {});
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        const calls = response.choices[0]?.message.tool_calls ?? [];
        expect(calls).toHaveLength(1);
        expect(calls[0]?.id).toBe("call_late_id");
        expect(calls[0]?.function.arguments).toBe("{}");
    });

    it("co-exists with streamed text content in the same response", () => {
        const textSse = `data: ${JSON.stringify({
            id: "stream-1",
            choices: [{ delta: { content: "I'll look that up. " } }],
        })}\n\n`;
        const toolSse = makeChunk([
            {
                index: 0,
                id: "call_x",
                type: "function",
                function: { name: "search", arguments: '{"q":"x"}' },
            },
        ]);
        const finishSse = makeChunk([], "tool_calls");
        const sse = textSse + toolSse + finishSse;

        const collected: string[] = [];
        const state = consumeStreamText(sse, (chunk) => {
            if (chunk) collected.push(chunk);
        });
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        expect(response.choices[0]?.message.content).toBe(
            "I'll look that up. ",
        );
        expect(response.choices[0]?.message.tool_calls).toHaveLength(1);
        expect(collected.join("")).toBe("I'll look that up. ");
    });

    it("preserves accumulated calls on a terminator chunk with no delta.tool_calls", () => {
        // Real providers often emit the finish_reason in a separate chunk
        // whose `delta` carries no tool_calls field at all (vs. the empty
        // array `makeChunk` produces). Lock in that the accumulator survives.
        const sse = [
            makeChunk([
                {
                    index: 0,
                    id: "call_z",
                    type: "function",
                    function: { name: "lookup", arguments: '{"q":"z"}' },
                },
            ]),
            // Terminator chunk: no `delta.tool_calls` key at all.
            `data: ${JSON.stringify({
                id: "stream-1",
                choices: [{ delta: {}, finish_reason: "tool_calls" }],
            })}\n\n`,
        ].join("");
        const state = consumeStreamText(sse, () => {});
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        expect(response.choices[0]?.message.tool_calls).toEqual([
            {
                id: "call_z",
                type: "function",
                function: { name: "lookup", arguments: '{"q":"z"}' },
            },
        ]);
        expect(response.choices[0]?.finish_reason).toBe("tool_calls");
    });

    it("returns partial accumulated calls when the stream is cancelled mid-flight", () => {
        // Simulate cancellation: no terminator chunk arrives. The library
        // surfaces the partial arguments + a synthesized "length" finish
        // reason so callers can detect truncation.
        const sse = [
            makeChunk([
                {
                    index: 0,
                    id: "call_partial",
                    type: "function",
                    function: { name: "lookup", arguments: '{"q":"hal' },
                },
            ]),
        ].join("");
        const state = consumeStreamText(sse, () => {});
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        expect(response.choices[0]?.message.tool_calls).toEqual([
            {
                id: "call_partial",
                type: "function",
                function: { name: "lookup", arguments: '{"q":"hal' },
            },
        ]);
        // No finish_reason from the server → buildResponseFromStreamState
        // defaults to "length" when streamComplete was never seen.
        expect(response.choices[0]?.finish_reason).toBe("length");
    });

    it("returns no tool_calls when none were streamed", () => {
        const sse = `data: ${JSON.stringify({
            id: "stream-1",
            choices: [
                {
                    delta: { content: "Just text." },
                    finish_reason: "stop",
                },
            ],
        })}\n\n`;
        const state = consumeStreamText(sse, () => {});
        const response = buildResponseFromStreamState(state, "openai/gpt-4o");
        expect(response.choices[0]?.message.tool_calls).toBeUndefined();
    });
});
