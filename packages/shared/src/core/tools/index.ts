import type { FunctionTool, ToolCall } from "../openrouter/types";

export type LocalToolId = "current_datetime" | "calculator";

export type LocalToolDefinition = {
    id: LocalToolId;
    label: string;
    description: string;
    tool: FunctionTool;
};

export const LOCAL_TOOL_DEFINITIONS: LocalToolDefinition[] = [
    {
        id: "current_datetime",
        label: "Current date and time",
        description: "Returns the user's current local date and time.",
        tool: {
            type: "function",
            function: {
                name: "current_datetime",
                description:
                    "Get the user's current local date and time, including timezone.",
                parameters: {
                    type: "object",
                    properties: {},
                    additionalProperties: false,
                },
            },
        },
    },
    {
        id: "calculator",
        label: "Calculator",
        description: "Evaluates basic arithmetic expressions.",
        tool: {
            type: "function",
            function: {
                name: "calculator",
                description:
                    "Evaluate a basic arithmetic expression. Supports numbers, parentheses, +, -, *, /, %, and exponentiation.",
                parameters: {
                    type: "object",
                    properties: {
                        expression: {
                            type: "string",
                            description: "Arithmetic expression to evaluate.",
                        },
                    },
                    required: ["expression"],
                    additionalProperties: false,
                },
            },
        },
    },
];

const TOOL_BY_ID = new Map(
    LOCAL_TOOL_DEFINITIONS.map((definition) => [definition.id, definition]),
);
const TOOL_BY_NAME = new Map(
    LOCAL_TOOL_DEFINITIONS.map((definition) => [
        definition.tool.function.name,
        definition,
    ]),
);

export function getFunctionToolsForIds(
    ids: string[] | undefined,
): FunctionTool[] {
    if (!ids?.length) return [];
    return ids
        .map((id) => TOOL_BY_ID.get(id as LocalToolId)?.tool)
        .filter((tool): tool is FunctionTool => Boolean(tool));
}

export function isKnownLocalTool(name: string): boolean {
    return TOOL_BY_NAME.has(name);
}

function parseToolArguments(raw: string): Record<string, unknown> {
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Tool arguments must be a JSON object");
    }
    return parsed as Record<string, unknown>;
}

function evaluateArithmeticExpression(expression: string): number {
    const normalized = expression.trim();
    if (!normalized) throw new Error("Expression is empty");
    if (!/^[\d\s+\-*/%().eE]+$/.test(normalized)) {
        throw new Error("Expression contains unsupported characters");
    }

    // The expression is restricted to arithmetic characters before evaluation.
    const result = Function(
        `"use strict"; return (${normalized});`,
    )() as unknown;
    if (typeof result !== "number" || !Number.isFinite(result)) {
        throw new Error("Expression did not produce a finite number");
    }
    return result;
}

export async function executeLocalToolCall(
    call: ToolCall,
    now: Date = new Date(),
): Promise<string> {
    const args = parseToolArguments(call.function.arguments);

    if (call.function.name === "current_datetime") {
        return JSON.stringify({
            iso: now.toISOString(),
            locale: now.toLocaleString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            utcOffsetMinutes: -now.getTimezoneOffset(),
        });
    }

    if (call.function.name === "calculator") {
        const expression = args.expression;
        if (typeof expression !== "string") {
            throw new Error("calculator.expression must be a string");
        }
        return JSON.stringify({
            expression,
            result: evaluateArithmeticExpression(expression),
        });
    }

    throw new Error(`Unknown tool: ${call.function.name}`);
}
