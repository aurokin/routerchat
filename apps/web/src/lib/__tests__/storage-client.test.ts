import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    clearApiKey,
    clearSyncAutoEnableReason,
    clearSyncData,
    getApiKey,
    getCloudDefaultSkillId,
    getCloudSelectedSkillId,
    getCloudSelectedSkillMode,
    getDefaultModel,
    getDefaultSearchLevel,
    getDefaultSkillId,
    getDefaultThinking,
    getFavoriteModels,
    getSelectedSkillId,
    getSelectedSkillMode,
    getSkills,
    getSyncAutoEnableReason,
    getSyncMetadata,
    getSyncState,
    getTheme,
    setApiKey,
    setCloudDefaultSkillId,
    setCloudSelectedSkillId,
    setCloudSelectedSkillMode,
    setDefaultModel,
    setDefaultSearchLevel,
    setDefaultSkillId,
    setDefaultThinking,
    setFavoriteModels,
    setSelectedSkillId,
    setSelectedSkillMode,
    setSkills,
    setSyncAutoEnableReason,
    setSyncMetadata,
    setSyncState,
    setTheme,
    updateSyncMetadata,
} from "@/lib/storage";
import type { Skill } from "@/lib/types";
import { DEFAULT_SYNC_METADATA } from "@/lib/sync/types";

type StorageMock = {
    store: Map<string, string>;
    localStorage: Storage;
};

const createLocalStorageMock = (): StorageMock => {
    const store = new Map<string, string>();
    const localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
        clear: () => {
            store.clear();
        },
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        get length() {
            return store.size;
        },
    } as Storage;

    return { store, localStorage };
};

describe("storage client behavior", () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    let storageMock: StorageMock;

    beforeEach(() => {
        storageMock = createLocalStorageMock();
        globalThis.window = {
            localStorage: storageMock.localStorage,
        } as Window & typeof globalThis;
        globalThis.localStorage = storageMock.localStorage;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
    });

    it("gets/sets/clears API key", () => {
        expect(getApiKey()).toBeNull();
        setApiKey("sk-test");
        expect(getApiKey()).toBe("sk-test");
        clearApiKey();
        expect(getApiKey()).toBeNull();
    });

    it("gets/sets theme", () => {
        expect(getTheme()).toBe("system");
        setTheme("dark");
        expect(getTheme()).toBe("dark");
    });

    it("gets/sets default model", () => {
        expect(getDefaultModel()).toBe("");
        setDefaultModel("openai/gpt-4o");
        expect(getDefaultModel()).toBe("openai/gpt-4o");
    });

    it("handles favorite models JSON safely", () => {
        storageMock.store.set("routerchat-favorite-models", "invalid json");
        expect(getFavoriteModels()).toEqual([]);
        setFavoriteModels(["m1", "m2"]);
        expect(getFavoriteModels()).toEqual(["m1", "m2"]);
    });

    it("gets/sets default thinking", () => {
        expect(getDefaultThinking()).toBe("none");
        setDefaultThinking("high");
        expect(getDefaultThinking()).toBe("high");
    });

    it("migrates default search level from legacy boolean", () => {
        storageMock.store.set("routerchat-default-search", "true");
        expect(getDefaultSearchLevel()).toBe("medium");
        storageMock.store.set("routerchat-default-search", "false");
        expect(getDefaultSearchLevel()).toBe("none");
        storageMock.store.set("routerchat-default-search", "high");
        expect(getDefaultSearchLevel()).toBe("high");
        storageMock.store.set("routerchat-default-search", "unknown");
        expect(getDefaultSearchLevel()).toBe("none");
        setDefaultSearchLevel("low");
        expect(getDefaultSearchLevel()).toBe("low");
    });

    it("gets/sets skills", () => {
        const skills: Skill[] = [
            {
                id: "skill-1",
                name: "Summarize",
                description: "Summary",
                prompt: "Summarize",
                createdAt: 1000,
            },
        ];
        setSkills(skills);
        expect(getSkills()).toEqual(skills);
    });

    it("migrates legacy selected skill to default skill", () => {
        storageMock.store.set("routerchat-selected-skill", "legacy-skill");
        expect(getDefaultSkillId()).toBe("legacy-skill");
        expect(storageMock.store.get("routerchat-default-skill")).toBe(
            "legacy-skill",
        );
        expect(storageMock.store.has("routerchat-selected-skill")).toBe(false);
    });

    it("gets/sets selected skills and modes", () => {
        expect(getSelectedSkillId()).toBeNull();
        setSelectedSkillId("skill-2");
        expect(getSelectedSkillId()).toBe("skill-2");
        setSelectedSkillId(null);
        expect(getSelectedSkillId()).toBeNull();

        expect(getSelectedSkillMode()).toBe("auto");
        setSelectedSkillMode("manual");
        expect(getSelectedSkillMode()).toBe("manual");
        storageMock.store.set("routerchat-selected-skill-mode", "invalid");
        expect(getSelectedSkillMode()).toBe("auto");
    });

    it("gets/sets cloud skill settings", () => {
        setCloudDefaultSkillId("cloud-default");
        setCloudSelectedSkillId("cloud-selected");
        setCloudSelectedSkillMode("manual");
        expect(getCloudDefaultSkillId()).toBe("cloud-default");
        expect(getCloudSelectedSkillId()).toBe("cloud-selected");
        expect(getCloudSelectedSkillMode()).toBe("manual");
    });

    it("manages sync state", () => {
        expect(getSyncState()).toBe("local-only");
        setSyncState("cloud-enabled");
        expect(getSyncState()).toBe("cloud-enabled");
        storageMock.store.set("routerchat-sync-state", "invalid");
        expect(getSyncState()).toBe("local-only");
    });

    it("manages sync auto-enable reason", () => {
        expect(getSyncAutoEnableReason()).toBeNull();
        setSyncAutoEnableReason("login");
        expect(getSyncAutoEnableReason()).toBe("login");
        storageMock.store.set("routerchat-sync-auto-enable", "invalid");
        expect(getSyncAutoEnableReason()).toBeNull();
        setSyncAutoEnableReason("login");
        clearSyncAutoEnableReason();
        expect(storageMock.store.has("routerchat-sync-auto-enable")).toBe(
            false,
        );
    });

    it("gets/sets/updates sync metadata", () => {
        expect(getSyncMetadata()).toEqual(DEFAULT_SYNC_METADATA);
        setSyncMetadata({
            ...DEFAULT_SYNC_METADATA,
            syncState: "cloud-enabled",
        });
        expect(getSyncMetadata().syncState).toBe("cloud-enabled");

        storageMock.store.set("routerchat-sync-metadata", "invalid-json");
        expect(getSyncMetadata()).toEqual(DEFAULT_SYNC_METADATA);

        storageMock.store.set(
            "routerchat-sync-metadata",
            JSON.stringify({ syncState: "cloud-disabled" }),
        );
        const merged = getSyncMetadata();
        expect(merged.syncState).toBe("cloud-disabled");
        expect(merged.lastSyncAt).toBeNull();

        const updated = updateSyncMetadata({ lastSyncAt: 123 });
        expect(updated.lastSyncAt).toBe(123);
        const stored = storageMock.store.get("routerchat-sync-metadata");
        expect(stored).toContain('"lastSyncAt":123');
    });

    it("clears sync data", () => {
        setSyncState("cloud-disabled");
        setSyncAutoEnableReason("login");
        setSyncMetadata({
            ...DEFAULT_SYNC_METADATA,
            syncState: "cloud-disabled",
        });
        clearSyncData();
        expect(storageMock.store.has("routerchat-sync-state")).toBe(false);
        expect(storageMock.store.has("routerchat-sync-metadata")).toBe(false);
        expect(storageMock.store.has("routerchat-sync-auto-enable")).toBe(
            false,
        );
    });
});
