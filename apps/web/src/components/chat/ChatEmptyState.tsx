"use client";

import { Hexagon, Sparkles } from "lucide-react";

interface ChatEmptyStateProps {
    onCreateChat: () => void;
}

export function ChatEmptyState({ onCreateChat }: ChatEmptyStateProps) {
    return (
        <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Subtle radial gradient */}
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/5 via-transparent to-transparent" />
                {/* Corner decorations */}
                <div className="absolute top-8 left-8 w-24 h-24 border-l border-t border-primary/20" />
                <div className="absolute bottom-8 right-8 w-24 h-24 border-r border-b border-primary/20" />
                {/* Grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.02]"
                    style={{
                        backgroundImage:
                            "linear-gradient(var(--primary) 1px, transparent 1px), linear-gradient(90deg, var(--primary) 1px, transparent 1px)",
                        backgroundSize: "60px 60px",
                    }}
                />
            </div>

            <div className="flex-1 flex items-center justify-center relative z-10">
                <div className="text-center max-w-lg px-6">
                    {/* Logo */}
                    <div className="relative inline-block mb-8">
                        <Hexagon
                            size={80}
                            className="text-primary"
                            strokeWidth={1}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-2xl font-semibold text-primary">
                            R
                        </span>
                    </div>

                    <h2 className="text-4xl font-light mb-3 tracking-tight">
                        Welcome to{" "}
                        <span className="font-semibold text-gradient-primary">
                            RouterChat
                        </span>
                    </h2>
                    <p className="text-foreground-muted text-lg mb-8">
                        Your gateway to AI-powered conversations
                    </p>

                    <button
                        onClick={onCreateChat}
                        className="btn-deco btn-deco-primary text-base px-8 py-3 cursor-pointer"
                    >
                        <Sparkles size={18} />
                        <span>Start New Conversation</span>
                    </button>

                    <p className="mt-6 text-sm text-muted-foreground">
                        Or select an existing conversation from the sidebar
                    </p>
                </div>
            </div>
        </div>
    );
}
