import { openDB, type DBSchema, type IDBPDatabase } from "idb";

type AttachmentCacheMeta = {
    id: string;
    bytes: number;
    createdAt: number;
    lastAccessedAt: number;
};

type AttachmentCacheData = {
    id: string;
    // Base64 payload without any data URL prefix.
    data: string;
};

interface CloudAttachmentCacheDB extends DBSchema {
    meta: {
        key: string;
        value: AttachmentCacheMeta;
        indexes: { "by-lastAccessedAt": number };
    };
    data: {
        key: string;
        value: AttachmentCacheData;
    };
}

const DB_NAME = "routerchat-cloud-attachment-cache";
const DB_VERSION = 1;

// Persistent cache is bounded to avoid unbounded IndexedDB growth.
const MAX_PERSISTENT_ATTACHMENT_CACHE_BYTES = 150 * 1024 * 1024; // ~150MB
const MAX_PERSISTENT_ATTACHMENT_CACHE_ITEMS = 300;

let dbPromise: Promise<IDBPDatabase<CloudAttachmentCacheDB>> | null = null;
let evictionPromise: Promise<void> | null = null;

function estimateBase64Bytes(base64: string): number {
    // Roughly: bytes = base64_length * 3/4 (ignoring padding)
    return Math.ceil((base64.length * 3) / 4);
}

function normalizeBase64Data(input: string): string {
    if (input.startsWith("data:")) {
        return input.split(",")[1] ?? "";
    }
    return input;
}

function canUseIndexedDb(): boolean {
    return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

async function getDb(): Promise<IDBPDatabase<CloudAttachmentCacheDB> | null> {
    if (!canUseIndexedDb()) return null;

    if (!dbPromise) {
        dbPromise = openDB<CloudAttachmentCacheDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                const meta = db.createObjectStore("meta", {
                    keyPath: "id",
                });
                meta.createIndex("by-lastAccessedAt", "lastAccessedAt");
                db.createObjectStore("data", { keyPath: "id" });
            },
        });
    }

    try {
        return await dbPromise;
    } catch {
        // Some browsers/users may block IndexedDB entirely.
        dbPromise = null;
        return null;
    }
}

async function evictIfNeeded(db: IDBPDatabase<CloudAttachmentCacheDB>) {
    const tx = db.transaction(["meta", "data"], "readwrite");
    const metaStore = tx.objectStore("meta");
    const dataStore = tx.objectStore("data");

    let totalBytes = 0;
    let totalItems = 0;

    // Compute totals without loading any base64 payloads.
    let cursor = await metaStore.openCursor();
    while (cursor) {
        totalItems++;
        totalBytes += cursor.value.bytes;
        cursor = await cursor.continue();
    }

    if (
        totalBytes <= MAX_PERSISTENT_ATTACHMENT_CACHE_BYTES &&
        totalItems <= MAX_PERSISTENT_ATTACHMENT_CACHE_ITEMS
    ) {
        await tx.done;
        return;
    }

    // Evict least-recently accessed entries until within bounds.
    const index = metaStore.index("by-lastAccessedAt");
    let oldest = await index.openCursor();
    while (
        oldest &&
        (totalBytes > MAX_PERSISTENT_ATTACHMENT_CACHE_BYTES ||
            totalItems > MAX_PERSISTENT_ATTACHMENT_CACHE_ITEMS)
    ) {
        const { id, bytes } = oldest.value;
        await metaStore.delete(id);
        await dataStore.delete(id);
        totalBytes -= bytes;
        totalItems--;
        oldest = await oldest.continue();
    }

    await tx.done;
}

function queueEviction(db: IDBPDatabase<CloudAttachmentCacheDB>) {
    // Ensure evictions run sequentially. Avoid older `.finally()` handlers
    // clobbering newer queued evictions by checking identity before clearing.
    const previous = evictionPromise ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => evictIfNeeded(db));
    evictionPromise = next;

    void next.finally(() => {
        if (evictionPromise === next) {
            evictionPromise = null;
        }
    });
}

export async function getPersistentCachedAttachmentData(
    attachmentId: string,
): Promise<string | null> {
    const db = await getDb();
    if (!db) return null;

    try {
        const tx = db.transaction(["meta", "data"], "readwrite");
        const metaStore = tx.objectStore("meta");
        const dataStore = tx.objectStore("data");

        const meta = await metaStore.get(attachmentId);
        if (!meta) {
            await tx.done;
            return null;
        }

        const dataRecord = await dataStore.get(attachmentId);
        if (!dataRecord?.data) {
            // Clean up dangling metadata if present.
            await metaStore.delete(attachmentId);
            await tx.done;
            return null;
        }

        await metaStore.put({
            ...meta,
            lastAccessedAt: Date.now(),
        });

        await tx.done;
        return dataRecord.data;
    } catch {
        return null;
    }
}

export async function setPersistentCachedAttachmentData(
    attachmentId: string,
    data: string,
): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
        const normalized = normalizeBase64Data(data);
        if (!normalized) return;

        const now = Date.now();
        const bytes = estimateBase64Bytes(normalized);

        const tx = db.transaction(["meta", "data"], "readwrite");
        await tx
            .objectStore("data")
            .put({ id: attachmentId, data: normalized });
        await tx.objectStore("meta").put({
            id: attachmentId,
            bytes,
            createdAt: now,
            lastAccessedAt: now,
        });
        await tx.done;

        queueEviction(db);
    } catch {
        // Best-effort cache only.
    }
}

export async function deletePersistentCachedAttachmentData(
    attachmentId: string,
): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
        const tx = db.transaction(["meta", "data"], "readwrite");
        await tx.objectStore("meta").delete(attachmentId);
        await tx.objectStore("data").delete(attachmentId);
        await tx.done;
    } catch {
        // Best-effort cache only.
    }
}

export async function clearPersistentCloudAttachmentCache(): Promise<void> {
    // Wait for any queued evictions to settle so we don't interleave readwrite
    // transactions unnecessarily.
    await evictionPromise?.catch(() => {});

    const db = await getDb();
    if (!db) return;

    try {
        const tx = db.transaction(["meta", "data"], "readwrite");
        await tx.objectStore("meta").clear();
        await tx.objectStore("data").clear();
        await tx.done;
    } catch {
        // Best-effort cache only.
    }
}
