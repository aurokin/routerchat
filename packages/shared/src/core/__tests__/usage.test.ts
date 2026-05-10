import { describe, expect, it } from "vitest";
import { toMessageUsage } from "../openrouter";
import type { UsageDetails } from "../openrouter";

describe("toMessageUsage", () => {
    it("returns null for nullish input", () => {
        expect(toMessageUsage(null)).toBeNull();
        expect(toMessageUsage(undefined)).toBeNull();
    });

    it("collapses an all-zero payload to null", () => {
        const usage: UsageDetails = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        };
        expect(toMessageUsage(usage)).toBeNull();
    });

    it("camelCases token counts", () => {
        const usage: UsageDetails = {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
        };
        expect(toMessageUsage(usage)).toEqual({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
        });
    });

    it("preserves cost when reported", () => {
        const usage: UsageDetails = {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            cost: 0.0042,
        };
        expect(toMessageUsage(usage)).toEqual({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            cost: 0.0042,
        });
    });

    it("flattens cached_tokens when present and non-zero", () => {
        const usage: UsageDetails = {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_tokens_details: { cached_tokens: 60 },
        };
        expect(toMessageUsage(usage)).toEqual({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            cachedTokens: 60,
        });
    });

    it("drops zero cached_tokens", () => {
        const usage: UsageDetails = {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
            prompt_tokens_details: { cached_tokens: 0 },
        };
        const result = toMessageUsage(usage);
        expect(result).not.toBeNull();
        expect(result).not.toHaveProperty("cachedTokens");
    });

    it("derives totalTokens when only prompt and completion are reported", () => {
        const usage: UsageDetails = {
            prompt_tokens: 80,
            completion_tokens: 20,
        } as UsageDetails;
        expect(toMessageUsage(usage)).toEqual({
            promptTokens: 80,
            completionTokens: 20,
            totalTokens: 100,
        });
    });
});
