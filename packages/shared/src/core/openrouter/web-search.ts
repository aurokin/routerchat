import { modelSupportsSearch } from "../models";
import type { ChatSession, OpenRouterTool, WebSearchTool } from "./types";

const MAX_RESULTS_BY_LEVEL: Record<
    Exclude<ChatSession["searchLevel"], "none">,
    number
> = {
    low: 3,
    medium: 6,
    high: 10,
};

/**
 * Build the modern web-search tool entry for a request.
 *
 * Replaces the legacy `plugins:[{id:"web", max_results}]` shape, which is
 * still accepted by the API but no longer documented.
 */
export function buildWebSearchTool(
    searchLevel: ChatSession["searchLevel"],
): OpenRouterTool[] | undefined {
    if (searchLevel === "none") return undefined;
    const tool: WebSearchTool = {
        type: "openrouter:web_search",
        parameters: {
            max_results: MAX_RESULTS_BY_LEVEL[searchLevel],
            search_context_size: searchLevel,
        },
    };
    return [tool];
}

export { modelSupportsSearch };
