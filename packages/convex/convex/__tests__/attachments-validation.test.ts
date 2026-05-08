import { describe, expect, test } from "bun:test";
import { create as createAttachment } from "../attachments";
import { LIMITS } from "../lib/limits";

const AUTH_USER_ID = "users:auth";
const MESSAGE_ID = "messages:one";
const STORAGE_ID = "_storage:one";

type HandlerExport = {
    _handler: (ctx: any, args: any) => Promise<unknown>;
};

function runHandler(handler: HandlerExport, ctx: any, args: any) {
    return handler._handler(ctx, args);
}

function buildContext(params: {
    metadata: {
        storageId: string;
        sha256: string;
        size: number;
        contentType: string | null;
    } | null;
}) {
    const deletedStorageIds: string[] = [];

    const ctx = {
        auth: {
            getUserIdentity: async () => ({
                subject: `${AUTH_USER_ID}|session:auth`,
            }),
        },
        db: {
            get: async (id: string) => {
                if (id === AUTH_USER_ID) {
                    return {
                        _id: AUTH_USER_ID,
                    };
                }
                return null;
            },
            query: () => {
                throw new Error("Unexpected query call in metadata test");
            },
            patch: async () => {
                throw new Error("Unexpected patch call in metadata test");
            },
            insert: async () => {
                throw new Error("Unexpected insert call in metadata test");
            },
            delete: async () => {
                throw new Error("Unexpected delete call in metadata test");
            },
        },
        storage: {
            getMetadata: async () => params.metadata,
            delete: async (storageId: string) => {
                deletedStorageIds.push(storageId);
            },
        },
    };

    return {
        ctx,
        deletedStorageIds,
    };
}

function baseArgs(overrides: Record<string, unknown> = {}) {
    return {
        userId: AUTH_USER_ID,
        messageId: MESSAGE_ID,
        localId: "local-1",
        type: "image",
        mimeType: "image/png",
        storageId: STORAGE_ID,
        width: 10,
        height: 10,
        size: 100,
        ...overrides,
    };
}

describe("attachments.create metadata validation", () => {
    test("fails when storage metadata is missing", async () => {
        const { ctx, deletedStorageIds } = buildContext({ metadata: null });

        await expect(
            runHandler(createAttachment as unknown as HandlerExport, ctx, {
                ...baseArgs(),
            }),
        ).rejects.toThrow("Uploaded attachment was not found");

        expect(deletedStorageIds).toEqual([]);
    });

    test("fails and deletes storage when mime type is unsupported", async () => {
        const { ctx, deletedStorageIds } = buildContext({
            metadata: {
                storageId: STORAGE_ID,
                sha256: "abc",
                size: 100,
                contentType: "application/pdf",
            },
        });

        await expect(
            runHandler(createAttachment as unknown as HandlerExport, ctx, {
                ...baseArgs({ mimeType: "application/pdf" }),
            }),
        ).rejects.toThrow("Unsupported attachment type");

        expect(deletedStorageIds).toEqual([STORAGE_ID]);
    });

    test("fails and deletes storage when uploaded type mismatches client type", async () => {
        const { ctx, deletedStorageIds } = buildContext({
            metadata: {
                storageId: STORAGE_ID,
                sha256: "abc",
                size: 100,
                contentType: "image/jpeg",
            },
        });

        await expect(
            runHandler(createAttachment as unknown as HandlerExport, ctx, {
                ...baseArgs({ mimeType: "image/png" }),
            }),
        ).rejects.toThrow("Attachment type mismatch");

        expect(deletedStorageIds).toEqual([STORAGE_ID]);
    });

    test("fails and deletes storage when uploaded size mismatches client size", async () => {
        const { ctx, deletedStorageIds } = buildContext({
            metadata: {
                storageId: STORAGE_ID,
                sha256: "abc",
                size: 120,
                contentType: "image/png",
            },
        });

        await expect(
            runHandler(createAttachment as unknown as HandlerExport, ctx, {
                ...baseArgs({ size: 100 }),
            }),
        ).rejects.toThrow("Attachment size mismatch");

        expect(deletedStorageIds).toEqual([STORAGE_ID]);
    });

    test("fails and deletes storage when uploaded size exceeds limit", async () => {
        const tooLarge = LIMITS.maxAttachmentBytes + 1;
        const { ctx, deletedStorageIds } = buildContext({
            metadata: {
                storageId: STORAGE_ID,
                sha256: "abc",
                size: tooLarge,
                contentType: "image/png",
            },
        });

        await expect(
            runHandler(createAttachment as unknown as HandlerExport, ctx, {
                ...baseArgs({ size: tooLarge }),
            }),
        ).rejects.toThrow("Attachment exceeds maximum size");

        expect(deletedStorageIds).toEqual([STORAGE_ID]);
    });
});
