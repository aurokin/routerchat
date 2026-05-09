import { modelSupportsReasoning, type OpenRouterModel } from "../models";
import type { ChatSession, ReasoningEffort, ReasoningOptions } from "./types";

/**
 * Map the app's `ThinkingLevel` to the documented `reasoning.effort` enum.
 *
 * The app keeps a custom `"xhigh"` UI tier for users who want the strongest
 * reasoning, but OpenRouter only documents `high | medium | low | minimal`.
 * `"xhigh"` is folded into `"high"` at the request boundary.
 */
export function mapReasoningEffort(
    thinking: ChatSession["thinking"],
): ReasoningEffort | null {
    switch (thinking) {
        case "none":
            return null;
        case "xhigh":
        case "high":
            return "high";
        case "medium":
            return "medium";
        case "low":
            return "low";
        case "minimal":
            return "minimal";
        default:
            return "medium";
    }
}

export function buildReasoningOptions(
    thinking: ChatSession["thinking"],
    model: OpenRouterModel | undefined,
): ReasoningOptions | undefined {
    if (!modelSupportsReasoning(model)) return undefined;
    const effort = mapReasoningEffort(thinking);
    if (!effort) return undefined;
    return { effort };
}

export { modelSupportsReasoning };
