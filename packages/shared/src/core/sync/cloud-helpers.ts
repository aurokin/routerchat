import type { Skill } from "../skills";
import type {
    ChatSession,
    Message,
    ThinkingLevel,
    SearchLevel,
} from "../types";

const THINKING_LEVELS = new Set<string>([
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
    "none",
]);

const SEARCH_LEVELS = new Set<string>(["none", "low", "medium", "high"]);

export function isThinkingLevel(
    value: string | null | undefined,
): value is ThinkingLevel {
    return typeof value === "string" && THINKING_LEVELS.has(value);
}

export function isSearchLevel(
    value: string | null | undefined,
): value is SearchLevel {
    return typeof value === "string" && SEARCH_LEVELS.has(value);
}

export function toThinkingLevel(
    value: string | null | undefined,
): ThinkingLevel {
    return isThinkingLevel(value) ? value : "none";
}

export function toSearchLevel(value: string | null | undefined): SearchLevel {
    return isSearchLevel(value) ? value : "none";
}

export function mergeByIdWithPending<T extends { id: string }>(
    cloud: T[],
    prev: T[],
    pending: Set<string>,
    sort?: (a: T, b: T) => number,
): T[] {
    const byId = new Map<string, T>();

    for (const item of cloud) {
        byId.set(item.id, item);
    }

    for (const item of prev) {
        if (pending.has(item.id) && !byId.has(item.id)) {
            byId.set(item.id, item);
        }
    }

    const merged = Array.from(byId.values());
    return sort ? merged.sort(sort) : merged;
}

export interface ConvexChatLike {
    _id: string;
    localId?: string | null;
    title: string;
    modelId: string;
    thinking?: string | null;
    searchLevel?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessageLike {
    _id: string;
    localId?: string | null;
    role: Message["role"];
    content: string;
    contextContent: string;
    thinking?: string | null;
    skill?: Skill | null;
    modelId?: string | null;
    thinkingLevel?: string | null;
    searchLevel?: string | null;
    attachmentIds?: string[] | null;
    createdAt: number;
}

export function mapConvexChatToLocal(chat: ConvexChatLike): ChatSession {
    return {
        id: chat.localId ?? chat._id,
        title: chat.title,
        modelId: chat.modelId,
        thinking: toThinkingLevel(chat.thinking),
        searchLevel: toSearchLevel(chat.searchLevel),
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
    };
}

export function mapConvexMessageToLocal(
    msg: ConvexMessageLike,
    chatLocalId: string,
): Message {
    return {
        id: msg.localId ?? msg._id,
        sessionId: chatLocalId,
        role: msg.role,
        content: msg.content,
        contextContent: msg.contextContent,
        thinking: msg.thinking ?? undefined,
        skill: msg.skill ?? null,
        modelId: msg.modelId ?? undefined,
        thinkingLevel: toThinkingLevel(msg.thinkingLevel),
        searchLevel: toSearchLevel(msg.searchLevel),
        attachmentIds: msg.attachmentIds ?? undefined,
        createdAt: msg.createdAt,
    };
}
