"use client";

import { useEffect, type RefObject, startTransition } from "react";
import { useRouter } from "next/navigation";
import {
    modelSupportsReasoning,
    modelSupportsSearch,
    type ChatSession,
    type ThinkingLevel,
    type SearchLevel,
} from "@/lib/types";
import type { OpenRouterModel } from "@shared/core/models";
import type { Skill } from "@shared/core/skills";

const isKeybindingBlocked = () => {
    if (typeof document === "undefined") return false;
    return Boolean(
        document.querySelector(
            "[data-keybinding-scope='modal'][data-keybinding-open='true'], [data-keybinding-scope='dropdown'][data-keybinding-open='true']",
        ),
    );
};

const isTypingTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

const getDigitFromEvent = (event: KeyboardEvent): number | null => {
    const code = event.code.toLowerCase();
    if (code.startsWith("digit")) {
        return Number.parseInt(code.replace("digit", ""), 10);
    }
    if (code.startsWith("numpad")) {
        return Number.parseInt(code.replace("numpad", ""), 10);
    }

    const parsed = Number.parseInt(event.key, 10);
    if (!Number.isNaN(parsed)) {
        return parsed;
    }

    const hasAlt =
        event.altKey ||
        event.getModifierState("Alt") ||
        event.getModifierState("AltGraph");
    if (!hasAlt) {
        return null;
    }

    const optionDigitMap: Record<string, number> = {
        "¡": 1,
        "™": 2,
        "£": 3,
        "¢": 4,
        "∞": 5,
        "§": 6,
        "¶": 7,
        "•": 8,
        ª: 9,
        º: 0,
    };

    return optionDigitMap[event.key] ?? null;
};

interface UseChatKeybindingsParams {
    inputRef: RefObject<HTMLTextAreaElement | null>;
    currentChat: ChatSession | null;
    models: OpenRouterModel[];
    favoriteModels: string[];
    skills: Skill[];
    selectedSkill: Skill | null;
    updateChat: (chat: ChatSession) => void | Promise<void>;
    setDefaultModel: (modelId: string) => void;
    setDefaultThinking: (value: ThinkingLevel) => void;
    setDefaultSearchLevel: (value: SearchLevel) => void;
    updateSelectedSkill: (
        skill: Skill | null,
        options?: { mode?: "auto" | "manual" },
    ) => void;
}

export function useChatKeybindings({
    inputRef,
    currentChat,
    models,
    favoriteModels,
    skills,
    selectedSkill,
    updateChat,
    setDefaultModel,
    setDefaultThinking,
    setDefaultSearchLevel,
    updateSelectedSkill,
}: UseChatKeybindingsParams): void {
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isKeybindingBlocked()) return;

            const key = event.key.toLowerCase();
            const code = event.code.toLowerCase();
            const hasModifier =
                event.ctrlKey ||
                event.metaKey ||
                event.getModifierState("Control") ||
                event.getModifierState("Meta");
            const hasAlt =
                event.altKey ||
                event.getModifierState("Alt") ||
                event.getModifierState("AltGraph");

            if (!hasModifier && !event.shiftKey && !hasAlt && key === "/") {
                if (isTypingTarget(event.target)) return;
                event.preventDefault();
                inputRef.current?.focus();
                return;
            }

            if (hasModifier && !event.shiftKey && !hasAlt && key === ",") {
                event.preventDefault();
                startTransition(() => {
                    router.push("/settings");
                });
                return;
            }

            if (!currentChat) return;

            if (hasModifier && hasAlt && !event.shiftKey && code === "keym") {
                const availableFavorites = favoriteModels.filter((modelId) =>
                    models.some((model) => model.id === modelId),
                );
                if (availableFavorites.length === 0) return;
                const currentIndex = availableFavorites.indexOf(
                    currentChat.modelId,
                );
                const nextIndex =
                    currentIndex === -1
                        ? 0
                        : (currentIndex + 1) % availableFavorites.length;
                const nextModelId = availableFavorites[nextIndex];
                if (nextModelId && nextModelId !== currentChat.modelId) {
                    event.preventDefault();
                    const nextModel = models.find(
                        (model) => model.id === nextModelId,
                    );
                    const supportsReasoning = nextModel
                        ? modelSupportsReasoning(nextModel)
                        : true;
                    const supportsSearch = nextModel
                        ? modelSupportsSearch(nextModel)
                        : true;
                    const nextThinking = supportsReasoning
                        ? currentChat.thinking
                        : "none";
                    const nextSearchLevel = supportsSearch
                        ? currentChat.searchLevel
                        : "none";
                    void updateChat({
                        ...currentChat,
                        modelId: nextModelId,
                        thinking: nextThinking,
                        searchLevel: nextSearchLevel,
                    });
                    setDefaultModel(nextModelId);
                }
                return;
            }

            if (hasModifier && hasAlt && !event.shiftKey && code === "keys") {
                event.preventDefault();
                const skillSequence = [null, ...skills];
                const currentIndex = selectedSkill
                    ? skillSequence.findIndex(
                          (skill) => skill?.id === selectedSkill.id,
                      )
                    : 0;
                const nextIndex =
                    (currentIndex + 1) % Math.max(skillSequence.length, 1);
                const nextSkill = skillSequence[nextIndex] ?? null;
                updateSelectedSkill(nextSkill, { mode: "manual" });
                return;
            }

            if (hasModifier && hasAlt && !event.shiftKey && code === "keyn") {
                event.preventDefault();
                updateSelectedSkill(null, { mode: "manual" });
                return;
            }

            if (
                hasModifier &&
                hasAlt &&
                !event.shiftKey &&
                event.key === "Backspace"
            ) {
                const currentModel = models.find(
                    (model) => model.id === currentChat.modelId,
                );
                if (!modelSupportsReasoning(currentModel)) return;
                event.preventDefault();
                void updateChat({ ...currentChat, thinking: "none" });
                setDefaultThinking("none");
                return;
            }

            if (hasModifier && hasAlt && !event.shiftKey) {
                const level = getDigitFromEvent(event);
                if (level !== null && level >= 1 && level <= 5) {
                    const currentModel = models.find(
                        (model) => model.id === currentChat.modelId,
                    );
                    if (!modelSupportsReasoning(currentModel)) return;
                    const levels: ThinkingLevel[] = [
                        "minimal",
                        "low",
                        "medium",
                        "high",
                        "xhigh",
                    ];
                    const nextLevel = levels[level - 1];
                    if (nextLevel) {
                        event.preventDefault();
                        void updateChat({
                            ...currentChat,
                            thinking: nextLevel,
                        });
                        setDefaultThinking(nextLevel);
                    }
                    return;
                }
            }

            if (
                hasModifier &&
                event.shiftKey &&
                !hasAlt &&
                event.key === "Backspace"
            ) {
                const currentModel = models.find(
                    (model) => model.id === currentChat.modelId,
                );
                if (!modelSupportsSearch(currentModel)) return;
                event.preventDefault();
                void updateChat({ ...currentChat, searchLevel: "none" });
                setDefaultSearchLevel("none");
                return;
            }

            if (hasModifier && event.shiftKey && !hasAlt) {
                const level = getDigitFromEvent(event);
                if (level !== null && level >= 1 && level <= 3) {
                    const currentModel = models.find(
                        (model) => model.id === currentChat.modelId,
                    );
                    if (!modelSupportsSearch(currentModel)) return;
                    const levels: SearchLevel[] = ["low", "medium", "high"];
                    const nextLevel = levels[level - 1];
                    if (nextLevel) {
                        event.preventDefault();
                        void updateChat({
                            ...currentChat,
                            searchLevel: nextLevel,
                        });
                        setDefaultSearchLevel(nextLevel);
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [
        currentChat,
        favoriteModels,
        inputRef,
        models,
        router,
        selectedSkill,
        setDefaultModel,
        setDefaultThinking,
        setDefaultSearchLevel,
        updateSelectedSkill,
        skills,
        updateChat,
    ]);
}
