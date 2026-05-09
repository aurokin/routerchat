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
        // Default to node so the existing SSR-safety tests (which assert
        // `typeof window === "undefined"`) keep passing. Component tests opt
        // into jsdom with a per-file `// @vitest-environment jsdom` comment.
        environment: "node",
        setupFiles: ["./vitest.setup.ts"],
        coverage: {
            provider: "v8",
            reporter: ["text-summary", "lcov"],
            reportsDirectory: "./coverage",
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
                "src/**/*.test.{ts,tsx}",
                "src/**/__tests__/**",
                "src/test-utils/**",
                "src/**/types.ts",
            ],
        },
    },
});
