/**
 * Migration Helpers Tests
 *
 * Focused tests for migration helpers used when enabling cloud sync.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatSession, Message, Attachment, Skill } from "@/lib/types";
import type { StorageAdapter } from "@/lib/sync/storage-adapter";
import type { ConvexClientInterface, ConvexId } from "@/lib/sync/convex-types";
import type { MigrationProgress } from "@/lib/sync/types";
import {
    migrateLocalToCloud,
    migrateSkillsToCloud,
} from "@/lib/sync/migration";

const createChat = (overrides: Partial<ChatSession> = {}): ChatSession => ({
    id: "chat-1",
    title: "Chat",
    modelId: "model",
    thinking: "none",
    searchLevel: "none",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
});

const createMessage = (overrides: Partial<Message> = {}): Message => ({
    id: "msg-1",
    sessionId: "chat-1",
    role: "user",
    content: "Hello",
    contextContent: "Hello",
    createdAt: 1000,
    ...overrides,
});

const createAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
    id: "att-1",
    messageId: "msg-1",
    type: "image",
    mimeType: "image/png",
    data: "data",
    width: 100,
    height: 100,
    size: 1024,
    createdAt: 1000,
    ...overrides,
});

describe("migrateLocalToCloud", () => {
    it("migrates chats, messages, and attachments", async () => {
        const chat = createChat();
        const messages = [
            createMessage({ id: "msg-1", attachmentIds: ["att-1"] }),
            createMessage({ id: "msg-2", attachmentIds: [] }),
        ];
        const attachments = {
            "att-1": createAttachment({ id: "att-1", messageId: "msg-1" }),
        } as Record<string, Attachment>;

        const cloudAdapter = {
            createChat: vi.fn(async () => "chat-1"),
            createMessage: vi.fn(async () => "msg-1"),
            saveAttachment: vi.fn(async () => "att-1"),
        } as unknown as StorageAdapter;

        const localAdapter = {
            getAllChats: vi.fn(async () => [chat]),
            getMessagesByChat: vi.fn(async () => messages),
            getAttachment: vi.fn(async (id: string) => attachments[id]),
            getAttachmentsByMessage: vi.fn(async () => []),
        } as unknown as StorageAdapter;

        const progressUpdates: MigrationProgress[] = [];
        const onProgress = (progress: MigrationProgress) => {
            progressUpdates.push(progress);
        };

        await migrateLocalToCloud(cloudAdapter, onProgress, localAdapter);

        expect(cloudAdapter.createChat).toHaveBeenCalledTimes(1);
        expect(cloudAdapter.createMessage).toHaveBeenCalledTimes(2);
        expect(cloudAdapter.saveAttachment).toHaveBeenCalledTimes(1);
        expect(progressUpdates.at(-1)?.phase).toBe("complete");
        expect(progressUpdates.map((item) => item.phase)).toContain("chats");
        expect(progressUpdates.map((item) => item.phase)).toContain("messages");
        expect(progressUpdates.map((item) => item.phase)).toContain(
            "attachments",
        );
    });
});

describe("migrateSkillsToCloud", () => {
    const originalWindow = globalThis.window;
    const originalLocalStorage = globalThis.localStorage;

    beforeEach(() => {
        const skills: Skill[] = [
            {
                id: "skill-1",
                name: "Summarize",
                description: "Summaries",
                prompt: "Summarize",
                createdAt: 1000,
            },
        ];
        const localStorageMock = {
            getItem: vi.fn((key: string) =>
                key === "routerchat-skills" ? JSON.stringify(skills) : null,
            ),
            setItem: vi.fn(() => undefined),
            removeItem: vi.fn(() => undefined),
            clear: vi.fn(() => undefined),
            key: vi.fn(() => null),
            length: 0,
        } as unknown as Storage;

        globalThis.window = { localStorage: localStorageMock } as Window &
            typeof globalThis;
        globalThis.localStorage = localStorageMock;
    });

    afterEach(() => {
        globalThis.window = originalWindow;
        globalThis.localStorage = originalLocalStorage;
    });

    it("creates skill records for each local skill", async () => {
        const mutation = vi.fn(async () => "skill-id");
        const client = {
            mutation,
        } as unknown as ConvexClientInterface;
        const userId = "user-1" as ConvexId<"users">;

        await migrateSkillsToCloud(client, userId);

        expect(mutation).toHaveBeenCalledTimes(1);
        expect(mutation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                userId,
                localId: "skill-1",
                name: "Summarize",
                description: "Summaries",
                prompt: "Summarize",
                createdAt: 1000,
            }),
        );
    });
});
