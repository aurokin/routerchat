import { describe, expect, it } from "vitest";

import { server, http, HttpResponse } from "@/test-utils/msw";
import { fetchModels, validateApiKey } from "@/lib/openrouter";

describe("openrouter (MSW)", () => {
    it("fetchModels returns mapped models from /models", async () => {
        server.use(
            http.get("https://openrouter.ai/api/v1/models", () =>
                HttpResponse.json({
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
            ),
        );

        const models = await fetchModels();

        expect(models).toHaveLength(1);
        expect(models[0]!.id).toBe("anthropic/claude-3-5-sonnet");
        expect(models[0]!.name).toBe("claude-3-5-sonnet");
        expect(models[0]!.provider).toBe("Anthropic");
    });

    it("fetchModels sends attribution headers", async () => {
        let capturedHeaders: Headers | undefined;
        server.use(
            http.get("https://openrouter.ai/api/v1/models", ({ request }) => {
                capturedHeaders = request.headers;
                return HttpResponse.json({ data: [] });
            }),
        );

        await fetchModels();

        expect(capturedHeaders?.get("HTTP-Referer")).toBeTruthy();
        expect(capturedHeaders?.get("X-Title")).toBeTruthy();
    });

    it("validateApiKey returns true on 2xx", async () => {
        server.use(
            http.get("https://openrouter.ai/api/v1/key", () =>
                HttpResponse.json({ data: { label: "ok" } }),
            ),
        );
        expect(await validateApiKey("sk-or-test")).toBe(true);
    });

    it("validateApiKey returns false on 401", async () => {
        server.use(
            http.get("https://openrouter.ai/api/v1/key", () =>
                HttpResponse.json(
                    { error: { message: "bad" } },
                    { status: 401 },
                ),
            ),
        );
        expect(await validateApiKey("sk-or-bad")).toBe(false);
    });
});
