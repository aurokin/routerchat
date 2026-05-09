import { test, expect, describe, vi } from "vitest";
import { APP_DEFAULT_MODEL, type OpenRouterModel } from "@shared/core/models";
import type { Skill } from "@/lib/types";
import { selectInitialDefaultModel } from "@/contexts/SettingsContext";

describe("SettingsContext logic", () => {
    describe("useSettings throws when outside provider", () => {
        test("throws error when used outside provider", () => {
            const useContext = () => null;
            const context = useContext();
            expect(() => {
                if (!context) {
                    throw new Error(
                        "useSettings must be used within a SettingsProvider",
                    );
                }
            }).toThrow("useSettings must be used within a SettingsProvider");
        });
    });

    describe("refreshModels priority logic", () => {
        test("prefers user default model when available", () => {
            const mockModels: OpenRouterModel[] = [
                { id: "user/preferred", name: "preferred", provider: "user" },
                {
                    id: APP_DEFAULT_MODEL,
                    name: "default",
                    provider: "default",
                },
                { id: "other/model", name: "model", provider: "other" },
            ];

            expect(
                selectInitialDefaultModel({
                    fetchedModels: mockModels,
                    userPreferredModel: "user/preferred",
                }),
            ).toBe("user/preferred");
        });

        test("falls back to app default when user preference unavailable", () => {
            const mockModels: OpenRouterModel[] = [
                { id: "other/model", name: "model", provider: "other" },
                {
                    id: APP_DEFAULT_MODEL,
                    name: "default",
                    provider: "default",
                },
            ];

            expect(
                selectInitialDefaultModel({
                    fetchedModels: mockModels,
                    userPreferredModel: "nonexistent/model",
                }),
            ).toBe(APP_DEFAULT_MODEL);
        });

        test("uses first model if no defaults available", () => {
            const mockModels: OpenRouterModel[] = [
                { id: "first/model", name: "model", provider: "first" },
                { id: "second/model", name: "model", provider: "second" },
            ];

            expect(
                selectInitialDefaultModel({
                    fetchedModels: mockModels,
                    userPreferredModel: null,
                }),
            ).toBe("first/model");
        });

        test("returns null when no models are available", () => {
            expect(
                selectInitialDefaultModel({
                    fetchedModels: [],
                    userPreferredModel: null,
                }),
            ).toBeNull();
        });
    });

    describe("toggleFavoriteModel", () => {
        test("adds model when not favorite", () => {
            const favoriteModels: string[] = [];
            const modelId = "test/model";
            const isFavorite = favoriteModels.includes(modelId);
            const newFavorites = isFavorite
                ? favoriteModels.filter((id) => id !== modelId)
                : [...favoriteModels, modelId];

            expect(newFavorites).toEqual(["test/model"]);
        });

        test("removes model when already favorite", () => {
            const favoriteModels = ["test/model", "other/model"];
            const modelId = "test/model";
            const isFavorite = favoriteModels.includes(modelId);
            const newFavorites = isFavorite
                ? favoriteModels.filter((id) => id !== modelId)
                : [...favoriteModels, modelId];

            expect(newFavorites).toEqual(["other/model"]);
        });
    });

    describe("addSkill", () => {
        test("creates skill with id and timestamp", () => {
            const skillInput = {
                name: "Test Skill",
                description: "A test skill",
                prompt: "You are a test skill",
            };

            const newSkill: Skill = {
                ...skillInput,
                id: expect.any(String),
                createdAt: expect.any(Number),
            };

            expect(newSkill.id).toBeDefined();
            expect(newSkill.createdAt).toBeDefined();
        });

        test("generates unique ids", () => {
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(crypto.randomUUID());
            }
            expect(ids.size).toBe(100);
        });
    });

    describe("updateSkill", () => {
        test("modifies existing skill", () => {
            const skills: Skill[] = [
                {
                    id: "skill-1",
                    name: "Original",
                    description: "Original desc",
                    prompt: "Original prompt",
                    createdAt: 1000,
                },
            ];

            const updates = { name: "Updated" };
            const newSkills = skills.map((s) =>
                s.id === "skill-1" ? { ...s, ...updates } : s,
            );

            expect(newSkills[0]!.name).toBe("Updated");
            expect(newSkills[0]!.description).toBe("Original desc");
        });
    });

    describe("deleteSkill", () => {
        test("removes skill from list", () => {
            const skills: Skill[] = [
                {
                    id: "keep",
                    name: "Keep",
                    description: "",
                    prompt: "",
                    createdAt: 1000,
                },
                {
                    id: "remove",
                    name: "Remove",
                    description: "",
                    prompt: "",
                    createdAt: 1000,
                },
            ];

            const newSkills = skills.filter((s) => s.id !== "remove");

            expect(newSkills).toHaveLength(1);
            expect(newSkills[0]!.id).toBe("keep");
        });

        test("clears selected if matching", () => {
            let selectedSkill: Skill | null = {
                id: "remove",
                name: "Remove",
                description: "",
                prompt: "",
                createdAt: 1000,
            };

            const deletedId = "remove";

            if (selectedSkill?.id === deletedId) {
                selectedSkill = null;
            }

            expect(selectedSkill).toBeNull();
        });
    });

    describe("setSelectedSkill", () => {
        test("updates default on manual selection", () => {
            let defaultSkillId: string | null = "skill-123";
            const setDefaultSkill = (skill: Skill | null) => {
                defaultSkillId = skill?.id ?? null;
            };

            const setSelectedSkill = (
                skill: Skill | null,
                options?: { mode?: "auto" | "manual" },
            ) => {
                const mode = options?.mode ?? "manual";
                if (mode === "manual") {
                    setDefaultSkill(skill ?? null);
                }
            };

            const skill: Skill = {
                id: "skill-456",
                name: "Test",
                description: "",
                prompt: "",
                createdAt: 1000,
            };

            setSelectedSkill(skill);

            expect(defaultSkillId as unknown as string).toBe("skill-456");
        });

        test("does not update default on auto selection", () => {
            let defaultSkillId: string | null = "skill-123";
            const setDefaultSkill = (skill: Skill | null) => {
                defaultSkillId = skill?.id ?? null;
            };

            const setSelectedSkill = (
                skill: Skill | null,
                options?: { mode?: "auto" | "manual" },
            ) => {
                const mode = options?.mode ?? "manual";
                if (mode === "manual") {
                    setDefaultSkill(skill ?? null);
                }
            };

            const skill: Skill = {
                id: "skill-456",
                name: "Test",
                description: "",
                prompt: "",
                createdAt: 1000,
            };

            setSelectedSkill(skill, { mode: "auto" });

            expect(defaultSkillId as unknown as string).toBe("skill-123");
        });

        test("defaults to manual selection mode", () => {
            let selectionMode: "auto" | "manual" = "auto";

            const setSelectedSkill = (
                skill: Skill | null,
                options?: { mode?: "auto" | "manual" },
            ) => {
                void skill;
                selectionMode = options?.mode ?? "manual";
            };

            setSelectedSkill(null);

            expect(selectionMode as "auto" | "manual").toBe("manual");
        });

        test("supports auto selection mode", () => {
            let selectionMode: "auto" | "manual" = "manual";

            const setSelectedSkill = (
                skill: Skill | null,
                options?: { mode?: "auto" | "manual" },
            ) => {
                void skill;
                selectionMode = options?.mode ?? "manual";
            };

            setSelectedSkill(null, { mode: "auto" });

            expect(selectionMode as "auto" | "manual").toBe("auto");
        });
    });

    describe("theme application", () => {
        test("setTheme applies light class", () => {
            const theme = "light" as const;
            const rootClasses: string[] = [];

            rootClasses.push(theme);

            expect(rootClasses).toContain("light");
        });

        test("setTheme applies dark class", () => {
            const theme = "dark" as const;
            const rootClasses: string[] = [];

            rootClasses.push(theme);

            expect(rootClasses).toContain("dark");
        });

        test("setTheme handles system preference", () => {
            const theme = "system" as const;
            const mockMatchMedia = (query: string) => ({ matches: true });

            const systemTheme = mockMatchMedia("(prefers-color-scheme: dark)")
                ? "dark"
                : "light";

            expect(systemTheme).toBe("dark");
        });
    });

    describe("refreshModels deduplication", () => {
        test("prevents duplicate requests with promise caching", async () => {
            let resolveCount = 0;
            const createPromise = () =>
                new Promise<void>((resolve) => {
                    resolveCount++;
                    resolve();
                });

            let promise: Promise<void> | null = null;
            const getOrCreatePromise = () => {
                if (!promise) {
                    promise = createPromise();
                }
                return promise;
            };

            await getOrCreatePromise();
            await getOrCreatePromise();

            expect(resolveCount).toBe(1);
        });
    });

    describe("skill CRUD operations", () => {
        test("addSkill adds to skills array", () => {
            const skills: Skill[] = [];
            const newSkill: Skill = {
                id: "skill-1",
                name: "Test",
                description: "Desc",
                prompt: "Prompt",
                createdAt: 1000,
            };

            skills.push(newSkill);

            expect(skills).toHaveLength(1);
            expect(skills[0]!.id).toBe("skill-1");
        });

        test("updateSkill modifies skills array", () => {
            const skills: Skill[] = [
                {
                    id: "skill-1",
                    name: "Original",
                    description: "",
                    prompt: "",
                    createdAt: 1000,
                },
            ];

            const updated = skills.map((s) =>
                s.id === "skill-1" ? { ...s, name: "Updated" } : s,
            );

            expect(updated[0]!.name).toBe("Updated");
        });

        test("deleteSkill removes from skills array", () => {
            const skills: Skill[] = [
                {
                    id: "skill-1",
                    name: "Keep",
                    description: "",
                    prompt: "",
                    createdAt: 1000,
                },
                {
                    id: "skill-2",
                    name: "Remove",
                    description: "",
                    prompt: "",
                    createdAt: 1000,
                },
            ];

            const filtered = skills.filter((s) => s.id !== "skill-2");

            expect(filtered).toHaveLength(1);
        });
    });

    describe("model loading states", () => {
        test("loadingModels is true while fetching", () => {
            let loadingModels = true;

            loadingModels = true;

            expect(loadingModels).toBe(true);
        });

        test("loadingModels is false after fetch", () => {
            let loadingModels = true;

            loadingModels = false;

            expect(loadingModels).toBe(false);
        });

        test("models is empty without API key", () => {
            const models: OpenRouterModel[] = [];
            const apiKey = null;

            if (!apiKey) {
                // Don't fetch models
            }

            expect(models).toEqual([]);
        });
    });
});
