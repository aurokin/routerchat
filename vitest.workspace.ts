// Vitest 4 workspace config — one project per workspace package so tests can
// pick up the right tsconfig / environment per area.
export default [
    "apps/web/vitest.config.ts",
    "packages/shared/vitest.config.ts",
    "packages/convex/vitest.config.ts",
];
