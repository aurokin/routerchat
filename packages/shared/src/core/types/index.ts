import type { Skill } from "../skills";

export type ThinkingLevel =
    | "xhigh"
    | "high"
    | "medium"
    | "low"
    | "minimal"
    | "none";

export type SearchLevel = "none" | "low" | "medium" | "high";

/**
 * Storage-side usage record for an assistant message.
 *
 * Distinct from `UsageDetails` (the wire format from OpenRouter): camelCased,
 * stripped of fields we don't surface (cache_discount), and with `cost`
 * required when present so cost summing doesn't have to second-guess.
 */
export interface MessageUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Provider-reported USD cost. Undefined when the provider doesn't report. */
    cost?: number;
    /** Cached prompt tokens (subset of promptTokens). Undefined when not reported. */
    cachedTokens?: number;
}

export interface Message {
    id: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    contextContent: string;
    thinking?: string;
    skill?: Skill | null;
    modelId?: string;
    thinkingLevel?: ThinkingLevel;
    searchLevel?: SearchLevel;
    attachmentIds?: string[];
    usage?: MessageUsage;
    createdAt: number;
}

export interface ChatSession {
    id: string;
    title: string;
    modelId: string;
    thinking: ThinkingLevel;
    searchLevel: SearchLevel;
    createdAt: number;
    updatedAt: number;
}

export interface UserSettings {
    apiKey: string | null;
    defaultModel: string;
    defaultThinking: ThinkingLevel;
    defaultSearchLevel: SearchLevel;
    theme: "light" | "dark" | "system";
    favoriteModels: string[];
}

export interface Attachment {
    id: string;
    messageId: string;
    type: "image";
    mimeType: string;
    data: string;
    width: number;
    height: number;
    size: number;
    createdAt: number;
    purgedAt?: number;
}

export interface PendingAttachment {
    id: string;
    type: "image";
    mimeType: string;
    data: string;
    width: number;
    height: number;
    size: number;
    preview: string;
}
