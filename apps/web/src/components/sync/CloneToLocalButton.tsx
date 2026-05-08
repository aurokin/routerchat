"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useSync } from "@/contexts/SyncContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatBytes, LOCAL_IMAGE_QUOTA } from "@shared/core/quota";

/**
 * Clone to Local Button
 *
 * Lets a signed-in user copy their cloud data to local storage.
 * Only visible when cloud sync is enabled.
 */
export function CloneToLocalButton({
    className,
}: {
    className?: string;
} = {}) {
    const {
        syncState,
        isAuthenticated,
        cloneToLocal,
        isCloning,
        cloneProgress,
        localQuotaStatus,
        cloudQuotaStatus,
    } = useSync();

    const [showConfirm, setShowConfirm] = useState(false);
    const [showQuotaWarning, setShowQuotaWarning] = useState(false);

    if (syncState !== "cloud-enabled" || !isAuthenticated) {
        return null;
    }

    const handleClick = () => {
        // Check if cloning would exceed local quota
        if (
            cloudQuotaStatus &&
            localQuotaStatus &&
            localQuotaStatus.used + cloudQuotaStatus.used > LOCAL_IMAGE_QUOTA
        ) {
            setShowQuotaWarning(true);
        } else {
            setShowConfirm(true);
        }
    };

    const handleConfirm = async () => {
        setShowConfirm(false);
        try {
            await cloneToLocal();
        } catch (error) {
            console.error("Clone to local failed:", error);
        }
    };

    const handleCloneTextOnly = async () => {
        setShowQuotaWarning(false);
        try {
            await cloneToLocal({ textOnly: true });
        } catch (error) {
            console.error("Clone to local (text only) failed:", error);
        }
    };

    const handleCloneWithImages = async () => {
        setShowQuotaWarning(false);
        try {
            await cloneToLocal({ textOnly: false });
        } catch (error) {
            console.error("Clone to local failed:", error);
        }
    };

    return (
        <>
            <button
                onClick={handleClick}
                disabled={isCloning}
                className={`btn-deco-ghost w-full text-muted-foreground cursor-pointer py-3 flex items-center justify-center gap-2 ${className ?? ""}`.trim()}
            >
                {isCloning ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>
                            Cloning...{" "}
                            {cloneProgress
                                ? `${Math.round(cloneProgress.percentage)}%`
                                : ""}
                        </span>
                    </>
                ) : (
                    <>
                        <Download size={16} />
                        <span>Clone Cloud Data to Local</span>
                    </>
                )}
            </button>

            {/* Standard confirmation dialog */}
            <ConfirmDialog
                open={showConfirm}
                title="Clone Cloud Data to Local"
                description="This will copy all your cloud data to local storage. Your cloud data will remain unchanged and cloud sync will stay enabled. This is useful for creating a local backup or for offline access."
                confirmLabel="Clone to Local"
                cancelLabel="Cancel"
                onConfirm={handleConfirm}
                onCancel={() => setShowConfirm(false)}
            />

            {/* Quota warning dialog */}
            <ConfirmDialog
                open={showQuotaWarning}
                title="Local Storage Quota Warning"
                description={`Cloning all cloud images would exceed your local storage limit (${formatBytes(LOCAL_IMAGE_QUOTA)}). You can either clone text only (skip images) or try cloning with images anyway (it may not complete if you run out of local storage).`}
                confirmLabel="Clone Text Only"
                cancelLabel="Clone With Images"
                onConfirm={handleCloneTextOnly}
                onCancel={handleCloneWithImages}
            />
        </>
    );
}
