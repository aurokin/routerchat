import { describe, expect, it } from "vitest";
import { buildChatCompletionRequest } from "../openrouter/request-builder";
import type {
    ChatSession,
    FileContent,
    OpenRouterMessage,
    OpenRouterPlugin,
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
    supportedParameters: [SupportedParameter.Tools, SupportedParameter.Vision],
};

const pdfBlock: FileContent = {
    type: "file",
    file: {
        filename: "report.pdf",
        file_data: "data:application/pdf;base64,JVBERi0xLjQK",
    },
};

const userPdfMessages: OpenRouterMessage[] = [
    {
        role: "user",
        content: [{ type: "text", text: "Summarize this." }, pdfBlock],
    },
];

describe("buildChatCompletionRequest PDF + plugins passthrough", () => {
    it("preserves a `file` content block on user messages verbatim", () => {
        const req = buildChatCompletionRequest({
            messages: userPdfMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
        });
        const content = req.messages[0]?.content;
        expect(Array.isArray(content)).toBe(true);
        if (Array.isArray(content)) {
            expect(content).toHaveLength(2);
            expect(content[1]).toEqual(pdfBlock);
        }
    });

    it("omits plugins when none are requested", () => {
        const req = buildChatCompletionRequest({
            messages: userPdfMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
        });
        expect(req.plugins).toBeUndefined();
    });

    it("omits plugins when an empty array is passed", () => {
        const req = buildChatCompletionRequest({
            messages: userPdfMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            plugins: [],
        });
        expect(req.plugins).toBeUndefined();
    });

    it("emits file-parser plugin with mistral-ocr engine", () => {
        const plugins: OpenRouterPlugin[] = [
            { id: "file-parser", pdf: { engine: "mistral-ocr" } },
        ];
        const req = buildChatCompletionRequest({
            messages: userPdfMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            plugins,
        });
        expect(req.plugins).toEqual(plugins);
    });

    it("emits file-parser with native engine", () => {
        const req = buildChatCompletionRequest({
            messages: userPdfMessages,
            session: baseSession,
            model: baseModel,
            stream: false,
            plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
        });
        expect(req.plugins).toEqual([
            { id: "file-parser", pdf: { engine: "native" } },
        ]);
    });

    it("does not collide with other request-level extras", () => {
        const req = buildChatCompletionRequest({
            messages: userPdfMessages,
            session: { ...baseSession, searchLevel: "low" },
            model: baseModel,
            stream: true,
            providerSort: "price",
            responseFormat: { type: "json_object" },
            plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
        });
        expect(req.plugins).toEqual([
            { id: "file-parser", pdf: { engine: "cloudflare-ai" } },
        ]);
        expect(req.provider).toEqual({ sort: "price" });
        expect(req.response_format).toEqual({ type: "json_object" });
        expect(req.tools).toBeDefined();
        expect(req.stream).toBe(true);
    });
});
