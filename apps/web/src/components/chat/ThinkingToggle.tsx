"use client";

import React, { useState, useRef, useEffect } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThinkingLevel } from "@/lib/types";

const THINKING_OPTIONS: {
    value: ThinkingLevel;
    label: string;
    intensity: number;
}[] = [
    { value: "none", label: "Off", intensity: 0 },
    { value: "minimal", label: "Minimal", intensity: 1 },
    { value: "low", label: "Low", intensity: 2 },
    { value: "medium", label: "Medium", intensity: 3 },
    { value: "high", label: "High", intensity: 4 },
    { value: "xhigh", label: "XHigh", intensity: 5 },
];

interface ThinkingToggleProps {
    value: ThinkingLevel;
    onChange: (value: ThinkingLevel) => void;
    disabled?: boolean;
}

export function ThinkingToggle({
    value,
    onChange,
    disabled,
}: ThinkingToggleProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = THINKING_OPTIONS.find((opt) => opt.value === value);
    const isActive = value !== "none";

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === "Escape") setIsOpen(false);
            };
            document.addEventListener("keydown", handleEscape);
            return () => {
                document.removeEventListener("mousedown", handleClickOutside);
                document.removeEventListener("keydown", handleEscape);
            };
        }
    }, [isOpen]);

    return (
        <div
            className="relative"
            ref={dropdownRef}
            data-keybinding-scope="dropdown"
            data-keybinding-open={isOpen ? "true" : "false"}
        >
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={cn(
                    "flex items-center gap-2 px-3 py-2 border transition-all duration-200 min-w-[100px] relative overflow-hidden cursor-pointer",
                    isOpen
                        ? "bg-warning/15 border-warning/60 text-warning"
                        : isActive
                          ? "bg-warning/10 border-warning/40 text-warning"
                          : "bg-background-elevated border-border text-muted-foreground hover:border-warning/30 hover:text-warning/70",
                    disabled && "opacity-50 cursor-not-allowed",
                )}
                title="Thinking level"
            >
                {/* Glow effect when active */}
                {isActive && (
                    <div className="absolute inset-0 bg-warning/5 animate-pulse-soft" />
                )}
                <Brain
                    size={14}
                    className={cn(
                        "relative z-10",
                        isActive && "animate-pulse-soft",
                    )}
                />
                <span className="text-xs font-medium relative z-10">
                    {selectedOption?.label || "Off"}
                </span>
                <ChevronDown
                    size={14}
                    className={cn(
                        "ml-auto transition-transform relative z-10",
                        isOpen && "rotate-180",
                    )}
                />
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-full bg-background-elevated border border-border shadow-deco-elevated z-50 animate-fade-in">
                    {THINKING_OPTIONS.map((option, index) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            className={cn(
                                "w-full px-3 py-2.5 text-left text-xs transition-all duration-150 flex items-center gap-2 cursor-pointer",
                                option.value === value
                                    ? "bg-warning/15 text-warning border-l-2 border-warning"
                                    : "hover:bg-warning/5 text-foreground hover:text-warning",
                            )}
                        >
                            {/* Intensity indicator */}
                            <div className="flex gap-0.5">
                                {[...Array(5)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "w-1 h-2 transition-colors",
                                            i < option.intensity
                                                ? option.value === value
                                                    ? "bg-warning"
                                                    : "bg-warning/40"
                                                : "bg-border",
                                        )}
                                    />
                                ))}
                            </div>
                            <span className="font-medium">{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
