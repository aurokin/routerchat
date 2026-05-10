import { OPENROUTER_API_BASE } from "./constants";
import { buildHeaders } from "./headers";

/**
 * Subset of the OpenRouter `GET /key` response we surface. Unknown fields are
 * ignored; doc reference: https://openrouter.ai/docs/api-reference/get-api-key
 */
export interface KeyInfo {
    /** User-defined label for the key. May be empty string. */
    label: string;
    /** Cumulative usage in credits (USD-equivalent). */
    usage: number;
    /** Credit cap on the key. `null` when no cap is configured. */
    limit: number | null;
    /** Remaining headroom under `limit`. `null` when no cap. */
    limitRemaining: number | null;
    /** Whether the key is on the free tier. */
    isFreeTier: boolean;
    /**
     * Provider rate-limit window for the key. Shape mirrors the wire format
     * (requests/interval) — `interval` is a duration string like `"10s"`.
     */
    rateLimit?: {
        requests: number;
        interval: string;
    };
}

interface KeyInfoEnvelope {
    data?: {
        label?: string;
        usage?: number;
        limit?: number | null;
        limit_remaining?: number | null;
        is_free_tier?: boolean;
        rate_limit?: {
            requests?: number;
            interval?: string;
        };
    };
}

function toKeyInfo(envelope: KeyInfoEnvelope): KeyInfo {
    const data = envelope.data ?? {};
    const rate = data.rate_limit;
    return {
        label: data.label ?? "",
        usage: data.usage ?? 0,
        limit: typeof data.limit === "number" ? data.limit : null,
        limitRemaining:
            typeof data.limit_remaining === "number"
                ? data.limit_remaining
                : null,
        isFreeTier: data.is_free_tier ?? false,
        rateLimit:
            rate &&
            typeof rate.requests === "number" &&
            typeof rate.interval === "string"
                ? { requests: rate.requests, interval: rate.interval }
                : undefined,
    };
}

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

/**
 * Fetch full metadata for an API key. Returns `null` when the key is invalid
 * or the request fails — callers should treat `null` as "key not usable" and
 * not distinguish further (no leaked error detail to users).
 */
export async function getKeyInfo(
    apiKey: string,
    options: { signal?: AbortSignal } = {},
): Promise<KeyInfo | null> {
    try {
        const response = await fetch(`${OPENROUTER_API_BASE}/key`, {
            headers: buildHeaders({ apiKey }),
            signal: options.signal,
        });
        if (!response.ok) return null;
        const envelope = (await response.json()) as KeyInfoEnvelope;
        return toKeyInfo(envelope);
    } catch {
        return null;
    }
}
