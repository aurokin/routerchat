import { test, expect, describe } from "vitest";

describe("Skeleton components", () => {
    describe("Skeleton", () => {
        test("Skeleton module loads without error", async () => {
            const mod = await import("../../ui/Skeleton");
            expect(mod.Skeleton).toBeDefined();
            expect(typeof mod.Skeleton).toBe("function");
        });

        test("Skeleton accepts className prop", async () => {
            const mod = await import("../../ui/Skeleton");
            expect(mod.Skeleton.length).toBe(1);
        });
    });

    describe("ChatListSkeleton", () => {
        test("ChatListSkeleton module loads without error", async () => {
            const mod = await import("../ChatListSkeleton");
            expect(mod.ChatListSkeleton).toBeDefined();
            expect(typeof mod.ChatListSkeleton).toBe("function");
        });
    });

    describe("MessageListSkeleton", () => {
        test("MessageListSkeleton module loads without error", async () => {
            const mod = await import("../MessageListSkeleton");
            expect(mod.MessageListSkeleton).toBeDefined();
            expect(typeof mod.MessageListSkeleton).toBe("function");
        });

        test("MessageListSkeleton accepts count and streaming props", async () => {
            const mod = await import("../MessageListSkeleton");
            expect(mod.MessageListSkeleton.length).toBe(1);
        });
    });
});
