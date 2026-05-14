"use client";

import { FileText, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendingAttachment } from "@/lib/types";

interface AttachmentPreviewProps {
    attachments: PendingAttachment[];
    processingCount: number;
    onRemove: (id: string) => void;
    disabled?: boolean;
}

export function AttachmentPreview({
    attachments,
    processingCount,
    onRemove,
    disabled,
}: AttachmentPreviewProps) {
    if (attachments.length === 0 && processingCount === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-2 p-3 border-b border-border/50 bg-muted/10">
            {/* Processing placeholders */}
            {Array.from({ length: processingCount }).map((_, index) => (
                <div
                    key={`processing-${index}`}
                    className="relative w-16 h-16 bg-muted/30 border border-border/50 flex items-center justify-center"
                >
                    <Loader2
                        size={20}
                        className="animate-spin text-muted-foreground"
                    />
                    <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center text-muted-foreground bg-background/80 py-0.5">
                        Processing...
                    </span>
                </div>
            ))}

            {/* Actual attachments */}
            {attachments.map((attachment) => (
                <div
                    key={attachment.id}
                    className="relative group w-16 h-16 bg-muted/30 border border-border/50 overflow-hidden"
                >
                    {attachment.type === "image" ? (
                        <img
                            src={attachment.preview}
                            alt="Attachment preview"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 px-1 text-muted-foreground">
                            <FileText size={22} />
                            <span className="text-[9px] uppercase tracking-wider">
                                PDF
                            </span>
                        </div>
                    )}
                    {!disabled && (
                        <button
                            type="button"
                            onClick={() => onRemove(attachment.id)}
                            className={cn(
                                "absolute top-0 right-0 p-1 bg-background/90 text-foreground cursor-pointer",
                                "opacity-0 group-hover:opacity-100 transition-opacity",
                                "hover:bg-destructive hover:text-destructive-foreground",
                            )}
                            title="Remove attachment"
                        >
                            <X size={12} />
                        </button>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center text-muted-foreground bg-background/80 py-0.5 truncate px-1">
                        {attachment.filename
                            ? attachment.filename
                            : attachment.url
                              ? "URL"
                              : formatFileSize(attachment.size)}
                    </span>
                </div>
            ))}
        </div>
    );
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
