import { OPENROUTER_API_BASE } from "./constants";
import { buildHeaders } from "./headers";

/**
 * Lightweight liveness check for an API key.
 *
 * Calls `GET /key`, but only surfaces the boolean result. For full key
 * metadata (label, usage, limit, rate limits) use `getKeyInfo`.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${OPENROUTER_API_BASE}/key`, {
            headers: buildHeaders({ apiKey }),
        });
        return response.ok;
    } catch {
        return false;
    }
}
