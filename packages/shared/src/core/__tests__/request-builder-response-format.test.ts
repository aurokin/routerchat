import { describe, expect, it } from "vitest";
import { buildChatCompletionRequest } from "../openrouter/request-builder";
import type {
    ChatSession,
    OpenRouterMessage,
    ResponseFormat,
} from "../openrouter/types";
import { SupportedParameter, type OpenRouterModel } from "../models";

const baseSession: ChatSession = {
    id: "chat-1",
    modelId: "openai/gpt-4o",
    thinking: "none",
    searchLevel: "none",
};

const baseModel: OpenRouterModel = {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    supportedParameters: [SupportedParameter.Tools],
};

const userMessages: OpenRouterMessage[] = [
    { role: "user", content: "Return the answer as JSON" },
];

describe("buildChatCompletionRequest response_format passthrough", () => {
    it("omits response_format when none is requested", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
        });
        expect(req.response_format).toBeUndefined();
    });

    it("emits json_object response_format", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            responseFormat: { type: "json_object" },
        });
        expect(req.response_format).toEqual({ type: "json_object" });
    });

    it("emits json_schema response_format with strict + schema", () => {
        const responseFormat: ResponseFormat = {
            type: "json_schema",
            json_schema: {
                name: "person",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        age: { type: "number" },
                    },
                    required: ["name", "age"],
                    additionalProperties: false,
                },
            },
        };
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            responseFormat,
        });
        expect(req.response_format).toEqual(responseFormat);
    });

    it("does not clobber when used alongside provider routing", () => {
        const req = buildChatCompletionRequest({
            messages: userMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            providerSort: "price",
            responseFormat: { type: "json_object" },
        });
        expect(req.provider).toEqual({ sort: "price" });
        expect(req.response_format).toEqual({ type: "json_object" });
    });
});
