import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

/**
 * OpenRouter MSW server with permissive defaults.
 *
 * Tests register concrete handlers via `server.use(...)` to assert against
 * specific URLs / payloads / status codes. The defaults below catch any
 * un-mocked OpenRouter call so it surfaces as a clear failure instead of a
 * silent network attempt.
 */
export const openRouterServer = setupServer(
    http.all("https://openrouter.ai/api/*", () => {
        return HttpResponse.json(
            {
                error: { message: "MSW: no handler registered for this URL" },
            },
            { status: 599 },
        );
    }),
);

export { http, HttpResponse };
