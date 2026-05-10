import { describe, expect, it } from "vitest";
import { buildChatCompletionRequest } from "../openrouter/request-builder";
import type { ChatSession, OpenRouterMessage } from "../openrouter/types";
import { SupportedParameter, type OpenRouterModel } from "../models";
import { WEB_SEARCH_SYSTEM_GUIDANCE } from "../openrouter/constants";

const baseSession: ChatSession = {
    id: "chat-1",
    modelId: "anthropic/claude-3.5-sonnet",
    thinking: "none",
    searchLevel: "none",
};

const baseModel: OpenRouterModel = {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    supportedParameters: [SupportedParameter.Tools, SupportedParameter.Vision],
};

const userMessages: OpenRouterMessage[] = [
    { role: "user", content: "what is the meaning of life?" },
];

describe("buildChatCompletionRequest cache_control plumbing", () => {
    it("does not add cache markers when cacheControl is false", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            systemPrefix: "you are a helpful assistant",
        });

        // No system message added when cacheControl is false (search also off)
        expect(req.messages).toHaveLength(1);
        expect(req.messages[0]?.role).toBe("user");
    });

    it("does not add cache markers when systemPrefix is empty", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            cacheControl: true,
            systemPrefix: "   ",
        });
        expect(req.messages).toHaveLength(1);
        expect(req.messages[0]?.role).toBe("user");
    });

    it("emits a single cached system message containing the skill prompt", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            cacheControl: true,
            systemPrefix: "you are a senior copy editor",
        });

        expect(req.messages).toHaveLength(2);
        const sys = req.messages[0]!;
        expect(sys.role).toBe("system");
        expect(Array.isArray(sys.content)).toBe(true);
        const blocks = sys.content as Array<{
            type: string;
            text: string;
            cache_control?: { type: string };
        }>;
        expect(blocks).toEqual([
            {
                type: "text",
                text: "you are a senior copy editor",
                cache_control: { type: "ephemeral" },
            },
        ]);
    });

    it("folds search guidance into the cached system message when search is on", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: { ...baseSession, searchLevel: "medium" },
            model: baseModel,
            stream: false,
            cacheControl: true,
            systemPrefix: "you are a senior copy editor",
        });

        expect(req.messages).toHaveLength(2);
        const sys = req.messages[0]!;
        const blocks = sys.content as Array<{
            type: string;
            text: string;
            cache_control?: { type: string };
        }>;
        expect(blocks).toHaveLength(1);
        expect(blocks[0]?.text).toContain("you are a senior copy editor");
        expect(blocks[0]?.text).toContain(WEB_SEARCH_SYSTEM_GUIDANCE);
        expect(blocks[0]?.cache_control).toEqual({ type: "ephemeral" });
    });

    it("falls back to the legacy uncached search-guidance system msg when caching is off", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: { ...baseSession, searchLevel: "medium" },
            model: baseModel,
            stream: false,
        });

        expect(req.messages).toHaveLength(2);
        const sys = req.messages[0]!;
        expect(sys.role).toBe("system");
        // Legacy path emits a plain string, no cache_control.
        expect(typeof sys.content).toBe("string");
        expect(sys.content).toBe(WEB_SEARCH_SYSTEM_GUIDANCE);
    });
});
