// Image compression and processing utilities

export interface ProcessedImage {
    data: string; // base64 (without data URL prefix)
    mimeType: "image/jpeg" | "image/png" | "image/webp";
    width: number;
    height: number;
    size: number; // bytes
}

export interface ImageProcessingOptions {
    maxWidth?: number; // default: 2048
    maxHeight?: number; // default: 2048
    quality?: number; // default: 0.8
    maxSizeBytes?: number; // default: 4MB
    maxInputBytes?: number; // default: 25MB (fail fast before reading/processing)
}

const DEFAULT_OPTIONS: Required<ImageProcessingOptions> = {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 0.8,
    maxSizeBytes: 4 * 1024 * 1024, // 4MB
    maxInputBytes: 25 * 1024 * 1024, // 25MB
};

// Check if a MIME type is a valid image type we support
export function isValidImageType(mimeType: string): boolean {
    return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
        mimeType,
    );
}

// Read a file as a data URL
export function readFileAsDataURL(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
    });
}

// Load an image from a data URL
export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = dataUrl;
    });
}

// Get image dimensions from a data URL
export async function getImageDimensions(
    dataUrl: string,
): Promise<{ width: number; height: number }> {
    const img = await loadImage(dataUrl);
    return { width: img.naturalWidth, height: img.naturalHeight };
}

// Calculate resize dimensions maintaining aspect ratio
export function calculateResizeDimensions(
    width: number,
    height: number,
    maxWidth: number,
    maxHeight: number,
): { width: number; height: number } {
    if (width <= maxWidth && height <= maxHeight) {
        return { width, height };
    }

    const widthRatio = maxWidth / width;
    const heightRatio = maxHeight / height;
    const ratio = Math.min(widthRatio, heightRatio);

    return {
        width: Math.round(width * ratio),
        height: Math.round(height * ratio),
    };
}

// Check if an image needs compression
export function needsCompression(
    width: number,
    height: number,
    sizeBytes: number,
    options: ImageProcessingOptions = {},
): boolean {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    return (
        width > opts.maxWidth ||
        height > opts.maxHeight ||
        sizeBytes > opts.maxSizeBytes
    );
}

// Compress an image using canvas
export function compressImage(
    img: HTMLImageElement,
    targetWidth: number,
    targetHeight: number,
    quality: number,
    mimeType: string,
): string {
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get canvas context");
    }

    // Use better image smoothing for downscaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // Convert to the appropriate format
    // Use JPEG for photos (smaller size), keep PNG if transparency is needed
    const outputType =
        mimeType === "image/png" || mimeType === "image/webp"
            ? mimeType
            : "image/jpeg";

    const dataUrl = canvas.toDataURL(outputType, quality);
    // Return just the base64 part, without the data URL prefix
    return dataUrl.split(",")[1] ?? "";
}

// Generate a thumbnail for preview
export async function generateThumbnail(
    dataUrl: string,
    maxSize: number = 200,
): Promise<string> {
    const img = await loadImage(dataUrl);
    const { width, height } = calculateResizeDimensions(
        img.naturalWidth,
        img.naturalHeight,
        maxSize,
        maxSize,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Failed to get canvas context");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);

    // Return as data URL for direct use in img src
    return canvas.toDataURL("image/jpeg", 0.7);
}

// Main processing function - compress and resize an image
export async function processImage(
    file: File | Blob,
    options: ImageProcessingOptions = {},
): Promise<ProcessedImage> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Validate file type
    if (!isValidImageType(file.type)) {
        throw new Error(`Unsupported image type: ${file.type}`);
    }

    const originalSize = file.size;
    if (originalSize > opts.maxInputBytes) {
        throw new Error(
            `Image exceeds maximum file size (${Math.round(opts.maxInputBytes / (1024 * 1024))}MB)`,
        );
    }

    // Load the image in a way that avoids converting the whole file to a data URL
    // (which can spike memory usage) when the browser supports object URLs.
    let img: HTMLImageElement;
    let dataUrl: string | null = null;
    let objectUrl: string | null = null;
    try {
        if (
            typeof URL !== "undefined" &&
            typeof URL.createObjectURL === "function" &&
            typeof URL.revokeObjectURL === "function" &&
            // In browsers, File extends Blob. In tests, "File" may be a plain object.
            file instanceof Blob
        ) {
            objectUrl = URL.createObjectURL(file);
            img = await loadImage(objectUrl);
        } else {
            dataUrl = await readFileAsDataURL(file);
            img = await loadImage(dataUrl);
        }
    } finally {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }

    const originalWidth = img.naturalWidth;
    const originalHeight = img.naturalHeight;

    // Check if compression is needed
    if (!needsCompression(originalWidth, originalHeight, originalSize, opts)) {
        // Return original without compression
        const resolvedDataUrl = dataUrl ?? (await readFileAsDataURL(file));
        const base64 = resolvedDataUrl.split(",")[1] ?? "";
        return {
            data: base64,
            mimeType: file.type as ProcessedImage["mimeType"],
            width: originalWidth,
            height: originalHeight,
            size: originalSize,
        };
    }

    // Calculate target dimensions
    const { width: targetWidth, height: targetHeight } =
        calculateResizeDimensions(
            originalWidth,
            originalHeight,
            opts.maxWidth,
            opts.maxHeight,
        );

    // Compress the image
    const base64 = compressImage(
        img,
        targetWidth,
        targetHeight,
        opts.quality,
        file.type,
    );

    // Calculate the size of the base64 data
    const size = Math.ceil((base64.length * 3) / 4);

    // Determine output mime type
    const mimeType: ProcessedImage["mimeType"] =
        file.type === "image/png" || file.type === "image/webp"
            ? (file.type as ProcessedImage["mimeType"])
            : "image/jpeg";

    return {
        data: base64,
        mimeType,
        width: targetWidth,
        height: targetHeight,
        size,
    };
}

// Create a data URL from base64 and mime type
export function createDataUrl(base64: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64}`;
}
