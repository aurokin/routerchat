import type { KnipConfig } from "knip";

const config: KnipConfig = {
    workspaces: {
        ".": {
            entry: ["scripts/**/*.ts"],
        },
        "apps/web": {
            entry: [
                "src/app/**/page.tsx",
                "src/app/**/layout.tsx",
                "middleware.ts",
                "next.config.ts",
                "src/lib/openrouter.ts",
                "src/lib/types.ts",
            ],
            project: ["src/**/*.{ts,tsx}", "middleware.ts", "next.config.ts"],
        },
        "packages/shared": {
            entry: ["src/index.ts"],
            project: ["src/**/*.ts"],
        },
        "packages/convex": {
            entry: [
                "convex/auth.ts",
                "convex/auth.config.ts",
                "convex/http.ts",
                "convex/schema.ts",
                "convex/{apiKey,attachments,chats,messages,skills,users}.ts",
            ],
            project: ["convex/**/*.ts", "!convex/_generated/**"],
        },
    },
    ignoreDependencies: [
        // Tailwind 4 plugin pulled in via CSS @plugin directive — knip can't see CSS.
        "@tailwindcss/typography",
        "tailwindcss",
    ],
};

export default config;
