/**
 * Migration Helpers Tests
 *
 * Focused tests for migration helpers used when enabling cloud sync.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
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
            createChat: mock(async () => "chat-1"),
            createMessage: mock(async () => "msg-1"),
            saveAttachment: mock(async () => "att-1"),
        } as unknown as StorageAdapter;

        const localAdapter = {
            getAllChats: mock(async () => [chat]),
            getMessagesByChat: mock(async () => messages),
            getAttachment: mock(async (id: string) => attachments[id]),
            getAttachmentsByMessage: mock(async () => []),
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
            getItem: mock((key: string) =>
                key === "routerchat-skills" ? JSON.stringify(skills) : null,
            ),
            setItem: mock(() => undefined),
            removeItem: mock(() => undefined),
            clear: mock(() => undefined),
            key: mock(() => null),
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
        const mutation = mock(async () => "skill-id");
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
