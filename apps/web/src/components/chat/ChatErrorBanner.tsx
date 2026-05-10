"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export interface ChatError {
    message: string;
    isRetryable: boolean;
}

interface ChatErrorBannerProps {
    error: ChatError;
    sending: boolean;
    onRetry: () => void;
}

export function ChatErrorBanner({
    error,
    sending,
    onRetry,
}: ChatErrorBannerProps) {
    return (
        <div className="px-6 py-3 bg-error/5 border-b border-error/20 flex items-center gap-3 relative z-20">
            <AlertCircle size={16} className="text-error flex-shrink-0" />
            <p className="text-error text-sm flex-1">{error.message}</p>
            {error.isRetryable && (
                <button
                    onClick={onRetry}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-error/10 hover:bg-error/20 text-error rounded-md transition-colors cursor-pointer"
                    disabled={sending}
                >
                    <RefreshCw
                        size={12}
                        className={sending ? "animate-spin" : ""}
                    />
                    Retry
                </button>
            )}
        </div>
    );
}
