import type { Id } from "../_generated/dataModel";

export async function safeStorageDelete(
    ctx: { storage: { delete: (storageId: Id<"_storage">) => Promise<void> } },
    storageId: Id<"_storage">,
): Promise<void> {
    try {
        await ctx.storage.delete(storageId);
    } catch (error) {
        // Storage cleanup is best-effort so stale or already-deleted objects
        // don't block database cleanup from completing.
        console.error("Failed to delete storage object:", storageId, error);
    }
}
