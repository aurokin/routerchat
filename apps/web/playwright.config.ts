import { defineConfig, devices } from "@playwright/test";

const PORT = 4040;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 2 : undefined,
    reporter: process.env.CI ? "github" : "list",

    use: {
        baseURL: BASE_URL,
        trace: "on-first-retry",
    },

    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],

    // Spin up the dev server in local-only mode (no Convex env vars). Speeds
    // up CI by reusing an existing server when one is already on PORT.
    webServer: {
        command: "bun run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
            NEXT_TELEMETRY_DISABLED: "1",
        },
    },
});
