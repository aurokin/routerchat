"use client";

import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageViewerProps {
    images: { src: string; alt?: string }[];
    initialIndex?: number;
    onClose: () => void;
}

export function ImageViewer({
    images,
    initialIndex = 0,
    onClose,
}: ImageViewerProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);

    const goToPrevious = useCallback(() => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    }, [images.length]);

    const goToNext = useCallback(() => {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    }, [images.length]);

    const handleDownload = () => {
        const image = images[currentIndex];
        const link = document.createElement("a");
        link.href = image.src;
        link.download = image.alt || `image-${currentIndex + 1}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
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
    }, [onClose, goToPrevious, goToNext]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    const currentImage = images[currentIndex];
    const showNavigation = images.length > 1;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            data-keybinding-scope="modal"
            data-keybinding-open="true"
        >
            {/* Close button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors z-10 cursor-pointer"
                title="Close (Esc)"
            >
                <X size={24} />
            </button>

            {/* Download button */}
            <button
                onClick={handleDownload}
                className="absolute top-4 right-16 p-2 text-white/70 hover:text-white transition-colors z-10 cursor-pointer"
                title="Download"
            >
                <Download size={24} />
            </button>

            {/* Previous button */}
            {showNavigation && (
                <button
                    onClick={goToPrevious}
                    className={cn(
                        "absolute left-4 top-1/2 -translate-y-1/2 p-2",
                        "text-white/70 hover:text-white transition-colors z-10 cursor-pointer",
                        "bg-black/30 hover:bg-black/50",
                    )}
                    title="Previous (Left Arrow)"
                >
                    <ChevronLeft size={32} />
                </button>
            )}

            {/* Next button */}
            {showNavigation && (
                <button
                    onClick={goToNext}
                    className={cn(
                        "absolute right-4 top-1/2 -translate-y-1/2 p-2",
                        "text-white/70 hover:text-white transition-colors z-10 cursor-pointer",
                        "bg-black/30 hover:bg-black/50",
                    )}
                    title="Next (Right Arrow)"
                >
                    <ChevronRight size={32} />
                </button>
            )}

            {/* Image */}
            <div
                className="flex items-center justify-center p-8 max-w-full max-h-full"
                onClick={onClose}
            >
                <img
                    src={currentImage.src}
                    alt={currentImage.alt || "Image"}
                    className="max-w-full max-h-[90vh] object-contain"
                    onClick={(e) => e.stopPropagation()}
                />
            </div>

            {/* Image counter */}
            {showNavigation && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 text-white/70 text-sm">
                    {currentIndex + 1} / {images.length}
                </div>
            )}
        </div>
    );
}
