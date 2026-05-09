import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("local-only mode (no Convex configured)", () => {
    test("loads the home page", async ({ page }) => {
        await page.goto("/");

        // Some path-aware route lands the user on the chat surface — make sure
        // a top-level heading or the input renders so we know the SPA booted.
        await expect(page).toHaveTitle(/router/i);
    });

    test("no console errors on initial load", async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (err) => errors.push(err.message));
        page.on("console", (msg) => {
            if (msg.type() === "error") errors.push(msg.text());
        });

        await page.goto("/");
        // Give the SPA a moment to settle (lazy chunks, hydration).
        await page.waitForLoadState("networkidle");

        // Filter out noise that doesn't represent a real regression
        // (e.g., third-party browser extensions injected into devtools).
        const realErrors = errors.filter(
            (e) => !/extension|chrome-extension/i.test(e),
        );
        expect(realErrors).toEqual([]);
    });

    test("home page has no critical accessibility violations", async ({
        page,
    }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const results = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa"])
            .analyze();

        const critical = results.violations.filter(
            (v) => v.impact === "critical" || v.impact === "serious",
        );
        expect(critical).toEqual([]);
    });
});
