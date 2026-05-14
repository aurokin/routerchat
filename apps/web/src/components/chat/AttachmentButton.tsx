"use client";

import React, { useRef } from "react";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface AttachmentButtonProps {
    onAttach: (files: File[]) => void;
    disabled?: boolean;
    className?: string;
}

export function AttachmentButton({
    onAttach,
    disabled,
    className,
}: AttachmentButtonProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleClick = () => {
        if (!disabled) {
            inputRef.current?.click();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            onAttach(Array.from(files));
            // Reset input so the same file can be selected again
            e.target.value = "";
        }
    };

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                multiple
                onChange={handleChange}
                className="hidden"
                aria-hidden="true"
            />
            <button
                type="button"
                onClick={handleClick}
                disabled={disabled}
                title="Attach files"
                className={cn(
                    "p-2.5 transition-all duration-200 cursor-pointer",
                    disabled
                        ? "text-muted-foreground/50 cursor-not-allowed"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    className,
                )}
            >
                <Paperclip size={16} />
            </button>
        </>
    );
}
