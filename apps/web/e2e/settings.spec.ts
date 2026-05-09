import { test, expect } from "@playwright/test";

test.describe("settings page", () => {
    test("renders settings UI without authentication", async ({ page }) => {
        await page.goto("/settings");
        // The settings shell should always render — sections gate themselves
        // on Convex availability, but the page itself never requires it.
        await expect(page).toHaveURL(/\/settings/);
    });
});
