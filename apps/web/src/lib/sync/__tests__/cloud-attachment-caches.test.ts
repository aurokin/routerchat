import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@convex/_generated/api";

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

const convex = await import("@/lib/sync/convex-adapter");
const { ConvexStorageAdapter } = convex;

describe("cloud attachment caches (memory + IndexedDB)", () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;
    const originalIndexedDb = (globalThis as any).indexedDB;
    const originalAtob = globalThis.atob;
    const originalFileReader = globalThis.FileReader;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        resetStores();

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

        globalThis.window = { localStorage } as any;
        globalThis.localStorage = localStorage;
        (globalThis as any).indexedDB = {} as any;

        globalThis.atob = (value: string) =>
            Buffer.from(value, "base64").toString("binary");

        class MockFileReader {
            result: string | null = null;
            onloadend: ((event: Event) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;

            readAsDataURL(blob: Blob) {
                blob.arrayBuffer()
                    .then((buffer) => {
                        const base64 = Buffer.from(buffer).toString("base64");
                        this.result = `data:${blob.type};base64,${base64}`;
                        this.onloadend?.(new Event("loadend"));
                    })
                    .catch(() => {
                        this.onerror?.(new Event("error"));
                    });
            }
        }

        globalThis.FileReader = MockFileReader as unknown as typeof FileReader;

        // Ensure we don't inherit in-memory attachment cache entries from other tests.
        convex.clearCloudAttachmentMemoryCache();
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
        (globalThis as any).indexedDB = originalIndexedDb;
        globalThis.atob = originalAtob;
        globalThis.FileReader = originalFileReader;
        globalThis.fetch = originalFetch;
    });

    it("falls back to persistent cache when memory cache is cleared, and re-downloads after full cache clear", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url !== "https://download.test") {
                return {
                    ok: false,
                    status: 404,
                    text: async () => "not found",
                } as Response;
            }

            const bytes = new TextEncoder().encode("downloaded");
            return {
                ok: true,
                status: 200,
                blob: async () => new Blob([bytes], { type: "image/png" }),
            } as Response;
        });

        globalThis.fetch = fetchMock as any;

        const attachmentDoc = {
            _id: "cx-att-1",
            localId: "att-1",
            messageId: "cx-msg-1",
            type: "image" as const,
            mimeType: "image/png" as const,
            storageId: "storage-1",
            width: 10,
            height: 10,
            size: 100,
            createdAt: 4,
        };

        const query = vi.fn(async (_fn: any, args: any) => {
            if (args?.storageId) {
                return "https://download.test";
            }
            // getByLocalId({ localId }) and get({ id }) both return the attachment doc.
            return attachmentDoc;
        });

        const client = {
            query,
            mutation: vi.fn(async () => undefined),
        } as any;

        const adapter = new ConvexStorageAdapter(client, "user-1" as any);

        // First: downloads (fetch once) and seeds both memory + persistent caches.
        const first = await adapter.getAttachment("att-1");
        expect(first?.data).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Clear memory cache only. Next read should hit IndexedDB-backed cache and avoid a re-download.
        convex.clearCloudAttachmentMemoryCache();
        const second = await adapter.getAttachment("att-1");
        expect(second?.data).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Clear both memory + persistent cache. Next read should re-download.
        await convex.clearCloudAttachmentCaches();
        const third = await adapter.getAttachment("att-1");
        expect(third?.data).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
