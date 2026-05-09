/**
 * Convex Type Definitions
 *
 * These types define the interface for Convex operations without depending
 * on generated types. This allows the code to compile even when Convex
 * isn't initialized yet.
 */

import type { ChatSession, Message, Attachment, Skill } from "@/lib/types";

/**
 * Branded type for Convex document IDs.
 * The __tableName property is never actually set at runtime,
 * it's just used for type-level discrimination.
 */
export type ConvexId<TableName extends string> = string & {
    readonly __tableName: TableName;
};

/**
 * Convex client interface for mutations, queries, and actions.
 */
export interface ConvexClientInterface {
    mutation<Args, Result>(
        fn: ConvexFunctionReference<"mutation", Args, Result>,
        args: Args,
    ): Promise<Result>;
    query<Args, Result>(
        fn: ConvexFunctionReference<"query", Args, Result>,
        args: Args,
    ): Promise<Result>;
    action<Args, Result>(
        fn: ConvexFunctionReference<"action", Args, Result>,
        args: Args,
    ): Promise<Result>;
}

/**
 * Generic function reference type.
 * This matches Convex's FunctionReference pattern without importing it.
 */
export interface ConvexFunctionReference<
    Type extends "mutation" | "query" | "action",
    _Args = unknown,
    _Result = unknown,
> {
    _type: Type;
    _args: _Args;
    _returnType: _Result;
}

export interface ConvexPaginationOpts {
    numItems: number;
    cursor: string | null;
    endCursor?: string | null;
    maximumRowsRead?: number;
    maximumBytesRead?: number;
}

export interface ConvexPaginationResult<T> {
    page: T[];
    isDone: boolean;
    continueCursor: string;
    splitCursor?: string | null;
    pageStatus?: "SplitRecommended" | "SplitRequired" | null;
}

/**
 * Convex document types (matching the schema)
 */
export interface ConvexChat {
    _id: ConvexId<"chats">;
    userId: ConvexId<"users">;
    localId: string;
    title: string;
    modelId: string;
    thinking: ChatSession["thinking"];
    searchLevel: ChatSession["searchLevel"];
    createdAt: number;
    updatedAt: number;
}

export interface ConvexMessage {
    _id: ConvexId<"messages">;
    userId: ConvexId<"users">;
    chatId: ConvexId<"chats">;
    localId: string;
    role: Message["role"];
    content: string;
    contextContent: string;
    thinking?: string;
    skill?: Skill | null;
    modelId?: string;
    thinkingLevel?: Message["thinkingLevel"];
    searchLevel?: Message["searchLevel"];
    attachmentIds?: string[];
    createdAt: number;
}

export interface ConvexSkill {
    _id: ConvexId<"skills">;
    userId: ConvexId<"users">;
    localId?: string;
    name: Skill["name"];
    description: Skill["description"];
    prompt: Skill["prompt"];
    createdAt: number;
}

export interface ConvexAttachment {
    _id: ConvexId<"attachments">;
    userId: ConvexId<"users">;
    messageId: ConvexId<"messages">;
    localId: string;
    type: "image";
    mimeType: Attachment["mimeType"];
    storageId: string;
    width: number;
    height: number;
    size: number;
    createdAt: number;
    purgedAt?: number;
}

/**
 * API function types - these match what the generated API will have
 */
export interface ConvexAPI {
    chats: {
        create: ConvexFunctionReference<
            "mutation",
            {
                userId: ConvexId<"users">;
                localId: string;
                title: string;
                modelId: string;
                thinking: ChatSession["thinking"];
                searchLevel: ChatSession["searchLevel"];
                createdAt: number;
                updatedAt: number;
            },
            ConvexId<"chats">
        >;
        get: ConvexFunctionReference<
            "query",
            { id: ConvexId<"chats"> },
            ConvexChat | null
        >;
        getByLocalId: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users">; localId: string },
            ConvexChat | null
        >;
        listByUser: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users"> },
            ConvexChat[]
        >;
        listByUserPaginated: ConvexFunctionReference<
            "query",
            {
                userId: ConvexId<"users">;
                paginationOpts: ConvexPaginationOpts;
            },
            ConvexPaginationResult<ConvexChat>
        >;
        update: ConvexFunctionReference<
            "mutation",
            {
                id: ConvexId<"chats">;
                title: string;
                modelId: string;
                thinking: ChatSession["thinking"];
                searchLevel: ChatSession["searchLevel"];
            },
            void
        >;
        remove: ConvexFunctionReference<
            "mutation",
            { id: ConvexId<"chats"> },
            void
        >;
    };
    messages: {
        create: ConvexFunctionReference<
            "mutation",
            {
                userId: ConvexId<"users">;
                chatId: ConvexId<"chats">;
                localId: string;
                role: Message["role"];
                content: string;
                contextContent: string;
                thinking?: string;
                skill?: Skill | null;
                modelId?: string;
                thinkingLevel?: Message["thinkingLevel"];
                searchLevel?: Message["searchLevel"];
                attachmentIds?: string[];
                createdAt: number;
            },
            ConvexId<"messages">
        >;
        getByLocalId: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users">; localId: string },
            ConvexMessage | null
        >;
        listByChat: ConvexFunctionReference<
            "query",
            { chatId: ConvexId<"chats"> },
            ConvexMessage[]
        >;
        listByChatPaginated: ConvexFunctionReference<
            "query",
            { chatId: ConvexId<"chats">; paginationOpts: ConvexPaginationOpts },
            ConvexPaginationResult<ConvexMessage>
        >;
        update: ConvexFunctionReference<
            "mutation",
            {
                id: ConvexId<"messages">;
                content: string;
                contextContent: string;
                thinking?: string;
                attachmentIds?: string[];
            },
            void
        >;
        remove: ConvexFunctionReference<
            "mutation",
            { id: ConvexId<"messages"> },
            void
        >;
        deleteByChat: ConvexFunctionReference<
            "mutation",
            { chatId: ConvexId<"chats"> },
            void
        >;
    };
    skills: {
        create: ConvexFunctionReference<
            "mutation",
            {
                userId: ConvexId<"users">;
                localId?: string;
                name: Skill["name"];
                description: Skill["description"];
                prompt: Skill["prompt"];
                createdAt?: number;
            },
            ConvexId<"skills">
        >;
        listByUser: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users"> },
            ConvexSkill[]
        >;
        listByUserPaginated: ConvexFunctionReference<
            "query",
            {
                userId: ConvexId<"users">;
                paginationOpts: ConvexPaginationOpts;
            },
            ConvexPaginationResult<ConvexSkill>
        >;
        getByLocalId: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users">; localId: string },
            ConvexSkill | null
        >;
        update: ConvexFunctionReference<
            "mutation",
            {
                id: ConvexId<"skills">;
                name?: Skill["name"];
                description?: Skill["description"];
                prompt?: Skill["prompt"];
            },
            void
        >;
        remove: ConvexFunctionReference<
            "mutation",
            { id: ConvexId<"skills"> },
            void
        >;
    };
    attachments: {
        generateUploadUrl: ConvexFunctionReference<"mutation", object, string>;
        create: ConvexFunctionReference<
            "mutation",
            {
                userId: ConvexId<"users">;
                messageId: ConvexId<"messages">;
                localId: string;
                type: "image";
                mimeType: string;
                storageId: string;
                width: number;
                height: number;
                size: number;
                createdAt: number;
            },
            ConvexId<"attachments">
        >;
        get: ConvexFunctionReference<
            "query",
            { id: ConvexId<"attachments"> },
            ConvexAttachment | null
        >;
        getByLocalId: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users">; localId: string },
            ConvexAttachment | null
        >;
        listByMessage: ConvexFunctionReference<
            "query",
            { messageId: ConvexId<"messages"> },
            ConvexAttachment[]
        >;
        getUrl: ConvexFunctionReference<
            "query",
            { storageId: string },
            string | null
        >;
        remove: ConvexFunctionReference<
            "mutation",
            { id: ConvexId<"attachments"> },
            void
        >;
        deleteByMessage: ConvexFunctionReference<
            "mutation",
            { messageId: ConvexId<"messages"> },
            void
        >;
        getTotalBytesByUser: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users"> },
            number
        >;
    };
    users: {
        getStorageUsage: ConvexFunctionReference<
            "query",
            { userId: ConvexId<"users"> },
            {
                bytes: number;
                messageCount: number;
                sessionCount: number;
            }
        >;
    };
}
