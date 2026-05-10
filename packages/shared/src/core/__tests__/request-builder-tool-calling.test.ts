import { describe, expect, it } from "vitest";
import { buildChatCompletionRequest } from "../openrouter/request-builder";
import type {
    ChatSession,
    FunctionTool,
    OpenRouterMessage,
    ToolCall,
} from "../openrouter/types";
import { SupportedParameter, type OpenRouterModel } from "../models";

const baseSession: ChatSession = {
    id: "chat-1",
    modelId: "anthropic/claude-sonnet-4",
    thinking: "none",
    searchLevel: "none",
};

const baseModel: OpenRouterModel = {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    supportedParameters: [SupportedParameter.Tools],
};

const baseMessages: OpenRouterMessage[] = [
    { role: "user", content: "What is the weather in Paris?" },
];

const getWeather: FunctionTool = {
    type: "function",
    function: {
        name: "get_weather",
        description: "Look up the current weather for a city.",
        parameters: {
            type: "object",
            properties: {
                city: { type: "string" },
                units: { type: "string", enum: ["c", "f"] },
            },
            required: ["city"],
        },
    },
};

describe("buildChatCompletionRequest tool calling", () => {
    it("omits tool fields when no tools are requested", () => {
        const req = buildChatCompletionRequest({
            messages: baseMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
        });
        expect(req.tools).toBeUndefined();
        expect(req.tool_choice).toBeUndefined();
        expect(req.parallel_tool_calls).toBeUndefined();
    });

    it("emits function tools as `tools[]`", () => {
        const req = buildChatCompletionRequest({
            messages: baseMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
        });
        expect(req.tools).toEqual([getWeather]);
    });

    it("merges function tools with the implicit web-search tool", () => {
        const req = buildChatCompletionRequest({
            messages: baseMessages,
            session: { ...baseSession, searchLevel: "medium" },
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
        });
        expect(req.tools).toHaveLength(2);
        // Function tools come first so any downstream tool-count cap
        // truncates the server-injected web-search tool before user tools.
        expect(req.tools?.[0]).toEqual(getWeather);
        expect(req.tools?.[1]?.type).toBe("openrouter:web_search");
    });

    it("emits tool_choice strings and object form", () => {
        const auto = buildChatCompletionRequest({
            messages: baseMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
            toolChoice: "auto",
        });
        expect(auto.tool_choice).toBe("auto");

        const required = buildChatCompletionRequest({
            messages: baseMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
            toolChoice: "required",
        });
        expect(required.tool_choice).toBe("required");

        const forced = buildChatCompletionRequest({
            messages: baseMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
            toolChoice: {
                type: "function",
                function: { name: "get_weather" },
            },
        });
        expect(forced.tool_choice).toEqual({
            type: "function",
            function: { name: "get_weather" },
        });
    });

    it("passes parallel_tool_calls through", () => {
        const off = buildChatCompletionRequest({
            messages: baseMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
            parallelToolCalls: false,
        });
        expect(off.parallel_tool_calls).toBe(false);

        const on = buildChatCompletionRequest({
            messages: baseMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
            parallelToolCalls: true,
        });
        expect(on.parallel_tool_calls).toBe(true);
    });

    it("preserves tool_calls + tool_call_id + name on replayed messages", () => {
        const toolCalls: ToolCall[] = [
            {
                id: "call_abc",
                type: "function",
                function: {
                    name: "get_weather",
                    arguments: '{"city":"Paris"}',
                },
            },
        ];
        const conversation: OpenRouterMessage[] = [
            { role: "user", content: "Weather in Paris?" },
            { role: "assistant", content: "", tool_calls: toolCalls },
            {
                role: "tool",
                content: '{"tempC":15}',
                tool_call_id: "call_abc",
                name: "get_weather",
            },
        ];
        const req = buildChatCompletionRequest({
            messages: conversation,
            session: baseSession,
            model: baseModel,
            stream: false,
            functionTools: [getWeather],
        });
        expect(req.messages[1]?.tool_calls).toEqual(toolCalls);
        expect(req.messages[2]?.tool_call_id).toBe("call_abc");
        expect(req.messages[2]?.name).toBe("get_weather");
    });
});
