import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { deleteWorkpool } from "./delete_workpool";

export type DeleteOperationKind =
    | "chat"
    | "chatMessages"
    | "message"
    | "messageAttachments"
    | "userData"
    | "userAttachments";

export async function enqueueDeleteOperation(
    ctx: MutationCtx,
    args: {
        userId: Id<"users">;
        kind: DeleteOperationKind;
        targetChatId?: Id<"chats">;
        targetMessageId?: Id<"messages">;
    },
): Promise<Id<"deleteOperations">> {
    const now = Date.now();
    const operationId = await ctx.db.insert("deleteOperations", {
        userId: args.userId,
        kind: args.kind,
        status: "queued",
        targetChatId: args.targetChatId,
        targetMessageId: args.targetMessageId,
        deletedChats: 0,
        deletedMessages: 0,
        deletedAttachments: 0,
        freedAttachmentBytes: 0,
        createdAt: now,
        updatedAt: now,
    });

    const workId = await deleteWorkpool.enqueueMutation(
        ctx,
        internal.cleanup.processDeleteOperation,
        { operationId },
        { name: `delete:${args.kind}` },
    );

    await ctx.db.patch(operationId, {
        workId,
        updatedAt: Date.now(),
    });

    return operationId;
}
