import { describe, expect, it } from "vitest";
import { buildChatCompletionRequest } from "../openrouter/request-builder";
import type { ChatSession, OpenRouterMessage } from "../openrouter/types";
import { SupportedParameter, type OpenRouterModel } from "../models";

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

const userMessages: OpenRouterMessage[] = [{ role: "user", content: "hi" }];

describe("buildChatCompletionRequest provider routing", () => {
    it("omits provider when no sort is requested", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
        });
        expect(req.provider).toBeUndefined();
    });

    it("omits provider when providerSort is explicitly undefined", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            providerSort: undefined,
        });
        expect(req.provider).toBeUndefined();
    });

    it("emits provider.sort = price", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            providerSort: "price",
        });
        expect(req.provider).toEqual({ sort: "price" });
    });

    it("emits provider.sort = throughput", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            providerSort: "throughput",
        });
        expect(req.provider).toEqual({ sort: "throughput" });
    });

    it("emits provider.sort = latency", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            providerSort: "latency",
        });
        expect(req.provider).toEqual({ sort: "latency" });
    });

    it("coexists with reasoning and tools without clobbering them", () => {
        const reasoningModel: OpenRouterModel = {
            ...baseModel,
            supportedParameters: [
                SupportedParameter.Tools,
                SupportedParameter.Reasoning,
            ],
        };
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: { ...baseSession, thinking: "high", searchLevel: "low" },
            model: reasoningModel,
            stream: true,
            providerSort: "price",
        });
        expect(req.provider).toEqual({ sort: "price" });
        expect(req.reasoning).toBeDefined();
        expect(req.tools).toBeDefined();
        expect(req.stream).toBe(true);
    });
});
