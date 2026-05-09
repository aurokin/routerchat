import { afterAll, afterEach, beforeAll } from "vitest";
import { openRouterServer } from "./src/test-utils/msw";

beforeAll(() => openRouterServer.listen({ onUnhandledRequest: "error" }));
afterEach(() => openRouterServer.resetHandlers());
afterAll(() => openRouterServer.close());
