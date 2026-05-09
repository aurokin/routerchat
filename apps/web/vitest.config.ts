import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@shared": path.resolve(__dirname, "../../packages/shared/src"),
            "@convex": path.resolve(__dirname, "../../packages/convex/convex"),
        },
    },
    test: {
        name: "web",
        include: ["src/**/*.test.{ts,tsx}"],
        environment: "node",
    },
});
