import { test, expect, describe, beforeEach, vi } from "vitest";

const fetchMock = vi.fn(
    (..._args: Parameters<typeof fetch>): Promise<Response> => {
        return Promise.resolve({} as Response);
    },
);

(
    globalThis as unknown as {
        fetch?: typeof fetch & {
            mockClear: () => void;
            mockImplementation: (fn: any) => void;
            mock: { calls: any[][] };
        };
    }
).fetch = fetchMock as any;

import { SupportedParameter } from "@/lib/types";
import {
    fetchModels,
    sendMessage,
    validateApiKey,
    OpenRouterApiError,
    extractReasoningText,
    buildMessageContent,
} from "@/lib/openrouter";
import type { Attachment } from "@/lib/types";

const mockSession = {
    id: "session-123",
    title: "Test Chat",
    modelId: "anthropic/claude-3-5-sonnet",
    thinking: "medium" as const,
    searchLevel: "none" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
};

const mockModel = {
    id: "anthropic/claude-3-5-sonnet",
    name: "claude-3-5-sonnet",
    provider: "Anthropic",
    supportedParameters: [SupportedParameter.Reasoning],
};

describe("openrouter.ts", () => {
    beforeEach(() => {
        fetchMock.mockClear();
    });

    describe("fetchModels", () => {
        test("returns filtered models with text modality", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: "text/model1",
                            owned_by: "provider1",
                            architecture: {
                                input_modalities: ["text"],
                                output_modalities: ["text"],
                            },
                            supported_parameters: ["reasoning"],
                        },
                        {
                            id: "image/model2",
                            owned_by: "provider2",
                            architecture: {
                                input_modalities: ["image"],
                                output_modalities: ["text"],
                            },
                        },
                    ],
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const models = await fetchModels();

            expect(models).toHaveLength(1);
            expect(models[0]!.id).toBe("text/model1");
            expect(models[0]!.supportedParameters).toEqual([
                SupportedParameter.Reasoning,
            ]);
        });

        test("maps model properties correctly", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: "anthropic/claude-3-5-sonnet",
                            owned_by: "Anthropic",
                            architecture: {
                                input_modalities: ["text"],
                                output_modalities: ["text"],
                            },
                            supported_parameters: ["reasoning", "tools"],
                        },
                    ],
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const models = await fetchModels();

            expect(models[0]!.id).toBe("anthropic/claude-3-5-sonnet");
            expect(models[0]!.name).toBe("claude-3-5-sonnet");
            expect(models[0]!.provider).toBe("Anthropic");
        });

        test("extracts name from id", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: "google/gemini-pro",
                            owned_by: "Google",
                            architecture: {
                                input_modalities: ["text"],
                                output_modalities: ["text"],
                            },
                        },
                    ],
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const models = await fetchModels();

            expect(models[0]!.name).toBe("gemini-pro");
        });

        test("throws OpenRouterApiError on 401 unauthorized", async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                statusText: "Unauthorized",
                json: async () => ({
                    error: {
                        code: 401,
                        message: "Invalid API key",
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            await expect(fetchModels()).rejects.toThrow(OpenRouterApiError);
        });

        test("throws OpenRouterApiError with correct properties on 401", async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                statusText: "Unauthorized",
                json: async () => ({
                    error: {
                        code: 401,
                        message: "Invalid API key",
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            let caughtError: OpenRouterApiError | null = null;
            try {
                await fetchModels();
            } catch (err) {
                expect(err).toBeInstanceOf(OpenRouterApiError);
                caughtError = err as OpenRouterApiError;
            }
            expect(caughtError).not.toBeNull();
            expect(caughtError!.code).toBe(401);
            expect(caughtError!.message).toBe("Invalid API key");
            expect(caughtError!.isRetryable).toBe(false);
        });

        test("throws OpenRouterApiError on 402 no credits", async () => {
            const mockResponse = {
                ok: false,
                status: 402,
                statusText: "Payment Required",
                json: async () => ({
                    error: {
                        code: 402,
                        message: "Insufficient credits",
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            let caughtError: OpenRouterApiError | null = null;
            try {
                await fetchModels();
            } catch (err) {
                expect(err).toBeInstanceOf(OpenRouterApiError);
                caughtError = err as OpenRouterApiError;
            }
            expect(caughtError).not.toBeNull();
            expect(caughtError!.code).toBe(402);
            expect(caughtError!.isRetryable).toBe(false);
        });

        test("throws OpenRouterApiError on 429 rate limit", async () => {
            const mockResponse = {
                ok: false,
                status: 429,
                statusText: "Too Many Requests",
                json: async () => ({
                    error: {
                        code: 429,
                        message: "Rate limit exceeded",
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            let caughtError: OpenRouterApiError | null = null;
            try {
                await fetchModels();
            } catch (err) {
                expect(err).toBeInstanceOf(OpenRouterApiError);
                caughtError = err as OpenRouterApiError;
            }
            expect(caughtError).not.toBeNull();
            expect(caughtError!.code).toBe(429);
            expect(caughtError!.isRetryable).toBe(true);
        });

        test("throws OpenRouterApiError on 403 moderation with metadata", async () => {
            const mockResponse = {
                ok: false,
                status: 403,
                statusText: "Forbidden",
                json: async () => ({
                    error: {
                        code: 403,
                        message: "Content flagged",
                        metadata: {
                            reasons: ["hate"],
                            flagged_input: "Bad content",
                        },
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            let caughtError: OpenRouterApiError | null = null;
            try {
                await fetchModels();
            } catch (err) {
                expect(err).toBeInstanceOf(OpenRouterApiError);
                caughtError = err as OpenRouterApiError;
            }
            expect(caughtError).not.toBeNull();
            expect(caughtError!.code).toBe(403);
            expect(caughtError!.metadata?.moderationReasons).toEqual(["hate"]);
            expect(caughtError!.metadata?.flaggedInput).toBe("Bad content");
        });
    });

    describe("validateApiKey", () => {
        test("returns true on success", async () => {
            const mockResponse = { ok: true } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const result = await validateApiKey("valid-key");

            expect(result).toBe(true);
        });

        test("returns false on error response", async () => {
            const mockResponse = {
                ok: false,
                status: 401,
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const result = await validateApiKey("invalid-key");

            expect(result).toBe(false);
        });

        test("returns false on fetch error", async () => {
            fetchMock.mockImplementation(() =>
                Promise.reject(new Error("Network error")),
            );

            const result = await validateApiKey("test-key");

            expect(result).toBe(false);
        });
    });

    describe("sendMessage", () => {
        test("builds correct request body", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    id: "resp-123",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "anthropic/claude-3-5-sonnet",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "Hello!",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const messages = [{ role: "user", content: "Hi" }];
            const result = await sendMessage(
                "api-key",
                messages,
                mockSession,
                mockModel,
            );

            expect(fetchMock).toHaveBeenCalledWith(
                "https://openrouter.ai/api/v1/chat/completions",
                expect.objectContaining({
                    method: "POST",
                    headers: expect.objectContaining({
                        Authorization: "Bearer api-key",
                        "Content-Type": "application/json",
                    }),
                    body: JSON.stringify({
                        model: "anthropic/claude-3-5-sonnet",
                        messages: [{ role: "user", content: "Hi" }],
                        stream: false,
                        reasoning: { effort: "medium" },
                    }),
                }),
            );
        });

        test("adds reasoning for supported model", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    id: "resp-123",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "anthropic/claude-3-5-sonnet",
                    choices: [],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const sessionWithThinking = {
                ...mockSession,
                thinking: "high" as const,
            };
            await sendMessage("api-key", [], sessionWithThinking, mockModel);

            const callArg = JSON.parse(
                (fetchMock.mock.calls[0]![1] as { body?: string }).body ?? "{}",
            ) as Record<string, unknown> & { plugins?: unknown };
            expect(callArg.reasoning).toEqual({ effort: "high" });
        });

        test("skips reasoning for unsupported model", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    id: "resp-123",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "test/model",
                    choices: [],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const modelWithoutReasoning = {
                id: "test/model",
                name: "test",
                provider: "test",
            };
            await sendMessage(
                "api-key",
                [],
                mockSession,
                modelWithoutReasoning,
            );

            const callArg = JSON.parse(
                (fetchMock.mock.calls[0]![1] as { body?: string }).body ?? "{}",
            ) as Record<string, unknown> & { plugins?: unknown };
            expect(callArg.reasoning).toBeUndefined();
        });

        test("uses online model for search", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    id: "resp-123",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "anthropic/claude-3-5-sonnet:online",
                    choices: [],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const sessionWithSearch = {
                ...mockSession,
                searchLevel: "medium" as const,
            };
            const modelWithTools = {
                ...mockModel,
                supportedParameters: [SupportedParameter.Tools],
            };
            await sendMessage("api-key", [], sessionWithSearch, modelWithTools);

            const callArg = JSON.parse(
                (fetchMock.mock.calls[0]![1] as { body?: string }).body ?? "{}",
            ) as Record<string, unknown> & { tools?: unknown };
            expect(callArg.model).toBe("anthropic/claude-3-5-sonnet");
            expect(callArg.tools).toEqual([
                {
                    type: "openrouter:web_search",
                    parameters: {
                        max_results: 6,
                        search_context_size: "medium",
                    },
                },
            ]);
        });

        test("adds web search tool with low search level (3 results)", async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
                json: async () => ({
                    id: "response-123",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "anthropic/claude-3-5-sonnet",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "" },
                        },
                    ],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const sessionWithSearch = {
                ...mockSession,
                searchLevel: "low" as const,
            };
            const modelWithTools = {
                ...mockModel,
                supportedParameters: [SupportedParameter.Tools],
            };
            await sendMessage("api-key", [], sessionWithSearch, modelWithTools);

            const callArg = JSON.parse(
                (fetchMock.mock.calls[0]![1] as { body?: string }).body ?? "{}",
            ) as Record<string, unknown> & { tools?: unknown };
            expect(callArg.tools).toEqual([
                {
                    type: "openrouter:web_search",
                    parameters: {
                        max_results: 3,
                        search_context_size: "low",
                    },
                },
            ]);
        });

        test("adds web search tool with high search level (10 results)", async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
                json: async () => ({
                    id: "response-123",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "anthropic/claude-3-5-sonnet",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "" },
                        },
                    ],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const sessionWithSearch = {
                ...mockSession,
                searchLevel: "high" as const,
            };
            const modelWithTools = {
                ...mockModel,
                supportedParameters: [SupportedParameter.Tools],
            };
            await sendMessage("api-key", [], sessionWithSearch, modelWithTools);

            const callArg = JSON.parse(
                (fetchMock.mock.calls[0]![1] as { body?: string }).body ?? "{}",
            ) as Record<string, unknown> & { tools?: unknown };
            expect(callArg.tools).toEqual([
                {
                    type: "openrouter:web_search",
                    parameters: {
                        max_results: 10,
                        search_context_size: "high",
                    },
                },
            ]);
        });

        test("no web search tool when search level is none", async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                body: {
                    getReader: () => ({
                        read: async () => ({ done: true, value: undefined }),
                    }),
                },
                json: async () => ({
                    id: "response-123",
                    object: "chat.completion",
                    created: Date.now(),
                    model: "anthropic/claude-3-5-sonnet",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "" },
                        },
                    ],
                    usage: {
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const sessionNoSearch = {
                ...mockSession,
                searchLevel: "none" as const,
            };
            const modelWithTools = {
                ...mockModel,
                supportedParameters: [SupportedParameter.Tools],
            };
            await sendMessage("api-key", [], sessionNoSearch, modelWithTools);

            const callArg = JSON.parse(
                (fetchMock.mock.calls[0]![1] as { body?: string }).body ?? "{}",
            ) as Record<string, unknown> & { tools?: unknown };
            expect(callArg.tools).toBeUndefined();
        });

        test("throws OpenRouterApiError on API failure", async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                statusText: "Unauthorized",
                json: async () => ({
                    error: {
                        code: 401,
                        message: "Invalid API key",
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            let caughtError: OpenRouterApiError | null = null;
            try {
                await sendMessage("api-key", [], mockSession, mockModel);
            } catch (err) {
                expect(err).toBeInstanceOf(OpenRouterApiError);
                caughtError = err as OpenRouterApiError;
            }
            expect(caughtError).not.toBeNull();
            expect(caughtError!.code).toBe(401);
            expect(caughtError!.isRetryable).toBe(false);
        });

        test("throws OpenRouterApiError on 429 rate limit", async () => {
            const mockResponse = {
                ok: false,
                status: 429,
                statusText: "Too Many Requests",
                json: async () => ({
                    error: {
                        code: 429,
                        message: "Rate limit exceeded",
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            let caughtError: OpenRouterApiError | null = null;
            try {
                await sendMessage("api-key", [], mockSession, mockModel);
            } catch (err) {
                expect(err).toBeInstanceOf(OpenRouterApiError);
                caughtError = err as OpenRouterApiError;
            }
            expect(caughtError).not.toBeNull();
            expect(caughtError!.code).toBe(429);
            expect(caughtError!.isRetryable).toBe(true);
        });

        test("returns response on success", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    id: "resp-123",
                    object: "chat.completion",
                    created: 1234567890,
                    model: "anthropic/claude-3-5-sonnet",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: "Hello!",
                            },
                            finish_reason: "stop",
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 5,
                        total_tokens: 15,
                    },
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const result = await sendMessage(
                "api-key",
                [],
                mockSession,
                mockModel,
            );

            expect(result.id).toBe("resp-123");
            expect(result.choices[0]!.message.content).toBe("Hello!");
            expect(result.usage.total_tokens).toBe(15);
        });

        test("handles streaming response", async () => {
            const mockReadableStream = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    const data = JSON.stringify({
                        choices: [{ delta: { content: "Hello" } }],
                    });
                    controller.enqueue(encoder.encode(`data: ${data}\n`));
                    controller.enqueue(encoder.encode("data: [DONE]\n"));
                    controller.close();
                },
            });

            const mockResponse = {
                ok: true,
                body: mockReadableStream,
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const chunks: string[] = [];
            const result = await sendMessage(
                "api-key",
                [],
                mockSession,
                mockModel,
                (chunk) => {
                    chunks.push(chunk);
                },
            );

            expect(chunks).toContain("Hello");
            // No `id` was streamed by the mock; falls back to empty string
            // (we no longer fabricate "streaming").
            expect(result.id).toBe("");
        });

        test("finishes stream on finish_reason", async () => {
            const encoder = new TextEncoder();
            const data = JSON.stringify({
                choices: [
                    {
                        delta: { content: "Done" },
                        finish_reason: "stop",
                    },
                ],
            });
            let readCount = 0;
            let cancelCalled = false;

            const reader = {
                read: () => {
                    readCount += 1;
                    if (readCount === 1) {
                        return Promise.resolve({
                            done: false,
                            value: encoder.encode(`data: ${data}\n`),
                        });
                    }
                    return Promise.reject(new Error("Unexpected read"));
                },
                cancel: () => {
                    cancelCalled = true;
                    return Promise.resolve();
                },
            };

            const mockResponse = {
                ok: true,
                body: { getReader: () => reader },
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const chunks: string[] = [];
            await sendMessage(
                "api-key",
                [],
                mockSession,
                mockModel,
                (chunk) => {
                    if (chunk) {
                        chunks.push(chunk);
                    }
                },
            );

            expect(chunks).toContain("Done");
            expect(readCount).toBe(1);
            expect(cancelCalled).toBe(true);
        });

        test("throws OpenRouterApiError on mid-stream error", async () => {
            const mockReadableStream = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    const errorChunk = JSON.stringify({
                        id: "test-123",
                        object: "chat.completion.chunk",
                        error: {
                            code: 502,
                            message: "Provider disconnected",
                        },
                        choices: [
                            {
                                index: 0,
                                delta: { content: "" },
                                finish_reason: "error",
                            },
                        ],
                    });
                    controller.enqueue(encoder.encode(`data: ${errorChunk}\n`));
                    controller.close();
                },
            });

            const mockResponse = {
                ok: true,
                body: mockReadableStream,
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            let caughtError: OpenRouterApiError | null = null;
            try {
                await sendMessage(
                    "api-key",
                    [],
                    mockSession,
                    mockModel,
                    () => {},
                );
            } catch (err) {
                expect(err).toBeInstanceOf(OpenRouterApiError);
                caughtError = err as OpenRouterApiError;
            }
            expect(caughtError).not.toBeNull();
            expect(caughtError!.code).toBe(502);
            expect(caughtError!.isRetryable).toBe(true);
        });

        test("handles streaming reasoning_details", async () => {
            const mockReadableStream = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();
                    const reasoningChunk = JSON.stringify({
                        choices: [
                            {
                                delta: {
                                    reasoning_details: [
                                        {
                                            id: "r1",
                                            type: "reasoning.text",
                                            text: "Let me think...",
                                        },
                                    ],
                                },
                            },
                        ],
                    });
                    const contentChunk = JSON.stringify({
                        choices: [{ delta: { content: "Hello!" } }],
                    });
                    controller.enqueue(
                        encoder.encode(`data: ${reasoningChunk}\n`),
                    );
                    controller.enqueue(
                        encoder.encode(`data: ${contentChunk}\n`),
                    );
                    controller.enqueue(encoder.encode("data: [DONE]\n"));
                    controller.close();
                },
            });

            const mockResponse = {
                ok: true,
                body: mockReadableStream,
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const contentChunks: string[] = [];
            const thinkingChunks: string[] = [];
            await sendMessage(
                "api-key",
                [],
                mockSession,
                mockModel,
                (chunk, thinking) => {
                    if (thinking) {
                        thinkingChunks.push(thinking);
                    } else if (chunk) {
                        contentChunks.push(chunk);
                    }
                },
            );

            expect(thinkingChunks).toContain("Let me think...");
            expect(contentChunks).toContain("Hello!");
        });
    });

    describe("extractReasoningText", () => {
        test("extracts text from reasoning.text details", () => {
            const details = [
                { id: "1", type: "reasoning.text" as const, text: "Step 1" },
                { id: "2", type: "reasoning.text" as const, text: " Step 2" },
            ];
            expect(extractReasoningText(details)).toBe("Step 1 Step 2");
        });

        test("extracts text from reasoning.summary details", () => {
            const details = [
                {
                    id: "1",
                    type: "reasoning.summary" as const,
                    text: "Summary here",
                },
            ];
            expect(extractReasoningText(details)).toBe("Summary here");
        });

        test("ignores encrypted reasoning details", () => {
            const details = [
                {
                    id: "1",
                    type: "reasoning.encrypted" as const,
                    text: "encrypted",
                },
                { id: "2", type: "reasoning.text" as const, text: "Visible" },
            ];
            expect(extractReasoningText(details)).toBe("Visible");
        });

        test("handles empty details array", () => {
            expect(extractReasoningText([])).toBe("");
        });

        test("handles missing text field", () => {
            const details = [
                { id: "1", type: "reasoning.text" as const },
                { id: "2", type: "reasoning.text" as const, text: "Valid" },
            ];
            expect(extractReasoningText(details)).toBe("Valid");
        });

        test("combines text and summary types", () => {
            const details = [
                { id: "1", type: "reasoning.text" as const, text: "Thinking " },
                {
                    id: "2",
                    type: "reasoning.summary" as const,
                    text: "summary",
                },
            ];
            expect(extractReasoningText(details)).toBe("Thinking summary");
        });
    });

    describe("fetchModels vision support", () => {
        test("includes models with text+image input", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: "openai/gpt-4o",
                            owned_by: "OpenAI",
                            architecture: {
                                input_modalities: ["text", "image"],
                                output_modalities: ["text"],
                            },
                            supported_parameters: ["tools"],
                        },
                    ],
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const models = await fetchModels();

            expect(models).toHaveLength(1);
            expect(models[0]!.id).toBe("openai/gpt-4o");
        });

        test("maps vision capability to SupportedParameter", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: "openai/gpt-4o",
                            owned_by: "OpenAI",
                            architecture: {
                                input_modalities: ["text", "image"],
                                output_modalities: ["text"],
                            },
                            supported_parameters: [],
                        },
                    ],
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const models = await fetchModels();

            expect(models[0]!.supportedParameters).toContain(
                SupportedParameter.Vision,
            );
        });

        test("excludes image-only input models", async () => {
            const mockResponse = {
                ok: true,
                json: async () => ({
                    data: [
                        {
                            id: "image-only/model",
                            owned_by: "provider",
                            architecture: {
                                input_modalities: ["image"],
                                output_modalities: ["text"],
                            },
                        },
                    ],
                }),
            } as unknown as Response;
            fetchMock.mockImplementation(() => Promise.resolve(mockResponse));

            const models = await fetchModels();

            expect(models).toHaveLength(0);
        });
    });

    describe("buildMessageContent", () => {
        const mockAttachment: Attachment = {
            id: "att-1",
            messageId: "msg-1",
            type: "image",
            mimeType: "image/jpeg",
            data: "base64data",
            width: 100,
            height: 100,
            size: 1000,
            createdAt: Date.now(),
        };

        test("buildMessageContent text only returns string", () => {
            const result = buildMessageContent("Hello world");

            expect(typeof result).toBe("string");
            expect(result).toBe("Hello world");
        });

        test("buildMessageContent with attachments returns array", () => {
            const result = buildMessageContent("Hello", [mockAttachment]);

            expect(Array.isArray(result)).toBe(true);
        });

        test("buildMessageContent includes images and text", () => {
            const result = buildMessageContent("Hello", [mockAttachment]);

            expect(Array.isArray(result)).toBe(true);
            const arr = result as Array<{ type: string }>;
            expect(arr).toHaveLength(2);
            expect(arr[0]!.type).toBe("image_url");
            expect(arr[1]!.type).toBe("text");
        });

        test("buildMessageContent formats image URL correctly", () => {
            const result = buildMessageContent("Hello", [mockAttachment]);

            expect(Array.isArray(result)).toBe(true);
            const arr = result as Array<{
                type: string;
                image_url?: { url: string };
            }>;
            const imageContent = arr.find((c) => c.type === "image_url");
            expect(imageContent?.image_url?.url).toBe(
                "data:image/jpeg;base64,base64data",
            );
        });

        test("buildMessageContent handles multiple images", () => {
            const attachment2: Attachment = {
                ...mockAttachment,
                id: "att-2",
                mimeType: "image/png",
                data: "pngdata",
            };
            const result = buildMessageContent("Text", [
                mockAttachment,
                attachment2,
            ]);

            expect(Array.isArray(result)).toBe(true);
            const arr = result as Array<{ type: string }>;
            expect(arr).toHaveLength(3); // 2 images + 1 text
            const imageContents = arr.filter((c) => c.type === "image_url");
            expect(imageContents).toHaveLength(2);
        });

        test("buildMessageContent with empty attachments returns string", () => {
            const result = buildMessageContent("Hello", []);

            expect(typeof result).toBe("string");
            expect(result).toBe("Hello");
        });

        test("buildMessageContent with undefined attachments returns string", () => {
            const result = buildMessageContent("Hello", undefined);

            expect(typeof result).toBe("string");
            expect(result).toBe("Hello");
        });

        test("buildMessageContent with empty text still includes text content", () => {
            const result = buildMessageContent("", [mockAttachment]);

            expect(Array.isArray(result)).toBe(true);
            const arr = result as Array<{ type: string }>;
            // Empty text should not be added
            expect(arr).toHaveLength(1);
            expect(arr[0]!.type).toBe("image_url");
        });
    });
});
