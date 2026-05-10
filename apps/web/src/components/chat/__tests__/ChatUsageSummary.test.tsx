// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
    ChatUsageSummary,
    formatTokenCount,
    formatCost,
} from "../ChatUsageSummary";
import type { Message } from "@/lib/types";

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

describe("formatTokenCount", () => {
    it("renders raw counts under 1k", () => {
        expect(formatTokenCount(0)).toBe("0");
        expect(formatTokenCount(523)).toBe("523");
    });

    it("renders 1.x k for thousands under 10k", () => {
        expect(formatTokenCount(1500)).toBe("1.5k");
    });

    it("rounds to integer k between 10k and 100k", () => {
        expect(formatTokenCount(45_500)).toBe("46k");
    });

    it("renders M for millions", () => {
        expect(formatTokenCount(2_500_000)).toBe("2.50M");
    });
});

describe("formatCost", () => {
    it("renders four decimals for sub-cent costs", () => {
        expect(formatCost(0.0042)).toBe("$0.0042");
    });

    it("renders three decimals for sub-dollar costs", () => {
        expect(formatCost(0.123)).toBe("$0.123");
    });

    it("renders two decimals for >=1 dollar", () => {
        expect(formatCost(2.345)).toBe("$2.35");
    });

    it("renders $0 for zero", () => {
        expect(formatCost(0)).toBe("$0");
    });
});

describe("ChatUsageSummary", () => {
    it("renders nothing when no message has usage", () => {
        const { container } = render(
            <ChatUsageSummary messages={[makeMessage(undefined, "1")]} />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("renders aggregated tokens and cost when present", () => {
        render(
            <ChatUsageSummary
                messages={[
                    makeMessage(
                        {
                            promptTokens: 100,
                            completionTokens: 50,
                            totalTokens: 150,
                            cost: 0.005,
                        },
                        "1",
                    ),
                    makeMessage(
                        {
                            promptTokens: 80,
                            completionTokens: 40,
                            totalTokens: 120,
                            cost: 0.003,
                        },
                        "2",
                    ),
                ]}
            />,
        );
        expect(screen.getByTestId("chat-usage-summary")).toHaveTextContent(
            "270 tokens",
        );
        expect(screen.getByTestId("chat-usage-summary")).toHaveTextContent(
            "$0.008",
        );
    });

    it("hides cost segment when no message reports cost", () => {
        render(
            <ChatUsageSummary
                messages={[
                    makeMessage(
                        {
                            promptTokens: 100,
                            completionTokens: 50,
                            totalTokens: 150,
                        },
                        "1",
                    ),
                ]}
            />,
        );
        const node = screen.getByTestId("chat-usage-summary");
        expect(node).toHaveTextContent("150 tokens");
        expect(node).not.toHaveTextContent("$");
    });

    it("renders cached tokens when present", () => {
        render(
            <ChatUsageSummary
                messages={[
                    makeMessage(
                        {
                            promptTokens: 100,
                            completionTokens: 50,
                            totalTokens: 150,
                            cachedTokens: 60,
                        },
                        "1",
                    ),
                ]}
            />,
        );
        expect(screen.getByTestId("chat-usage-summary")).toHaveTextContent(
            "60 cached",
        );
    });
});
