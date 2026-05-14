import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ConvexClient } from "@/lib/sync/convex-adapter";

const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDeleteOperation(
    convexClient: ConvexClient,
    operationId: Id<"deleteOperations">,
    timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const operation = await convexClient.query(api.cleanup.get, {
            id: operationId,
        });

        if (!operation || operation.status === "finished") return;
        if (operation.status === "failed") {
            throw new Error(operation.error ?? "Cloud delete operation failed");
        }

        await delay(POLL_INTERVAL_MS);
    }

    throw new Error("Timed out waiting for cloud delete operation");
}
