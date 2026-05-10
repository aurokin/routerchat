"use client";

import { Coins } from "lucide-react";
import type { Message } from "@/lib/types";
import { summarizeUsage } from "@shared/core/usage";

interface ChatUsageSummaryProps {
    messages: Message[];
}

export function formatTokenCount(value: number): string {
    if (value < 1000) return value.toString();
    if (value < 100_000) {
        const k = value / 1000;
        return `${k.toFixed(k >= 10 ? 0 : 1)}k`;
    }
    if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
    return `${(value / 1_000_000).toFixed(2)}M`;
}

export function formatCost(value: number): string {
    if (value === 0) return "$0";
    if (value < 0.01) return `$${value.toFixed(4)}`;
    if (value < 1) return `$${value.toFixed(3)}`;
    return `$${value.toFixed(2)}`;
}

export function ChatUsageSummary({ messages }: ChatUsageSummaryProps) {
    const summary = summarizeUsage(messages);
    if (summary.messageCount === 0) return null;

    const cachedSegment =
        summary.cachedTokens > 0
            ? ` · ${formatTokenCount(summary.cachedTokens)} cached`
            : "";

    return (
        <div
            className="px-6 py-1.5 text-xs text-muted-foreground border-b border-border/40 bg-background-elevated/20 flex items-center gap-2 relative z-10"
            data-testid="chat-usage-summary"
            aria-label="Chat usage summary"
        >
            <Coins
                size={12}
                className="text-muted-foreground/70 flex-shrink-0"
            />
            <span className="tabular-nums">
                {formatTokenCount(summary.totalTokens)} tokens
                {cachedSegment}
            </span>
            {summary.cost !== undefined && (
                <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="tabular-nums">
                        {formatCost(summary.cost)}
                    </span>
                </>
            )}
        </div>
    );
}
