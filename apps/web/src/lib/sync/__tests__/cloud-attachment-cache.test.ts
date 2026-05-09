import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MetaRecord = {
    id: string;
    bytes: number;
    createdAt: number;
    lastAccessedAt: number;
};

type DataRecord = {
    id: string;
    data: string;
};

const metaStore = new Map<string, MetaRecord>();
const dataStore = new Map<string, DataRecord>();

const resetStores = () => {
    metaStore.clear();
    dataStore.clear();
};

const createCursor = <T>(values: T[], idx = 0): any => {
    if (idx >= values.length) return null;
    return {
        value: values[idx],
        continue: async () => createCursor(values, idx + 1),
    };
};

const createMetaObjectStore = () => ({
    get: async (id: string) => metaStore.get(id),
    put: async (value: MetaRecord) => {
        metaStore.set(value.id, value);
    },
    delete: async (id: string) => {
        metaStore.delete(id);
    },
    clear: async () => {
        metaStore.clear();
    },
    openCursor: async () => createCursor(Array.from(metaStore.values())),
    index: (_name: string) => ({
        openCursor: async () =>
            createCursor(
                Array.from(metaStore.values()).sort(
                    (a, b) => a.lastAccessedAt - b.lastAccessedAt,
                ),
            ),
    }),
    createIndex: () => {},
});

const createDataObjectStore = () => ({
    get: async (id: string) => dataStore.get(id),
    put: async (value: DataRecord) => {
        dataStore.set(value.id, value);
    },
    delete: async (id: string) => {
        dataStore.delete(id);
    },
    clear: async () => {
        dataStore.clear();
    },
});

const metaObjectStore = createMetaObjectStore();
const dataObjectStore = createDataObjectStore();

const fakeDb = {
    createObjectStore: (name: string) => {
        if (name === "meta") return metaObjectStore as any;
        if (name === "data") return dataObjectStore as any;
        throw new Error(`Unknown store: ${name}`);
    },
    transaction: (_names: string[], _mode: string) => ({
        objectStore: (name: string) => {
            if (name === "meta") return metaObjectStore as any;
            if (name === "data") return dataObjectStore as any;
            throw new Error(`Unknown store: ${name}`);
        },
        done: Promise.resolve(),
    }),
};

const openDBMock = vi.fn(
    async (_name: string, _version: number, options: any) => {
        options?.upgrade?.(fakeDb);
        return fakeDb as any;
    },
);

vi.mock("idb", () => ({
    openDB: openDBMock,
}));

const cache = await import("@/lib/sync/cloud-attachment-cache");

describe("cloud-attachment-cache", () => {
    const originalWindow = globalThis.window;
    const originalIndexedDb = (globalThis as any).indexedDB;

    beforeEach(() => {
        resetStores();
        globalThis.window = {} as any;
        globalThis.indexedDB = {} as any;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        (globalThis as any).indexedDB = originalIndexedDb;
    });

    it("stores, reads, and clears persistent cached attachment data", async () => {
        await cache.setPersistentCachedAttachmentData(
            "att-1",
            "data:image/png;base64,QUJD",
        );

        const first = await cache.getPersistentCachedAttachmentData("att-1");
        expect(first).toBe("QUJD");

        await cache.clearPersistentCloudAttachmentCache();

        const second = await cache.getPersistentCachedAttachmentData("att-1");
        expect(second).toBeNull();
    });
});
