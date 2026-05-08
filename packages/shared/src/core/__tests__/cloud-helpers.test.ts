import { describe, expect, it } from "bun:test";
import type {
    ChatSession,
    Message,
    SearchLevel,
    ThinkingLevel,
} from "../types";
import {
    isThinkingLevel,
    isSearchLevel,
    toThinkingLevel,
    toSearchLevel,
    mergeByIdWithPending,
    mapConvexChatToLocal,
    mapConvexMessageToLocal,
} from "../sync/cloud-helpers";

describe("cloud-helpers", () => {
    it("recognizes valid thinking/search levels", () => {
        const thinkingLevels: ThinkingLevel[] = [
            "xhigh",
            "high",
            "medium",
            "low",
            "minimal",
            "none",
        ];
        for (const level of thinkingLevels) {
            expect(isThinkingLevel(level)).toBe(true);
        }

        const searchLevels: SearchLevel[] = ["none", "low", "medium", "high"];
        for (const level of searchLevels) {
            expect(isSearchLevel(level)).toBe(true);
        }

        expect(isThinkingLevel("")).toBe(false);
        expect(isThinkingLevel("HIGH")).toBe(false);
        expect(isThinkingLevel(undefined)).toBe(false);
        expect(isThinkingLevel(null)).toBe(false);

        expect(isSearchLevel("")).toBe(false);
        expect(isSearchLevel("LOW")).toBe(false);
        expect(isSearchLevel(undefined)).toBe(false);
        expect(isSearchLevel(null)).toBe(false);
    });

    it("coerces invalid levels to none", () => {
        expect(toThinkingLevel("high")).toBe("high");
        expect(toThinkingLevel("invalid")).toBe("none");
        expect(toThinkingLevel(undefined)).toBe("none");
        expect(toThinkingLevel(null)).toBe("none");

        expect(toSearchLevel("medium")).toBe("medium");
        expect(toSearchLevel("invalid")).toBe("none");
        expect(toSearchLevel(undefined)).toBe("none");
        expect(toSearchLevel(null)).toBe("none");
    });

    it("merges cloud items with pending local items", () => {
        const cloud = [
            { id: "a", value: 3 },
            { id: "b", value: 1 },
        ];
        const prev = [
            { id: "b", value: 9 },
            { id: "c", value: 4 },
            { id: "d", value: 2 },
            { id: "e", value: 5 },
        ];
        const pending = new Set(["c", "d"]);

        const merged = mergeByIdWithPending(
            cloud,
            prev,
            pending,
            (a, b) => a.value - b.value,
        );

        expect(merged.map((item) => item.id)).toEqual(["b", "d", "a", "c"]);
        expect(merged.find((item) => item.id === "b")?.value).toBe(1);
        expect(merged.some((item) => item.id === "e")).toBe(false);
    });

    it("prefers cloud values over pending duplicates", () => {
        const cloud = [{ id: "a", value: 1 }];
        const prev = [{ id: "a", value: 2 }];
        const pending = new Set(["a"]);

        const merged = mergeByIdWithPending(cloud, prev, pending);

        expect(merged).toEqual([{ id: "a", value: 1 }]);
    });

    it("maps convex chat with enum coercion", () => {
        const chat = mapConvexChatToLocal({
            _id: "convex-chat",
            localId: "local-chat",
            title: "Test",
            modelId: "model-1",
            thinking: "weird",
            searchLevel: null,
            createdAt: 1,
            updatedAt: 2,
        });

        const expected: ChatSession = {
            id: "local-chat",
            title: "Test",
            modelId: "model-1",
            thinking: "none",
            searchLevel: "none",
            createdAt: 1,
            updatedAt: 2,
        };

        expect(chat).toEqual(expected);
    });

    it("maps convex message with enum coercion", () => {
        const message = mapConvexMessageToLocal(
            {
                _id: "convex-msg",
                role: "user",
                content: "hello",
                contextContent: "hello",
                thinkingLevel: "invalid",
                searchLevel: "invalid",
                attachmentIds: null,
                createdAt: 5,
            },
            "local-chat",
        );

        const expected: Message = {
            id: "convex-msg",
            sessionId: "local-chat",
            role: "user",
            content: "hello",
            contextContent: "hello",
            thinking: undefined,
            skill: null,
            modelId: undefined,
            thinkingLevel: "none",
            searchLevel: "none",
            attachmentIds: undefined,
            createdAt: 5,
        };

        expect(message).toEqual(expected);
    });

    it("maps convex message using cloud id and preserves fields", () => {
        const skill = {
            id: "skill-1",
            name: "Skill",
            description: "Desc",
            prompt: "Prompt",
            createdAt: 1,
        };
        const message = mapConvexMessageToLocal(
            {
                _id: "convex-msg",
                localId: null,
                role: "assistant",
                content: "hi",
                contextContent: "hi",
                thinking: "thought",
                skill,
                modelId: "model-1",
                thinkingLevel: "high",
                searchLevel: "low",
                attachmentIds: ["att-1"],
                createdAt: 7,
            },
            "local-chat",
        );

        expect(message.id).toBe("convex-msg");
        expect(message.skill).toEqual(skill);
        expect(message.modelId).toBe("model-1");
        expect(message.thinkingLevel).toBe("high");
        expect(message.searchLevel).toBe("low");
        expect(message.attachmentIds).toEqual(["att-1"]);
    });
});
