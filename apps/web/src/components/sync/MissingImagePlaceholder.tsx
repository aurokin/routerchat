"use client";

import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Missing Image Placeholder
 *
 * Displayed when an image has been purged to save storage space.
 */
interface MissingImagePlaceholderProps {
    width?: number;
    height?: number;
    className?: string;
}

export function MissingImagePlaceholder({
    width = 200,
    height = 150,
    className,
}: MissingImagePlaceholderProps) {
    return (
        <div
            className={cn(
                "flex items-center justify-center bg-muted/30 border border-border",
                className,
            )}
            style={{
                width: width || 200,
                height: height || 150,
                minWidth: 100,
                minHeight: 75,
            }}
        >
            <div className="text-center text-muted-foreground p-4">
                <ImageOff size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs">Image removed to save storage</p>
            </div>
        </div>
    );
}
