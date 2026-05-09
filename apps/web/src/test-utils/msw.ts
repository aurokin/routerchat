import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

/**
 * Web-side MSW server. Defaults to a 599 catch-all so any un-mocked
 * OpenRouter call surfaces as a clear test failure rather than a real
 * network attempt. Tests register specific handlers via `server.use(...)`.
 */
export const server = setupServer(
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
