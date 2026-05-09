import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Skill } from "@/lib/types";
import {
    getLocalStorageAdapter,
    LocalStorageAdapter,
} from "@/lib/sync/local-adapter";
import * as storage from "@/lib/storage";

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

describe("LocalStorageAdapter skill settings", () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    let storageMock: StorageMock;

    beforeEach(() => {
        storageMock = createLocalStorageMock();
        globalThis.window = {
            localStorage: storageMock.localStorage,
        } as Window & typeof globalThis;
        globalThis.localStorage = storageMock.localStorage;
        storage.setSkills([]);
        storage.setDefaultSkillId(null);
        storage.setSelectedSkillId(null);
        storage.setSelectedSkillMode("auto");
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
    });

    it("returns singleton adapter", () => {
        const first = getLocalStorageAdapter();
        const second = getLocalStorageAdapter();
        expect(first).toBe(second);
    });

    it("manages skills in storage", async () => {
        const adapter = new LocalStorageAdapter();
        const skill: Skill = {
            id: "skill-1",
            name: "Skill",
            description: "Desc",
            prompt: "Prompt",
            createdAt: 1,
        };

        await adapter.createSkill(skill);
        expect(storage.getSkills()).toHaveLength(1);

        await adapter.updateSkill({ ...skill, name: "Updated" });
        expect(storage.getSkills()[0]?.name).toBe("Updated");

        await adapter.deleteSkill("skill-1");
        expect(storage.getSkills()).toEqual([]);
    });

    it("reads and writes skill settings", async () => {
        const adapter = new LocalStorageAdapter();
        storage.setDefaultSkillId("skill-default");
        storage.setSelectedSkillId("skill-selected");
        storage.setSelectedSkillMode("manual");

        const settings = await adapter.getSkillSettings();
        expect(settings).toEqual({
            defaultSkillId: "skill-default",
            selectedSkillId: "skill-selected",
            selectedSkillMode: "manual",
        });

        await adapter.upsertSkillSettings({
            defaultSkillId: null,
            selectedSkillId: "skill-new",
            selectedSkillMode: "auto",
        });

        expect(storage.getDefaultSkillId()).toBeNull();
        expect(storage.getSelectedSkillId()).toBe("skill-new");
        expect(storage.getSelectedSkillMode()).toBe("auto");
    });
});
