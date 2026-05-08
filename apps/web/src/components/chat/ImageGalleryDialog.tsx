"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GalleryImage {
    id: string;
    src: string;
    alt?: string;
    timestamp: number;
}

interface ImageGalleryDialogProps {
    open: boolean;
    images: GalleryImage[];
    initialImageId?: string;
    onClose: () => void;
}

export function ImageGalleryDialog({
    open,
    images,
    initialImageId,
    onClose,
}: ImageGalleryDialogProps) {
    // Sort images by timestamp (oldest first)
    const sortedImages = useMemo(
        () => [...images].sort((a, b) => a.timestamp - b.timestamp),
        [images],
    );

    // Calculate initial index based on initialImageId
    const computedInitialIndex = useMemo(() => {
        if (!initialImageId) return 0;
        const idx = sortedImages.findIndex((img) => img.id === initialImageId);
        return idx >= 0 ? idx : 0;
    }, [initialImageId, sortedImages]);

    const [currentIndex, setCurrentIndex] = useState(computedInitialIndex);

    // Update currentIndex when dialog opens with a new initialImageId
    // Using a ref to track the previous open state to only update on open
    const [prevOpen, setPrevOpen] = useState(false);
    if (open && !prevOpen) {
        setCurrentIndex(computedInitialIndex);
        setPrevOpen(true);
    } else if (!open && prevOpen) {
        setPrevOpen(false);
    }

    const goToPrevious = useCallback(() => {
        setCurrentIndex((prev) =>
            prev > 0 ? prev - 1 : sortedImages.length - 1,
        );
    }, [sortedImages.length]);

    const goToNext = useCallback(() => {
        setCurrentIndex((prev) =>
            prev < sortedImages.length - 1 ? prev + 1 : 0,
        );
    }, [sortedImages.length]);

    const handleDownload = () => {
        const image = sortedImages[currentIndex];
        if (!image) return;
        const link = document.createElement("a");
        link.href = image.src;
        link.download = image.alt || `image-${currentIndex + 1}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.key) {
                case "Escape":
                    onClose();
                    break;
                case "ArrowLeft":
                    goToPrevious();
                    break;
                case "ArrowRight":
                    goToNext();
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose, goToPrevious, goToNext]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
            return () => {
                document.body.style.overflow = "";
            };
        }
    }, [open]);

    if (!open || sortedImages.length === 0) return null;

    // Check if we're in browser environment for portal
    if (typeof document === "undefined") return null;

    const currentImage = sortedImages[currentIndex];
    const showNavigation = sortedImages.length > 1;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/95"
            data-keybinding-scope="modal"
            data-keybinding-open="true"
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-white/70 text-sm">
                    {currentIndex + 1} of {sortedImages.length} images
                </span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Download"
                    >
                        <Download size={20} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        title="Close (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Main image area */}
            <div className="flex-1 relative flex items-center justify-center overflow-hidden">
                {/* Previous button */}
                {showNavigation && (
                    <button
                        onClick={goToPrevious}
                        className={cn(
                            "absolute left-4 top-1/2 -translate-y-1/2 p-3",
                            "text-white/70 hover:text-white transition-colors z-10 cursor-pointer",
                            "bg-black/50 hover:bg-black/70",
                        )}
                        title="Previous (Left Arrow)"
                    >
                        <ChevronLeft size={28} />
                    </button>
                )}

                {/* Next button */}
                {showNavigation && (
                    <button
                        onClick={goToNext}
                        className={cn(
                            "absolute right-4 top-1/2 -translate-y-1/2 p-3",
                            "text-white/70 hover:text-white transition-colors z-10 cursor-pointer",
                            "bg-black/50 hover:bg-black/70",
                        )}
                        title="Next (Right Arrow)"
                    >
                        <ChevronRight size={28} />
                    </button>
                )}

                {/* Current image */}
                <div
                    className="flex items-center justify-center p-8 max-w-full max-h-full"
                    onClick={onClose}
                >
                    <img
                        src={currentImage.src}
                        alt={currentImage.alt || "Image"}
                        className="max-w-full max-h-[calc(100vh-180px)] object-contain"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </div>

            {/* Thumbnail strip */}
            {showNavigation && (
                <div className="border-t border-white/10 p-3 bg-black/50">
                    <div className="flex gap-2 overflow-x-auto justify-center">
                        {sortedImages.map((image, index) => (
                            <button
                                key={image.id}
                                onClick={() => setCurrentIndex(index)}
                                className={cn(
                                    "flex-shrink-0 w-16 h-16 overflow-hidden transition-all cursor-pointer",
                                    index === currentIndex
                                        ? "ring-2 ring-primary ring-offset-2 ring-offset-black"
                                        : "opacity-50 hover:opacity-100",
                                )}
                            >
                                <img
                                    src={image.src}
                                    alt={image.alt || `Thumbnail ${index + 1}`}
                                    className="w-full h-full object-cover"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}
