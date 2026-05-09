import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "convex",
        include: ["convex/**/*.test.ts"],
        environment: "node",
        coverage: {
            provider: "v8",
            reporter: ["text-summary", "lcov"],
            reportsDirectory: "./coverage",
            include: ["convex/**/*.ts"],
            exclude: [
                "convex/**/*.test.ts",
                "convex/**/__tests__/**",
                "convex/_generated/**",
            ],
        },
    },
});
