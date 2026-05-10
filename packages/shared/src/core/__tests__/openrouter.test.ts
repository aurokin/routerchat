import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Attachment } from "../types";
import {
    buildMessageContent,
    fetchModels,
    extractReasoningText,
    sendMessage,
    validateApiKey,
    getKeyInfo,
    getCredits,
    type ReasoningDetailChunk,
    type OpenRouterMessage,
    type ChatCompletionResponse,
    type ChatSession as OpenRouterChatSession,
    OpenRouterApiErrorImpl,
} from "../openrouter";
import { SupportedParameter, type OpenRouterModel } from "../models";

const originalFetch = globalThis.fetch;
let lastRequest:
    | {
          input: RequestInfo | URL;
          init?: RequestInit;
      }
    | undefined;

const mockFetch = (
    responder: (input: RequestInfo | URL, init?: RequestInit) => Response,
) => {
    const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
        lastRequest = { input, init };
        return responder(input, init);
    };
    const preconnect =
        "preconnect" in originalFetch &&
        typeof originalFetch.preconnect === "function"
            ? originalFetch.preconnect.bind(originalFetch)
            : () => undefined;
    globalThis.fetch = Object.assign(mock, { preconnect });
};

beforeEach(() => {
    lastRequest = undefined;
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("openrouter helpers", () => {
    it("builds message content with attachments", () => {
        const attachments: Attachment[] = [
            {
                id: "att-1",
                messageId: "message-1",
                type: "image",
                mimeType: "image/png",
                data: "abc123",
                width: 1,
                height: 1,
                size: 10,
                createdAt: 1,
            },
        ];

        const content = buildMessageContent("hello", attachments);
        expect(Array.isArray(content)).toBe(true);
        if (Array.isArray(content)) {
            expect(content[0]).toEqual({
                type: "image_url",
                image_url: {
                    url: "data:image/png;base64,abc123",
                },
            });
            expect(content[1]).toEqual({ type: "text", text: "hello" });
        }
    });

    it("returns raw text when no attachments", () => {
        expect(buildMessageContent("hello")).toBe("hello");
    });

    it("uses attachment.url for URL-passthrough attachments instead of data URI", () => {
        const attachments: Attachment[] = [
            {
                id: "att-url",
                messageId: "message-1",
                type: "image",
                mimeType: "image/png",
                data: "",
                width: 0,
                height: 0,
                size: 0,
                url: "https://example.com/pic.png",
                createdAt: 1,
            },
        ];

        const content = buildMessageContent("hi", attachments);
        expect(Array.isArray(content)).toBe(true);
        if (Array.isArray(content)) {
            expect(content[0]).toEqual({
                type: "image_url",
                image_url: { url: "https://example.com/pic.png" },
            });
        }
    });

    it("extracts reasoning text from detail chunks", () => {
        const details: ReasoningDetailChunk[] = [
            { id: "1", type: "reasoning.text", text: "Hello " },
            { id: "2", type: "reasoning.summary", text: "world" },
            { id: "3", type: "reasoning.encrypted", text: "secret" },
            { id: "4", type: "reasoning.text" },
        ];

        expect(extractReasoningText(details)).toBe("Hello world");
    });
});

describe("fetchModels", () => {
    it("maps supported parameters and filters non-text models", async () => {
        const responseBody = {
            data: [
                {
                    id: "provider/text-model",
                    owned_by: "provider",
                    supported_parameters: ["tools", "reasoning"],
                    architecture: {
                        input_modalities: ["text", "image"],
                        output_modalities: ["text"],
                    },
                },
                {
                    id: "provider/vision-only",
                    owned_by: "provider",
                    supported_parameters: ["tools"],
                    architecture: {
                        input_modalities: ["image"],
                        output_modalities: ["image"],
                    },
                },
            ],
        };

        mockFetch(
            () =>
                new Response(JSON.stringify(responseBody), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const models = await fetchModels();

        expect(models).toHaveLength(1);
        expect(models[0]).toEqual({
            id: "provider/text-model",
            name: "text-model",
            provider: "provider",
            supportedParameters: [
                SupportedParameter.Tools,
                SupportedParameter.Reasoning,
                SupportedParameter.Vision,
            ],
        });
    });

    it("throws a typed error when fetch fails", async () => {
        mockFetch(
            () =>
                new Response(JSON.stringify({ error: { message: "fail" } }), {
                    status: 500,
                    statusText: "Server Error",
                    headers: { "Content-Type": "application/json" },
                }),
        );

        let caught: unknown;
        try {
            await fetchModels();
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(OpenRouterApiErrorImpl);
        if (caught instanceof OpenRouterApiErrorImpl) {
            expect(caught.code).toBe(500);
        }
    });
});

describe("sendMessage", () => {
    const messages: OpenRouterMessage[] = [{ role: "user", content: "Hello" }];
    const session: OpenRouterChatSession = {
        id: "session-1",
        modelId: "provider/model",
        thinking: "high",
        searchLevel: "medium",
    };
    const responseBody: ChatCompletionResponse = {
        id: "resp-1",
        object: "chat.completion",
        created: 1,
        model: "provider/model",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: "Hi" },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
        },
    };

    it("adds web search tool and reasoning when supported", async () => {
        const model: OpenRouterModel = {
            id: "provider/model",
            name: "model",
            provider: "provider",
            supportedParameters: [
                SupportedParameter.Tools,
                SupportedParameter.Reasoning,
            ],
        };

        mockFetch(
            () =>
                new Response(JSON.stringify(responseBody), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const result = await sendMessage("key", messages, session, model);

        expect(result.id).toBe("resp-1");
        const body = JSON.parse(String(lastRequest?.init?.body ?? "{}")) as {
            model: string;
            messages: OpenRouterMessage[];
            stream: boolean;
            tools?: Array<{
                type: string;
                parameters?: {
                    max_results?: number;
                    search_context_size?: string;
                };
            }>;
            reasoning?: { effort: string };
        };

        expect(String(lastRequest?.input)).toContain(
            "https://openrouter.ai/api/v1/chat/completions",
        );
        expect(body.model).toBe("provider/model");
        expect(body.messages).toHaveLength(2);
        expect(body.messages[0]).toMatchObject({
            role: "system",
        });
        expect(body.messages[1]).toEqual(messages[0]);
        expect(body.stream).toBe(false);
        expect(body.tools).toEqual([
            {
                type: "openrouter:web_search",
                parameters: {
                    max_results: 6,
                    search_context_size: "medium",
                },
            },
        ]);
        expect(body.reasoning).toEqual({ effort: "high" });
    });

    it("skips tools and reasoning when unsupported", async () => {
        const model: OpenRouterModel = {
            id: "provider/model",
            name: "model",
            provider: "provider",
            supportedParameters: [],
        };

        mockFetch(
            () =>
                new Response(JSON.stringify(responseBody), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        await sendMessage("key", messages, session, model);

        const body = JSON.parse(String(lastRequest?.init?.body ?? "{}")) as {
            tools?: unknown;
            reasoning?: { effort: string };
        };

        expect(body.tools).toBeUndefined();
        expect(body.reasoning).toBeUndefined();
    });

    it("throws a typed error when request fails", async () => {
        mockFetch(
            () =>
                new Response(
                    JSON.stringify({
                        error: {
                            code: 401,
                            message: "Invalid API key",
                        },
                    }),
                    {
                        status: 401,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
        );

        let caught: unknown;
        try {
            await sendMessage("bad", messages, session, undefined);
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(OpenRouterApiErrorImpl);
        if (caught instanceof OpenRouterApiErrorImpl) {
            expect(caught.code).toBe(401);
        }
    });

    it("streams chunks and calls onChunk", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
                    ),
                );
                controller.enqueue(
                    encoder.encode(
                        'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n',
                    ),
                );
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
            },
        });

        mockFetch(
            () =>
                new Response(stream, {
                    status: 200,
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );

        const chunks: string[] = [];
        const result = await sendMessage(
            "key",
            messages,
            session,
            undefined,
            (chunk) => {
                if (chunk) chunks.push(chunk);
            },
        );

        expect(chunks.join("")).toBe("Hello");
        expect(result.id).toBe("");
    });

    it("streams chunks from async iterable fallback", async () => {
        const asyncBody: AsyncIterable<string> = {
            async *[Symbol.asyncIterator]() {
                yield 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n';
                yield 'data: {"choices":[{"delta":{"content":"!"},"finish_reason":"stop"}]}\n\n';
                yield "data: [DONE]\n\n";
            },
        };

        mockFetch(() => {
            const response = {
                ok: true,
                status: 200,
                statusText: "OK",
                body: asyncBody,
                json: async () => responseBody,
                text: async () => "",
            } as unknown as Response;
            return response;
        });

        const chunks: string[] = [];
        const result = await sendMessage(
            "key",
            messages,
            session,
            undefined,
            (chunk) => {
                if (chunk) chunks.push(chunk);
            },
        );

        expect(chunks.join("")).toBe("Hi!");
        expect(result.id).toBe("");
    });

    it("throws a typed error on mid-stream SSE error", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        'data: {"error":{"code":502,"message":"Provider disconnected"},"choices":[{"finish_reason":"error"}]}' +
                            "\n\n",
                    ),
                );
                controller.close();
            },
        });

        mockFetch(
            () =>
                new Response(stream, {
                    status: 200,
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );

        let caught: unknown;
        try {
            await sendMessage("key", messages, session, undefined, () => {
                return;
            });
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(OpenRouterApiErrorImpl);
        if (caught instanceof OpenRouterApiErrorImpl) {
            expect(caught.code).toBe(502);
        }
    });

    it("parses JSON fallback when no SSE lines", async () => {
        const fallbackResponse: ChatCompletionResponse = {
            id: "resp-json",
            object: "chat.completion",
            created: 1,
            model: "provider/model",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "Fallback",
                        thinking: "Thought",
                    },
                    finish_reason: "stop",
                },
            ],
            usage: {
                prompt_tokens: 1,
                completion_tokens: 1,
                total_tokens: 2,
            },
        };

        mockFetch(() => {
            const response = {
                ok: true,
                status: 200,
                statusText: "OK",
                body: null,
                text: async () => JSON.stringify(fallbackResponse),
                json: async () => fallbackResponse,
            } as unknown as Response;
            return response;
        });

        const chunks: Array<{ content: string; thinking: string }> = [];
        const result = await sendMessage(
            "key",
            messages,
            session,
            undefined,
            (chunk, thinking) => {
                chunks.push({ content: chunk, thinking: thinking ?? "" });
            },
        );

        expect(result.id).toBe("resp-json");
        expect(chunks.some((chunk) => chunk.content === "Fallback")).toBe(true);
        expect(chunks.some((chunk) => chunk.thinking === "Thought")).toBe(true);
    });
});

describe("sendMessage xhr fallback", () => {
    const originalXMLHttpRequest = globalThis.XMLHttpRequest;
    const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        "navigator",
    );

    class MockXmlHttpRequest {
        static responder: (xhr: MockXmlHttpRequest) => void = () => undefined;

        status = 0;
        statusText = "";
        responseText = "";
        aborted = false;
        requestHeaders: Record<string, string> = {};
        onprogress: (() => void) | null = null;
        onload: (() => void) | null = null;
        onabort: (() => void) | null = null;
        onerror: (() => void) | null = null;

        open(_method: string, _url: string) {
            return;
        }

        setRequestHeader(key: string, value: string) {
            this.requestHeaders[key] = value;
        }

        send(_body?: unknown) {
            MockXmlHttpRequest.responder(this);
        }

        abort() {
            if (this.aborted) return;
            this.aborted = true;
            this.onabort?.();
        }
    }

    const restoreNavigator = () => {
        if (originalNavigatorDescriptor) {
            Object.defineProperty(
                globalThis,
                "navigator",
                originalNavigatorDescriptor,
            );
            return;
        }
        delete (globalThis as { navigator?: unknown }).navigator;
    };

    const restoreXmlHttpRequest = () => {
        if (originalXMLHttpRequest) {
            globalThis.XMLHttpRequest = originalXMLHttpRequest;
            return;
        }
        delete (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest })
            .XMLHttpRequest;
    };

    afterEach(() => {
        restoreNavigator();
        restoreXmlHttpRequest();
    });

    it("streams through XHR in React Native environments", async () => {
        Object.defineProperty(globalThis, "navigator", {
            value: { product: "ReactNative" },
            configurable: true,
        });
        globalThis.XMLHttpRequest =
            MockXmlHttpRequest as unknown as typeof XMLHttpRequest;

        let fetchCalled = false;
        mockFetch(() => {
            fetchCalled = true;
            return new Response("unexpected", { status: 500 });
        });

        MockXmlHttpRequest.responder = (xhr) => {
            xhr.status = 200;
            xhr.statusText = "OK";

            xhr.responseText +=
                'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n';
            xhr.onprogress?.();
            if (xhr.aborted) return;

            xhr.responseText +=
                'data: {"choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}\n\n';
            xhr.onprogress?.();
            if (xhr.aborted) return;

            xhr.responseText += "data: [DONE]\n\n";
            xhr.onprogress?.();
            if (xhr.aborted) return;

            xhr.onload?.();
        };

        const chunks: string[] = [];
        const result = await sendMessage(
            "key",
            [{ role: "user", content: "hello" }],
            {
                id: "session",
                modelId: "provider/model",
                thinking: "none",
                searchLevel: "none",
            },
            undefined,
            (chunk) => {
                if (chunk) chunks.push(chunk);
            },
        );

        expect(chunks.join("")).toBe("Hello");
        expect(result.id).toBe("");
        expect(fetchCalled).toBe(false);
    });

    it("throws typed errors when XHR returns a non-2xx response", async () => {
        Object.defineProperty(globalThis, "navigator", {
            value: { product: "ReactNative" },
            configurable: true,
        });
        globalThis.XMLHttpRequest =
            MockXmlHttpRequest as unknown as typeof XMLHttpRequest;

        MockXmlHttpRequest.responder = (xhr) => {
            xhr.status = 401;
            xhr.statusText = "Unauthorized";
            xhr.responseText = JSON.stringify({
                error: {
                    code: 401,
                    message: "Invalid API key",
                },
            });
            xhr.onload?.();
        };

        let caught: unknown;
        try {
            await sendMessage(
                "bad",
                [{ role: "user", content: "hello" }],
                {
                    id: "session",
                    modelId: "provider/model",
                    thinking: "none",
                    searchLevel: "none",
                },
                undefined,
                () => undefined,
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeInstanceOf(OpenRouterApiErrorImpl);
        if (caught instanceof OpenRouterApiErrorImpl) {
            expect(caught.code).toBe(401);
        }
    });
});

describe("validateApiKey", () => {
    it("returns true when API key is valid", async () => {
        mockFetch(
            () =>
                new Response(null, {
                    status: 200,
                }),
        );

        expect(await validateApiKey("valid-key")).toBe(true);
    });

    it("returns false when API key validation fails", async () => {
        mockFetch(() => {
            throw new Error("network");
        });

        expect(await validateApiKey("bad-key")).toBe(false);
    });
});

describe("getKeyInfo", () => {
    it("normalizes the wire response into KeyInfo", async () => {
        mockFetch(
            () =>
                new Response(
                    JSON.stringify({
                        data: {
                            label: "ci-key",
                            usage: 0.1234,
                            limit: 5,
                            limit_remaining: 4.8766,
                            is_free_tier: false,
                            rate_limit: { requests: 200, interval: "10s" },
                        },
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
        );

        const info = await getKeyInfo("valid-key");
        expect(info).toEqual({
            label: "ci-key",
            usage: 0.1234,
            limit: 5,
            limitRemaining: 4.8766,
            isFreeTier: false,
            rateLimit: { requests: 200, interval: "10s" },
        });
    });

    it("handles missing optional fields and null limits", async () => {
        mockFetch(
            () =>
                new Response(
                    JSON.stringify({
                        data: {
                            usage: 0,
                            limit: null,
                            limit_remaining: null,
                            is_free_tier: true,
                        },
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
        );

        const info = await getKeyInfo("free-key");
        expect(info).toEqual({
            label: "",
            usage: 0,
            limit: null,
            limitRemaining: null,
            isFreeTier: true,
            rateLimit: undefined,
        });
    });

    it("returns null on non-OK response", async () => {
        mockFetch(() => new Response(null, { status: 401 }));
        expect(await getKeyInfo("bad-key")).toBeNull();
    });

    it("returns null on network error", async () => {
        mockFetch(() => {
            throw new Error("network");
        });
        expect(await getKeyInfo("bad-key")).toBeNull();
    });

    it("returns a defaulted KeyInfo when the body is 200 but empty", async () => {
        mockFetch(
            () =>
                new Response("{}", {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        const info = await getKeyInfo("valid-key");
        expect(info).toEqual({
            label: "",
            usage: 0,
            limit: null,
            limitRemaining: null,
            isFreeTier: false,
            rateLimit: undefined,
        });
    });

    it("drops rate_limit when interval is missing", async () => {
        mockFetch(
            () =>
                new Response(
                    JSON.stringify({
                        data: {
                            usage: 0,
                            limit: null,
                            limit_remaining: null,
                            is_free_tier: false,
                            rate_limit: { requests: 200 },
                        },
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
        );

        const info = await getKeyInfo("partial-rate-key");
        expect(info?.rateLimit).toBeUndefined();
    });

    it("returns null when the response body is not JSON", async () => {
        mockFetch(
            () =>
                new Response("oops not json", {
                    status: 200,
                    headers: { "Content-Type": "text/plain" },
                }),
        );

        expect(await getKeyInfo("munged-body-key")).toBeNull();
    });

    it("aborts when the caller signals abort", async () => {
        const controller = new AbortController();
        controller.abort();
        mockFetch(() => {
            throw new DOMException("aborted", "AbortError");
        });

        expect(
            await getKeyInfo("abort-key", { signal: controller.signal }),
        ).toBeNull();
    });
});

describe("getCredits", () => {
    it("normalizes the wire response into CreditsInfo", async () => {
        mockFetch(
            () =>
                new Response(
                    JSON.stringify({
                        data: { total_credits: 25, total_usage: 7.5 },
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
        );

        expect(await getCredits("valid-key")).toEqual({
            totalCredits: 25,
            totalUsage: 7.5,
        });
    });

    it("hits the /credits endpoint", async () => {
        mockFetch(
            () =>
                new Response(
                    JSON.stringify({
                        data: { total_credits: 0, total_usage: 0 },
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
        );

        await getCredits("valid-key");
        expect(String(lastRequest?.input)).toContain("/credits");
    });

    it("defaults missing fields to zero on empty success body", async () => {
        mockFetch(
            () =>
                new Response("{}", {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }),
        );

        expect(await getCredits("valid-key")).toEqual({
            totalCredits: 0,
            totalUsage: 0,
        });
    });

    it("returns null on non-OK response", async () => {
        mockFetch(() => new Response(null, { status: 401 }));
        expect(await getCredits("bad-key")).toBeNull();
    });

    it("returns null on network error", async () => {
        mockFetch(() => {
            throw new Error("network");
        });
        expect(await getCredits("bad-key")).toBeNull();
    });

    it("returns null when the response body is not JSON", async () => {
        mockFetch(
            () =>
                new Response("not json", {
                    status: 200,
                    headers: { "Content-Type": "text/plain" },
                }),
        );
        expect(await getCredits("bad-body-key")).toBeNull();
    });

    it("aborts when the caller signals abort", async () => {
        const controller = new AbortController();
        controller.abort();
        mockFetch(() => {
            throw new DOMException("aborted", "AbortError");
        });

        expect(
            await getCredits("abort-key", { signal: controller.signal }),
        ).toBeNull();
    });
});
