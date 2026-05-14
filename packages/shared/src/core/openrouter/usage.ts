import type { MessageUsage } from "../types";
import type { UsageDetails } from "./types";

/**
 * Convert the OpenRouter wire-format `usage` payload to the camelCased,
 * storage-side {@link MessageUsage} shape. Returns `null` when the payload is
 * effectively empty (zero tokens and no cost), so callers can simply drop
 * `usage` from the persisted record instead of writing a noisy zero row.
 */
export function toMessageUsage(
    usage: UsageDetails | null | undefined,
): MessageUsage | null {
    if (!usage) return null;

    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
    const cost = typeof usage.cost === "number" ? usage.cost : undefined;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens;
    const webSearchRequests = usage.server_tool_use?.web_search_requests;

    if (
        promptTokens === 0 &&
        completionTokens === 0 &&
        totalTokens === 0 &&
        cost === undefined &&
        (cachedTokens === undefined || cachedTokens === 0) &&
        (webSearchRequests === undefined || webSearchRequests === 0)
    ) {
        return null;
    }

    return {
        promptTokens,
        completionTokens,
        totalTokens,
        ...(cost !== undefined ? { cost } : {}),
        ...(typeof cachedTokens === "number" && cachedTokens > 0
            ? { cachedTokens }
            : {}),
        ...(typeof webSearchRequests === "number" && webSearchRequests > 0
            ? { webSearchRequests }
            : {}),
    };
}
