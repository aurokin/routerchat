"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Wrench } from "lucide-react";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ReasoningSection({
    thinking,
    isStreaming,
}: {
    thinking: string;
    isStreaming?: boolean;
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="mb-3 inline-flex flex-col max-w-[90%] border border-warning/30 bg-warning/15">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-4 py-3 text-warning hover:bg-warning/10 active:bg-warning/15 transition-colors cursor-pointer"
            >
                {isExpanded ? (
                    <ChevronDown size={14} />
                ) : (
                    <ChevronRight size={14} />
                )}
                <Brain size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">
                    Reasoning
                </span>

                {isStreaming && (
                    <span className="ml-2 flex items-center gap-1.5 text-warning/70">
                        <span className="typing-indicator flex gap-0.5">
                            <span />
                            <span />
                            <span />
                        </span>
                    </span>
                )}
            </button>
            {isExpanded && (
                <div className="px-4 pb-3 border-t border-warning/20">
                    <p className="text-foreground text-sm whitespace-pre-wrap mono leading-relaxed pt-3 max-h-64 sm:max-h-96 overflow-y-auto">
                        {thinking}
                    </p>
                </div>
            )}
        </div>
    );
}

export function ToolExecutionSection({
    executions,
}: {
    executions: NonNullable<Message["toolExecutions"]>;
}) {
    if (executions.length === 0) return null;

    return (
        <div className="mb-3 inline-flex flex-col max-w-[90%] border border-accent/25 bg-accent/10">
            <div className="flex items-center gap-2 px-4 py-2.5 text-accent">
                <Wrench size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">
                    Tools
                </span>
            </div>
            <div className="px-4 pb-3 space-y-2">
                {executions.map((execution) => (
                    <div
                        key={execution.id}
                        className="flex items-center gap-2 text-xs text-foreground"
                    >
                        <span
                            className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                execution.status === "error"
                                    ? "bg-error"
                                    : execution.status === "success"
                                      ? "bg-accent"
                                      : "bg-muted-foreground",
                            )}
                        />
                        <span className="font-mono">{execution.name}</span>
                        <span className="text-muted-foreground">
                            {execution.status ?? "pending"}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
