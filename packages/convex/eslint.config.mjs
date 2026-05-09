import pluginImportX from "eslint-plugin-import-x";
import pluginSonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["node_modules/**", "dist/**", "convex/_generated/**"],
    },
    {
        files: ["**/*.{ts,tsx}"],
        plugins: {
            "@typescript-eslint": tseslint.plugin,
            "import-x": pluginImportX,
            sonarjs: pluginSonarjs,
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-floating-promises": "warn",
            "@typescript-eslint/no-misused-promises": [
                "warn",
                { checksVoidReturn: false },
            ],
            "@typescript-eslint/await-thenable": "warn",
            "@typescript-eslint/consistent-type-imports": [
                "warn",
                {
                    prefer: "type-imports",
                    fixStyle: "inline-type-imports",
                    disallowTypeAnnotations: false,
                },
            ],
            "@typescript-eslint/no-non-null-assertion": "off",
            "sonarjs/cognitive-complexity": ["warn", 25],
            "import-x/no-cycle": ["warn", { maxDepth: 5 }],
        },
    },
);
