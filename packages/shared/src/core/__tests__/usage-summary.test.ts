import { describe, expect, it } from "vitest";
import { summarizeUsage } from "../usage";
import type { Message } from "../types";

function makeMessage(usage: Message["usage"], id = "m"): Message {
    return {
        id,
        sessionId: "chat-1",
        role: "assistant",
        content: "",
        contextContent: "",
        usage,
        createdAt: 0,
    };
}

describe("summarizeUsage", () => {
    it("returns zeros and undefined cost when no messages have usage", () => {
        const summary = summarizeUsage([
            makeMessage(undefined, "1"),
            makeMessage(undefined, "2"),
        ]);
        expect(summary).toEqual({
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            cachedTokens: 0,
            webSearchRequests: 0,
            cost: undefined,
            messageCount: 0,
        });
    });

    it("sums tokens across messages with usage", () => {
        const summary = summarizeUsage([
            makeMessage(
                {
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                },
                "1",
            ),
            makeMessage(
                {
                    promptTokens: 80,
                    completionTokens: 40,
                    totalTokens: 120,
                },
                "2",
            ),
        ]);
        expect(summary.promptTokens).toBe(180);
        expect(summary.completionTokens).toBe(90);
        expect(summary.totalTokens).toBe(270);
        expect(summary.messageCount).toBe(2);
    });

    it("only sums cost from messages that report it", () => {
        const summary = summarizeUsage([
            makeMessage(
                {
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                    cost: 0.01,
                },
                "1",
            ),
            makeMessage(
                {
                    promptTokens: 80,
                    completionTokens: 40,
                    totalTokens: 120,
                },
                "2",
            ),
            makeMessage(
                {
                    promptTokens: 60,
                    completionTokens: 30,
                    totalTokens: 90,
                    cost: 0.005,
                },
                "3",
            ),
        ]);
        expect(summary.cost).toBeCloseTo(0.015, 5);
    });

    it("cost stays undefined when no message reports cost", () => {
        const summary = summarizeUsage([
            makeMessage(
                {
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                },
                "1",
            ),
        ]);
        expect(summary.cost).toBeUndefined();
    });

    it("aggregates cached tokens", () => {
        const summary = summarizeUsage([
            makeMessage(
                {
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                    cachedTokens: 60,
                },
                "1",
            ),
            makeMessage(
                {
                    promptTokens: 80,
                    completionTokens: 40,
                    totalTokens: 120,
                    cachedTokens: 30,
                },
                "2",
            ),
        ]);
        expect(summary.cachedTokens).toBe(90);
    });

    it("aggregates web search requests", () => {
        const summary = summarizeUsage([
            makeMessage(
                {
                    promptTokens: 100,
                    completionTokens: 50,
                    totalTokens: 150,
                    webSearchRequests: 1,
                },
                "1",
            ),
            makeMessage(
                {
                    promptTokens: 80,
                    completionTokens: 40,
                    totalTokens: 120,
                    webSearchRequests: 2,
                },
                "2",
            ),
        ]);
        expect(summary.webSearchRequests).toBe(3);
    });

    it("ignores messages without usage", () => {
        const summary = summarizeUsage([
            makeMessage(undefined, "1"),
            makeMessage(
                {
                    promptTokens: 80,
                    completionTokens: 40,
                    totalTokens: 120,
                    cost: 0.002,
                },
                "2",
            ),
        ]);
        expect(summary.messageCount).toBe(1);
        expect(summary.totalTokens).toBe(120);
        expect(summary.cost).toBeCloseTo(0.002, 5);
    });
});
