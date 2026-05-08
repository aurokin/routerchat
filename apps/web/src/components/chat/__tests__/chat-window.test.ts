import { describe, expect, test } from "bun:test";
import type { ChatSession, Message, Skill } from "@/lib/types";
import {
    applyStreamingMessageOverlay,
    getChatTitleUpdate,
} from "@/components/chat/ChatWindow";
import { getSkillSelectionUpdate } from "@shared/core/skills";

describe("getChatTitleUpdate", () => {
    const baseChat: ChatSession = {
        id: "chat-1",
        title: "New Chat",
        modelId: "openai/gpt-4o",
        thinking: "medium",
        searchLevel: "medium",
        createdAt: 1000,
        updatedAt: 2000,
    };

    test("returns updated chat with preserved settings", () => {
        const content = "a".repeat(55);
        const updated = getChatTitleUpdate(baseChat, content, 0);

        expect(updated).not.toBeNull();
        expect(updated?.title).toBe(`${"a".repeat(50)}...`);
        expect(updated?.modelId).toBe(baseChat.modelId);
        expect(updated?.thinking).toBe(baseChat.thinking);
        expect(updated?.searchLevel).toBe(baseChat.searchLevel);
    });

    test("returns null when chat is not new", () => {
        const updated = getChatTitleUpdate(
            { ...baseChat, title: "Existing" },
            "Hello",
            0,
        );

        expect(updated).toBeNull();
    });

    test("returns null when message already exists", () => {
        const updated = getChatTitleUpdate(baseChat, "Hello", 2);

        expect(updated).toBeNull();
    });

    test("returns null when chat is missing", () => {
        const updated = getChatTitleUpdate(null, "Hello", 0);

        expect(updated).toBeNull();
    });
});

describe("getSkillSelectionUpdate", () => {
    const skillA: Skill = {
        id: "skill-a",
        name: "Skill A",
        description: "",
        prompt: "",
        createdAt: 1000,
    };
    const skillB: Skill = {
        id: "skill-b",
        name: "Skill B",
        description: "",
        prompt: "",
        createdAt: 2000,
    };

    test("applies default skill on new chat", () => {
        const result = getSkillSelectionUpdate({
            messageCount: 0,
            defaultSkill: skillA,
            selectedSkill: skillB,
            selectedSkillMode: "auto",
        });

        expect(result?.id).toBe("skill-a");
    });

    test("clears selection when no default", () => {
        const result = getSkillSelectionUpdate({
            messageCount: 0,
            defaultSkill: null,
            selectedSkill: skillA,
            selectedSkillMode: "auto",
        });

        expect(result).toBeNull();
    });

    test("skips default selection after manual choice", () => {
        const result = getSkillSelectionUpdate({
            messageCount: 0,
            defaultSkill: skillA,
            selectedSkill: null,
            selectedSkillMode: "manual",
        });

        expect(result).toBeUndefined();
    });

    test("clears auto selection for existing chat", () => {
        const result = getSkillSelectionUpdate({
            messageCount: 2,
            defaultSkill: skillA,
            selectedSkill: skillB,
            selectedSkillMode: "auto",
        });

        expect(result).toBeNull();
    });

    test("keeps manual selection for existing chat", () => {
        const result = getSkillSelectionUpdate({
            messageCount: 2,
            defaultSkill: skillA,
            selectedSkill: skillB,
            selectedSkillMode: "manual",
        });

        expect(result).toBeUndefined();
    });
});

describe("applyStreamingMessageOverlay", () => {
    const baseMessages: Message[] = [
        {
            id: "user-1",
            sessionId: "chat-1",
            role: "user",
            content: "User prompt",
            contextContent: "User prompt",
            createdAt: 1000,
        },
        {
            id: "assistant-1",
            sessionId: "chat-1",
            role: "assistant",
            content: "",
            contextContent: "",
            createdAt: 2000,
        },
    ];

    test("returns original reference when no streaming message", () => {
        const result = applyStreamingMessageOverlay(baseMessages, null);
        expect(result).toBe(baseMessages);
    });

    test("overlays content and thinking for matching message id", () => {
        const result = applyStreamingMessageOverlay(baseMessages, {
            id: "assistant-1",
            content: "Hello from stream",
            thinking: "Draft reasoning",
        });

        expect(result).not.toBe(baseMessages);
        expect(result[1]?.content).toBe("Hello from stream");
        expect(result[1]?.contextContent).toBe("Hello from stream");
        expect(result[1]?.thinking).toBe("Draft reasoning");
        expect(result[0]).toBe(baseMessages[0]);
    });

    test("keeps messages unchanged when overlay id is missing", () => {
        const result = applyStreamingMessageOverlay(baseMessages, {
            id: "assistant-missing",
            content: "Ignored",
            thinking: "Ignored",
        });

        expect(result).toHaveLength(baseMessages.length);
        expect(result[0]).toBe(baseMessages[0]);
        expect(result[1]).toBe(baseMessages[1]);
    });
});
