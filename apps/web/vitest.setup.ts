import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./src/test-utils/msw";

// MSW: only intercept the URLs the catch-all matches, leave everything else
// alone. Tests that need to bypass MSW entirely can call `server.close()`.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
    cleanup();
    server.resetHandlers();
});
afterAll(() => server.close());
