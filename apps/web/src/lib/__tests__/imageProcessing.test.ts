import { afterEach, beforeEach, describe, test, expect } from "vitest";
import {
    isValidImageType,
    calculateResizeDimensions,
    needsCompression,
    createDataUrl,
    readFileAsDataURL,
    loadImage,
    compressImage,
    generateThumbnail,
    processImage,
} from "@/lib/imageProcessing";

describe("imageProcessing", () => {
    describe("isValidImageType", () => {
        test("isValidImageType accepts JPEG", () => {
            expect(isValidImageType("image/jpeg")).toBe(true);
        });

        test("isValidImageType accepts PNG", () => {
            expect(isValidImageType("image/png")).toBe(true);
        });

        test("isValidImageType accepts GIF", () => {
            expect(isValidImageType("image/gif")).toBe(true);
        });

        test("isValidImageType accepts WebP", () => {
            expect(isValidImageType("image/webp")).toBe(true);
        });

        test("isValidImageType rejects PDF", () => {
            expect(isValidImageType("application/pdf")).toBe(false);
        });

        test("isValidImageType rejects text", () => {
            expect(isValidImageType("text/plain")).toBe(false);
        });

        test("isValidImageType rejects empty string", () => {
            expect(isValidImageType("")).toBe(false);
        });
    });

    describe("calculateResizeDimensions", () => {
        test("calculateResizeDimensions landscape image", () => {
            const result = calculateResizeDimensions(4000, 2000, 2048, 2048);
            expect(result.width).toBe(2048);
            expect(result.height).toBe(1024);
        });

        test("calculateResizeDimensions portrait image", () => {
            const result = calculateResizeDimensions(2000, 4000, 2048, 2048);
            expect(result.width).toBe(1024);
            expect(result.height).toBe(2048);
        });

        test("calculateResizeDimensions square image", () => {
            const result = calculateResizeDimensions(4000, 4000, 2048, 2048);
            expect(result.width).toBe(2048);
            expect(result.height).toBe(2048);
        });

        test("calculateResizeDimensions no resize needed", () => {
            const result = calculateResizeDimensions(1000, 500, 2048, 2048);
            expect(result.width).toBe(1000);
            expect(result.height).toBe(500);
        });

        test("calculateResizeDimensions maintains aspect ratio", () => {
            const result = calculateResizeDimensions(3000, 1500, 2048, 2048);
            const originalRatio = 3000 / 1500;
            const newRatio = result.width / result.height;
            expect(Math.abs(originalRatio - newRatio)).toBeLessThan(0.01);
        });

        test("calculateResizeDimensions with different max dimensions", () => {
            const result = calculateResizeDimensions(2000, 1000, 1024, 768);
            // Width limited by maxWidth
            expect(result.width).toBeLessThanOrEqual(1024);
            expect(result.height).toBeLessThanOrEqual(768);
        });
    });

    describe("needsCompression", () => {
        const defaultOptions = {
            maxWidth: 2048,
            maxHeight: 2048,
            maxSizeBytes: 4 * 1024 * 1024,
        };

        test("needsCompression returns true for large dimensions", () => {
            expect(needsCompression(4000, 3000, 1000, defaultOptions)).toBe(
                true,
            );
        });

        test("needsCompression returns true for large file size", () => {
            expect(
                needsCompression(1000, 1000, 5 * 1024 * 1024, defaultOptions),
            ).toBe(true);
        });

        test("needsCompression returns false for small files", () => {
            expect(needsCompression(1000, 1000, 500000, defaultOptions)).toBe(
                false,
            );
        });

        test("needsCompression returns false for exact max dimensions", () => {
            expect(needsCompression(2048, 2048, 1000000, defaultOptions)).toBe(
                false,
            );
        });

        test("needsCompression with custom options", () => {
            const customOptions = {
                maxWidth: 1024,
                maxHeight: 1024,
                maxSizeBytes: 1 * 1024 * 1024,
            };
            expect(needsCompression(2000, 1000, 500000, customOptions)).toBe(
                true,
            );
        });
    });

    describe("createDataUrl", () => {
        test("createDataUrl creates proper JPEG data URL", () => {
            const base64 = "SGVsbG8gV29ybGQ="; // "Hello World" in base64
            const result = createDataUrl(base64, "image/jpeg");
            expect(result).toBe("data:image/jpeg;base64,SGVsbG8gV29ybGQ=");
        });

        test("createDataUrl creates proper PNG data URL", () => {
            const base64 = "dGVzdA==";
            const result = createDataUrl(base64, "image/png");
            expect(result).toBe("data:image/png;base64,dGVzdA==");
        });

        test("createDataUrl creates proper WebP data URL", () => {
            const base64 = "dGVzdA==";
            const result = createDataUrl(base64, "image/webp");
            expect(result).toBe("data:image/webp;base64,dGVzdA==");
        });
    });

    describe("browser helpers", () => {
        const originalDocument = globalThis.document;
        const originalImage = globalThis.Image;
        const originalFileReader = globalThis.FileReader;
        const originalWindow = globalThis.window;

        const canvasContext = {
            drawImage: () => undefined,
            imageSmoothingEnabled: false,
            imageSmoothingQuality: "",
        };

        const canvas = {
            width: 0,
            height: 0,
            getContext: () => canvasContext,
            toDataURL: (type: string) => `data:${type};base64,COMPRESSED`,
        };

        class MockFileReader {
            static shouldError = false;
            result: string | null = null;
            onload: ((event: Event) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;

            readAsDataURL(file: any) {
                if (MockFileReader.shouldError) {
                    this.onerror?.(new Event("error"));
                    return;
                }
                this.result = file.__dataUrl ?? "data:image/png;base64,BASE";
                this.onload?.(new Event("load"));
            }
        }

        class MockImage {
            static nextDimensions = { width: 100, height: 100 };
            naturalWidth = MockImage.nextDimensions.width;
            naturalHeight = MockImage.nextDimensions.height;
            onload: ((event: Event) => void) | null = null;
            onerror: ((event: Event) => void) | null = null;

            set src(value: string) {
                if (value.includes("error")) {
                    this.onerror?.(new Event("error"));
                } else {
                    this.onload?.(new Event("load"));
                }
            }
        }

        beforeEach(() => {
            globalThis.window = {} as Window & typeof globalThis;
            globalThis.document = {
                createElement: (tag: string) => {
                    if (tag === "canvas") return canvas;
                    return null;
                },
            } as Document;
            globalThis.Image = MockImage as unknown as typeof Image;
            globalThis.FileReader =
                MockFileReader as unknown as typeof FileReader;
            MockFileReader.shouldError = false;
        });

        afterEach(() => {
            globalThis.document = originalDocument;
            globalThis.Image = originalImage;
            globalThis.FileReader = originalFileReader;
            globalThis.window = originalWindow;
        });

        test("readFileAsDataURL resolves base64 data URL", async () => {
            const file = {
                type: "image/png",
                size: 10,
                __dataUrl: "data:image/png;base64,ORIGINAL",
            } as unknown as File;
            const result = await readFileAsDataURL(file);
            expect(result).toBe("data:image/png;base64,ORIGINAL");
        });

        test("readFileAsDataURL rejects on read error", async () => {
            MockFileReader.shouldError = true;
            const file = {
                type: "image/png",
                size: 10,
            } as unknown as File;
            await expect(readFileAsDataURL(file)).rejects.toThrow(
                "Failed to read file",
            );
        });

        test("loadImage resolves with image element", async () => {
            MockImage.nextDimensions = { width: 320, height: 240 };
            const img = await loadImage("data:image/png;base64,BASE");
            expect(img.naturalWidth).toBe(320);
            expect(img.naturalHeight).toBe(240);
        });

        test("loadImage rejects on error", async () => {
            await expect(
                loadImage("data:image/png;base64,error"),
            ).rejects.toThrow("Failed to load image");
        });

        test("compressImage returns base64 without data prefix", () => {
            const img = new Image();
            const base64 = compressImage(img, 100, 100, 0.8, "image/png");
            expect(base64).toBe("COMPRESSED");
        });

        test("compressImage throws when canvas context missing", () => {
            const originalCreateElement = globalThis.document.createElement;
            globalThis.document.createElement = () =>
                ({
                    getContext: () => null,
                }) as unknown as HTMLCanvasElement;

            const img = new Image();
            expect(() =>
                compressImage(img, 100, 100, 0.8, "image/png"),
            ).toThrow("Failed to get canvas context");

            globalThis.document.createElement = originalCreateElement;
        });

        test("generateThumbnail returns a jpeg data URL", async () => {
            MockImage.nextDimensions = { width: 800, height: 600 };
            const thumb = await generateThumbnail("data:image/png;base64,BASE");
            expect(thumb.startsWith("data:image/jpeg;base64,")).toBe(true);
        });

        test("processImage returns original when compression not needed", async () => {
            MockImage.nextDimensions = { width: 500, height: 300 };
            const file = {
                type: "image/png",
                size: 1000,
                __dataUrl: "data:image/png;base64,ORIGINAL",
            } as unknown as File;
            const result = await processImage(file, {
                maxWidth: 2048,
                maxHeight: 2048,
                maxSizeBytes: 4 * 1024 * 1024,
            });
            expect(result.data).toBe("ORIGINAL");
            expect(result.mimeType).toBe("image/png");
            expect(result.width).toBe(500);
            expect(result.height).toBe(300);
            expect(result.size).toBe(1000);
        });

        test("processImage compresses large images", async () => {
            MockImage.nextDimensions = { width: 4000, height: 2000 };
            const file = {
                type: "image/png",
                size: 10 * 1024 * 1024,
                __dataUrl: "data:image/png;base64,ORIGINAL",
            } as unknown as File;
            const result = await processImage(file);
            expect(result.data).toBe("COMPRESSED");
            expect(result.mimeType).toBe("image/png");
            expect(result.width).toBe(2048);
        });

        test("processImage rejects when file exceeds maxInputBytes", async () => {
            const file = {
                type: "image/png",
                size: 26 * 1024 * 1024,
            } as unknown as File;

            await expect(processImage(file)).rejects.toThrow(
                "Image exceeds maximum file size",
            );
        });

        test("processImage rejects unsupported types", async () => {
            const file = {
                type: "application/pdf",
                size: 100,
                __dataUrl: "data:application/pdf;base64,BASE",
            } as unknown as File;
            await expect(processImage(file)).rejects.toThrow(
                "Unsupported image type",
            );
        });
    });
});
