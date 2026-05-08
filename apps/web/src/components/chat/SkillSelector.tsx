"use client";

import React, { useState, useRef, useEffect } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { Book, ChevronDown, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillSelectorProps {
    disabled?: boolean;
}

export function SkillSelector({ disabled }: SkillSelectorProps) {
    const { skills, selectedSkill, setSelectedSkill } = useSettings();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isActive = selectedSkill !== null;

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

    const handleSelectSkill = (skill: (typeof skills)[0] | null) => {
        setSelectedSkill(skill, { mode: "manual" });
        setIsOpen(false);
    };

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
                    "flex items-center gap-2 px-3 py-2 border transition-all duration-200 relative overflow-hidden cursor-pointer",
                    isOpen
                        ? "bg-primary/15 border-primary/60 text-primary"
                        : isActive
                          ? "bg-primary/10 border-primary/40 text-primary"
                          : "bg-background-elevated border-border text-muted-foreground hover:border-primary/30 hover:text-primary/70",
                    disabled && "opacity-50 cursor-not-allowed",
                )}
                title="Select skill"
            >
                {/* Shimmer effect when active */}
                {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer" />
                )}
                <Sparkles
                    size={14}
                    className={cn(
                        "relative z-10",
                        isActive && "animate-pulse-soft",
                    )}
                />
                <span className="text-xs font-medium max-w-[100px] truncate relative z-10">
                    {selectedSkill ? selectedSkill.name : "Skills"}
                </span>
                <ChevronDown
                    size={14}
                    className={cn(
                        "transition-transform relative z-10",
                        isOpen && "rotate-180",
                    )}
                />
            </button>

            {isOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-72 bg-background-elevated border border-border shadow-deco-elevated z-50 max-h-80 overflow-y-auto animate-fade-in">
                    {/* Header */}
                    <div className="px-4 py-2.5 bg-primary/5 border-b border-border">
                        <span className="text-xs font-medium text-primary uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles size={10} />
                            Select Skill
                        </span>
                    </div>

                    {/* None option */}
                    <button
                        type="button"
                        onClick={() => handleSelectSkill(null)}
                        className={cn(
                            "w-full text-left px-4 py-2.5 text-sm transition-all duration-150 flex items-center gap-3 cursor-pointer",
                            !selectedSkill
                                ? "bg-primary/10 border-l-2 border-primary text-primary"
                                : "hover:bg-primary/5 text-foreground",
                        )}
                    >
                        {!selectedSkill ? (
                            <Check size={12} className="text-primary" />
                        ) : (
                            <div className="w-3" />
                        )}
                        <span className="font-medium">None</span>
                    </button>

                    {skills.length === 0 ? (
                        <div className="px-4 py-6 text-center text-muted-foreground">
                            <Book
                                size={24}
                                className="mx-auto mb-2 opacity-50"
                            />
                            <p className="text-sm">No skills available</p>
                            <p className="text-xs mt-1 opacity-70">
                                Create skills in Settings
                            </p>
                        </div>
                    ) : (
                        <div className="border-t border-border">
                            {skills.map((skill) => (
                                <button
                                    key={skill.id}
                                    type="button"
                                    onClick={() => handleSelectSkill(skill)}
                                    className={cn(
                                        "w-full text-left px-4 py-3 transition-all duration-150 flex items-start gap-3 cursor-pointer",
                                        selectedSkill?.id === skill.id
                                            ? "bg-primary/10 border-l-2 border-primary"
                                            : "hover:bg-primary/5",
                                    )}
                                >
                                    {selectedSkill?.id === skill.id ? (
                                        <Check
                                            size={12}
                                            className="text-primary mt-0.5 flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-3 flex-shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div
                                            className={cn(
                                                "font-medium text-sm truncate",
                                                selectedSkill?.id === skill.id
                                                    ? "text-primary"
                                                    : "text-foreground",
                                            )}
                                        >
                                            {skill.name}
                                        </div>
                                        {skill.description && (
                                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                                                {skill.description}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
