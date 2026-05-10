import type { Message, MessageUsage } from "./types";

export interface UsageSummary {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens: number;
    /** Sum of provider-reported costs. Undefined if no message reported a cost. */
    cost: number | undefined;
    /** Number of messages that contributed at least one field. */
    messageCount: number;
}

/**
 * Aggregate per-message {@link MessageUsage} records into a chat-level summary.
 * `cost` only resolves to a number when at least one message reported a cost —
 * mixing reported and unreported costs would silently understate, so the UI
 * treats `undefined` as "n/a" rather than "$0.00".
 */
export function summarizeUsage(messages: Message[]): UsageSummary {
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let cachedTokens = 0;
    let cost: number | undefined;
    let messageCount = 0;

    for (const message of messages) {
        const usage: MessageUsage | undefined = message.usage;
        if (!usage) continue;
        messageCount++;
        promptTokens += usage.promptTokens;
        completionTokens += usage.completionTokens;
        totalTokens += usage.totalTokens;
        if (typeof usage.cachedTokens === "number") {
            cachedTokens += usage.cachedTokens;
        }
        if (typeof usage.cost === "number") {
            cost = (cost ?? 0) + usage.cost;
        }
    }

    return {
        promptTokens,
        completionTokens,
        totalTokens,
        cachedTokens,
        cost,
        messageCount,
    };
}
