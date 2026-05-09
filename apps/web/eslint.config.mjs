import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginJsxA11y from "eslint-plugin-jsx-a11y";
import pluginImportX from "eslint-plugin-import-x";
import pluginSonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            ".next/**",
            "node_modules/**",
            "convex/_generated/**",
            "coverage/**",
            "test-results/**",
            "playwright-report/**",
            "**/*.config.ts",
            "**/*.config.mjs",
            "**/next-env.d.ts",
        ],
    },
    {
        files: ["**/*.{ts,tsx}"],
        plugins: {
            "@typescript-eslint": tseslint.plugin,
            react: pluginReact,
            "react-hooks": pluginReactHooks,
            "jsx-a11y": pluginJsxA11y,
            "import-x": pluginImportX,
            sonarjs: pluginSonarjs,
        },
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: { jsx: true },
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        settings: {
            react: { version: "19" },
        },
        rules: {
            ...pluginReact.configs.recommended.rules,
            ...pluginReact.configs["jsx-runtime"].rules,
            ...pluginReactHooks.configs.recommended.rules,
            ...pluginJsxA11y.flatConfigs.recommended.rules,

            "react/react-in-jsx-scope": "off",
            // Will be addressed in a W2/W6 follow-up; tracked across many files.
            "react-hooks/set-state-in-effect": "warn",

            // Type-aware rules. Most start as warnings during the refactor —
            // ratchet to error per-rule once the relevant cleanup lands.
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

            // Complexity (warn — informational only for now).
            "sonarjs/cognitive-complexity": ["warn", 25],

            // Imports.
            "import-x/no-cycle": ["warn", { maxDepth: 5 }],

            // jsx-a11y rules (warn — many existing click handlers need
            // proper keyboard support; tracked debt).
            "jsx-a11y/click-events-have-key-events": "warn",
            "jsx-a11y/no-static-element-interactions": "warn",
            "jsx-a11y/no-noninteractive-element-interactions": "warn",
            "jsx-a11y/role-supports-aria-props": "warn",
            "jsx-a11y/no-autofocus": "warn",
        },
    },
);
