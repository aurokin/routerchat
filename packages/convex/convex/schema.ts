import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

/**
 * Convex Database Schema for Cloud Sync
 *
 * Mirrors the local IndexedDB structure with additional fields
 * for cloud-specific features (user association, storage references).
 */

const skillSnapshotValidator = v.object({
    id: v.string(),
    name: v.string(),
    description: v.string(),
    prompt: v.string(),
    toolIds: v.optional(v.array(v.string())),
    createdAt: v.number(),
});

const messageUsageValidator = v.object({
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    cost: v.optional(v.number()),
    cachedTokens: v.optional(v.number()),
    webSearchRequests: v.optional(v.number()),
});

// Mirrors `ReasoningDetailChunk` in packages/shared. Re-check upstream when
// expanding: https://openrouter.ai/docs/use-cases/reasoning-tokens
const reasoningDetailValidator = v.object({
    id: v.string(),
    type: v.union(
        v.literal("reasoning.text"),
        v.literal("reasoning.summary"),
        v.literal("reasoning.encrypted"),
    ),
    format: v.optional(v.string()),
    text: v.optional(v.string()),
    signature: v.optional(v.string()),
});

const toolCallValidator = v.object({
    id: v.string(),
    type: v.literal("function"),
    function: v.object({
        name: v.string(),
        arguments: v.string(),
    }),
});

const toolExecutionValidator = v.object({
    id: v.string(),
    name: v.string(),
    arguments: v.string(),
    result: v.optional(v.string()),
    status: v.optional(
        v.union(
            v.literal("pending"),
            v.literal("running"),
            v.literal("success"),
            v.literal("error"),
        ),
    ),
    error: v.optional(v.string()),
});

export default defineSchema({
    ...authTables,
    users: defineTable({
        name: v.optional(v.string()),
        image: v.optional(v.string()),
        email: v.optional(v.string()),
        emailVerificationTime: v.optional(v.number()),
        phone: v.optional(v.string()),
        phoneVerificationTime: v.optional(v.number()),
        isAnonymous: v.optional(v.boolean()),
        initialSync: v.optional(v.boolean()),
        // Encrypted API key storage (AES-256-GCM)
        encryptedApiKey: v.optional(v.string()), // Base64 ciphertext
        apiKeyNonce: v.optional(v.string()), // Base64 IV/nonce
        apiKeyUpdatedAt: v.optional(v.number()), // For sync conflict resolution
        providerSort: v.optional(
            v.union(
                v.literal("default"),
                v.literal("price"),
                v.literal("throughput"),
                v.literal("latency"),
            ),
        ),
        usageAggregatesBackfilledAt: v.optional(v.number()),
        usageBackfillStage: v.optional(
            v.union(
                v.literal("chats"),
                v.literal("messages"),
                v.literal("skills"),
                v.literal("attachments"),
            ),
        ),
        usageBackfillCursor: v.optional(v.union(v.null(), v.string())),
        usageBackfillStartedAt: v.optional(v.number()),
        usageBackfilledChatCount: v.optional(v.number()),
        usageBackfilledMessageCount: v.optional(v.number()),
        usageBackfilledSkillCount: v.optional(v.number()),
        usageBackfilledAttachmentCount: v.optional(v.number()),
        usageBackfilledAttachmentBytes: v.optional(v.number()),
        // Legacy denormalized counters. Keep these optional while existing
        // deployments migrate to aggregate-backed usage accounting.
        cloudChatCount: v.optional(v.number()),
        cloudMessageCount: v.optional(v.number()),
        cloudSkillCount: v.optional(v.number()),
        cloudAttachmentCount: v.optional(v.number()),
        cloudAttachmentBytes: v.optional(v.number()),
        createdAt: v.optional(v.number()),
        updatedAt: v.optional(v.number()),
    })
        .index("email", ["email"])
        .index("phone", ["phone"]),
    chats: defineTable({
        userId: v.id("users"),
        localId: v.optional(v.string()),
        title: v.string(),
        modelId: v.string(),
        thinking: v.string(),
        searchLevel: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index("by_user_updated", ["userId", "updatedAt"])
        .index("by_local_id", ["userId", "localId"]),
    messages: defineTable({
        userId: v.id("users"),
        chatId: v.id("chats"),
        localId: v.optional(v.string()),
        role: v.union(
            v.literal("user"),
            v.literal("assistant"),
            v.literal("system"),
            v.literal("tool"),
        ),
        content: v.string(),
        contextContent: v.string(),
        thinking: v.optional(v.string()),
        skill: v.optional(v.union(v.null(), skillSnapshotValidator)),
        modelId: v.optional(v.string()),
        thinkingLevel: v.optional(v.string()),
        searchLevel: v.optional(v.string()),
        attachmentIds: v.optional(v.array(v.string())),
        usage: v.optional(messageUsageValidator),
        reasoningDetails: v.optional(v.array(reasoningDetailValidator)),
        toolCalls: v.optional(v.array(toolCallValidator)),
        toolCallId: v.optional(v.string()),
        toolName: v.optional(v.string()),
        toolExecutions: v.optional(v.array(toolExecutionValidator)),
        createdAt: v.number(),
    })
        .index("by_chat_created", ["chatId", "createdAt"])
        .index("by_user", ["userId"])
        .index("by_local_id", ["userId", "localId"]),
    skills: defineTable({
        userId: v.id("users"),
        localId: v.optional(v.string()),
        name: v.string(),
        description: v.string(),
        prompt: v.string(),
        toolIds: v.optional(v.array(v.string())),
        createdAt: v.number(),
    })
        .index("by_user", ["userId"])
        .index("by_local_id", ["userId", "localId"]),
    attachments: defineTable({
        userId: v.id("users"),
        messageId: v.id("messages"),
        localId: v.optional(v.string()),
        type: v.union(v.literal("image"), v.literal("file")),
        mimeType: v.string(),
        storageId: v.optional(v.id("_storage")),
        url: v.optional(v.string()),
        filename: v.optional(v.string()),
        width: v.number(),
        height: v.number(),
        size: v.number(),
        purgedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index("by_message", ["messageId"])
        .index("by_user_storage", ["userId", "storageId"])
        .index("by_user_created", ["userId", "createdAt"])
        .index("by_local_id", ["userId", "localId"]),
    apiKeyAccess: defineTable({
        userId: v.id("users"),
        kind: v.union(v.literal("read"), v.literal("read_failed")),
        reason: v.optional(v.string()),
        accessedAt: v.number(),
    }).index("by_user_accessed", ["userId", "accessedAt"]),
    deleteOperations: defineTable({
        userId: v.id("users"),
        kind: v.union(
            v.literal("chat"),
            v.literal("chatMessages"),
            v.literal("message"),
            v.literal("messageAttachments"),
            v.literal("userData"),
            v.literal("userAttachments"),
        ),
        status: v.union(
            v.literal("queued"),
            v.literal("running"),
            v.literal("finished"),
            v.literal("failed"),
        ),
        targetChatId: v.optional(v.id("chats")),
        targetMessageId: v.optional(v.id("messages")),
        workId: v.optional(v.string()),
        cursor: v.optional(v.union(v.null(), v.string())),
        deletedChats: v.number(),
        deletedMessages: v.number(),
        deletedAttachments: v.number(),
        freedAttachmentBytes: v.number(),
        error: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
        finishedAt: v.optional(v.number()),
    })
        .index("by_user_status", ["userId", "status", "updatedAt"])
        .index("by_user_kind", ["userId", "kind", "updatedAt"])
        .index("by_chat", ["targetChatId"])
        .index("by_message", ["targetMessageId"]),
});
