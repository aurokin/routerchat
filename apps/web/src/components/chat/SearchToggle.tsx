"use client";

import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchLevel } from "@/lib/types";

const SEARCH_OPTIONS: {
    value: SearchLevel;
    label: string;
    results: number;
    intensity: number;
}[] = [
    { value: "none", label: "Off", results: 0, intensity: 0 },
    { value: "low", label: "Low", results: 3, intensity: 1 },
    { value: "medium", label: "Medium", results: 6, intensity: 2 },
    { value: "high", label: "High", results: 10, intensity: 3 },
];

interface SearchToggleProps {
    value: SearchLevel;
    onChange: (value: SearchLevel) => void;
    disabled?: boolean;
}

export function SearchToggle({ value, onChange, disabled }: SearchToggleProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedOption = SEARCH_OPTIONS.find((opt) => opt.value === value);
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
                        ? "bg-accent/15 border-accent/60 text-accent"
                        : isActive
                          ? "bg-accent/10 border-accent/50 text-accent"
                          : "bg-background-elevated border-border text-muted-foreground hover:border-accent/30 hover:text-accent/70",
                    disabled && "opacity-50 cursor-not-allowed",
                )}
                title="Search level"
            >
                {/* Glow effect when active */}
                {isActive && (
                    <div className="absolute inset-0 bg-accent/5 animate-pulse-soft" />
                )}
                <Search
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
                <div className="absolute bottom-full mb-2 left-0 w-full min-w-[140px] bg-background-elevated border border-border shadow-deco-elevated z-50 animate-fade-in">
                    {SEARCH_OPTIONS.map((option) => (
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
                                    ? "bg-accent/15 text-accent border-l-2 border-accent"
                                    : "hover:bg-accent/5 text-foreground hover:text-accent",
                            )}
                        >
                            {/* Intensity indicator */}
                            <div className="flex gap-0.5">
                                {[...Array(3)].map((_, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            "w-1 h-2 transition-colors",
                                            i < option.intensity
                                                ? option.value === value
                                                    ? "bg-accent"
                                                    : "bg-accent/40"
                                                : "bg-border",
                                        )}
                                    />
                                ))}
                            </div>
                            <span className="font-medium">{option.label}</span>
                            {option.results > 0 && (
                                <span className="ml-auto text-muted-foreground text-[10px]">
                                    {option.results}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
