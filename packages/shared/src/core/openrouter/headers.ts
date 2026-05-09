import { ATTRIBUTION_REFERRER, ATTRIBUTION_TITLE } from "./constants";

/**
 * Build the standard request headers for an OpenRouter call:
 * - bearer auth
 * - JSON content type (for POST bodies)
 * - attribution headers so requests show up correctly in OpenRouter's app
 *   rankings
 */
export function buildHeaders(options: {
    apiKey?: string;
    json?: boolean;
}): Record<string, string> {
    const headers: Record<string, string> = {
        "HTTP-Referer": ATTRIBUTION_REFERRER,
        "X-Title": ATTRIBUTION_TITLE,
    };
    if (options.apiKey) {
        headers["Authorization"] = `Bearer ${options.apiKey}`;
    }
    if (options.json) {
        headers["Content-Type"] = "application/json";
    }
    return headers;
}
