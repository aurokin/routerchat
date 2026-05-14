import { describe, test, expect } from "vitest";
import {
    isClipboardSupported,
    hasImageInClipboardEvent,
    readImageFromClipboardEvent,
    readClipboardImage,
    hasClipboardImage,
    parseImageUrlFromClipboardEvent,
} from "@/lib/clipboard";

function makeTextPasteEvent(text: string): ClipboardEvent {
    return {
        clipboardData: {
            getData: (type: string) => (type === "text/plain" ? text : ""),
        },
    } as unknown as ClipboardEvent;
}

describe("clipboard", () => {
    describe("isClipboardSupported", () => {
        test("isClipboardSupported returns false when navigator is undefined", () => {
            // In test environment without browser APIs
            const originalNavigator = global.navigator;
            // @ts-ignore
            delete global.navigator;

            expect(isClipboardSupported()).toBe(false);

            // @ts-ignore
            global.navigator = originalNavigator;
        });

        test("isClipboardSupported returns true with clipboard read", () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => [],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            expect(isClipboardSupported()).toBe(true);

            // @ts-ignore
            global.navigator = originalNavigator;
        });
    });

    describe("hasImageInClipboardEvent", () => {
        test("hasImageInClipboardEvent returns true when image present", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "image/png" }, { type: "text/plain" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(true);
        });

        test("hasImageInClipboardEvent returns false when no image", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "text/plain" }, { type: "text/html" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(false);
        });

        test("hasImageInClipboardEvent returns false when clipboardData is null", () => {
            const mockEvent = {
                clipboardData: null,
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(false);
        });

        test("hasImageInClipboardEvent returns false when items is empty", () => {
            const mockEvent = {
                clipboardData: {
                    items: [],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(false);
        });

        test("hasImageInClipboardEvent detects JPEG", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "image/jpeg" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(true);
        });

        test("hasImageInClipboardEvent detects WebP", () => {
            const mockEvent = {
                clipboardData: {
                    items: [{ type: "image/webp" }],
                },
            } as unknown as ClipboardEvent;

            expect(hasImageInClipboardEvent(mockEvent)).toBe(true);
        });
    });

    describe("readImageFromClipboardEvent", () => {
        test("readImageFromClipboardEvent returns image when present", () => {
            const mockBlob = new Blob(["test"], { type: "image/png" });
            const mockEvent = {
                clipboardData: {
                    items: [
                        {
                            type: "image/png",
                            getAsFile: () => mockBlob,
                        },
                    ],
                },
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);

            expect(result).not.toBeNull();
            expect(result?.blob).toBe(mockBlob);
            expect(result?.mimeType).toBe("image/png");
        });

        test("readImageFromClipboardEvent returns null when no image", () => {
            const mockEvent = {
                clipboardData: {
                    items: [
                        {
                            type: "text/plain",
                            getAsFile: () => null,
                        },
                    ],
                },
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);
            expect(result).toBeNull();
        });

        test("readImageFromClipboardEvent returns null when clipboardData is null", () => {
            const mockEvent = {
                clipboardData: null,
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);
            expect(result).toBeNull();
        });

        test("readImageFromClipboardEvent returns null when getAsFile returns null", () => {
            const mockEvent = {
                clipboardData: {
                    items: [
                        {
                            type: "image/png",
                            getAsFile: () => null,
                        },
                    ],
                },
            } as unknown as ClipboardEvent;

            const result = readImageFromClipboardEvent(mockEvent);
            expect(result).toBeNull();
        });
    });

    describe("readClipboardImage", () => {
        test("returns image from clipboard API", async () => {
            const originalNavigator = global.navigator;
            const blob = new Blob(["data"], { type: "image/png" });
            const mockNavigator = {
                clipboard: {
                    read: async () => [
                        {
                            types: ["text/plain", "image/png"],
                            getType: async () => blob,
                        },
                    ],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await readClipboardImage();
            expect(result?.mimeType).toBe("image/png");
            expect(result?.blob).toBe(blob);

            // @ts-ignore
            global.navigator = originalNavigator;
        });

        test("returns null when clipboard API fails", async () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => {
                        throw new Error("denied");
                    },
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await readClipboardImage();
            expect(result).toBeNull();

            // @ts-ignore
            global.navigator = originalNavigator;
        });
    });

    describe("parseImageUrlFromClipboardEvent", () => {
        test("matches https URL ending in .png", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("https://example.com/cat.png"),
            );
            expect(result).toEqual({
                url: "https://example.com/cat.png",
                mimeType: "image/png",
            });
        });

        test("matches jpg → image/jpeg", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("https://example.com/cat.jpg"),
            );
            expect(result?.mimeType).toBe("image/jpeg");
        });

        test("matches jpeg → image/jpeg", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("https://example.com/cat.JPEG"),
            );
            expect(result?.mimeType).toBe("image/jpeg");
        });

        test("rejects svg URLs because attachment storage does not support them", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("https://example.com/logo.svg"),
            );
            expect(result).toBeNull();
        });

        test("matches webp", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("https://example.com/pic.webp"),
            );
            expect(result?.mimeType).toBe("image/webp");
        });

        test("matches gif and bmp", () => {
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("https://example.com/a.gif"),
                )?.mimeType,
            ).toBe("image/gif");
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("https://example.com/a.bmp"),
                )?.mimeType,
            ).toBe("image/bmp");
        });

        test("allows trailing query string", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("https://example.com/cat.png?v=1&w=200"),
            );
            expect(result).toEqual({
                url: "https://example.com/cat.png?v=1&w=200",
                mimeType: "image/png",
            });
        });

        test("trims surrounding whitespace", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("   https://example.com/cat.png  "),
            );
            expect(result?.url).toBe("https://example.com/cat.png");
        });

        test("accepts http URLs", () => {
            const result = parseImageUrlFromClipboardEvent(
                makeTextPasteEvent("http://example.com/cat.png"),
            );
            expect(result?.url).toBe("http://example.com/cat.png");
        });

        test("rejects non-http(s) protocols", () => {
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("file:///etc/passwd.png"),
                ),
            ).toBeNull();
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("javascript:alert(1)//.png"),
                ),
            ).toBeNull();
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent(
                        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg.png",
                    ),
                ),
            ).toBeNull();
        });

        test("rejects URLs without an image extension", () => {
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("https://example.com/page"),
                ),
            ).toBeNull();
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("https://example.com/file.pdf"),
                ),
            ).toBeNull();
        });

        test("rejects multi-line text", () => {
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent(
                        "https://example.com/a.png\nhttps://example.com/b.png",
                    ),
                ),
            ).toBeNull();
        });

        test("rejects URLs longer than 2048 chars", () => {
            const longUrl = "https://example.com/" + "a".repeat(2050) + ".png";
            expect(
                parseImageUrlFromClipboardEvent(makeTextPasteEvent(longUrl)),
            ).toBeNull();
        });

        test("rejects when image extension is only in query string", () => {
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent(
                        "https://cdn.example.com/img?file=cat.png",
                    ),
                ),
            ).toBeNull();
        });

        test("rejects when image extension is only in fragment", () => {
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("https://example.com/page#cat.png"),
                ),
            ).toBeNull();
        });

        test("rejects malformed URLs", () => {
            expect(
                parseImageUrlFromClipboardEvent(
                    makeTextPasteEvent("not a url.png"),
                ),
            ).toBeNull();
            expect(
                parseImageUrlFromClipboardEvent(makeTextPasteEvent("")),
            ).toBeNull();
        });

        test("rejects when clipboardData is missing", () => {
            const result = parseImageUrlFromClipboardEvent({
                clipboardData: null,
            } as unknown as ClipboardEvent);
            expect(result).toBeNull();
        });
    });

    describe("hasClipboardImage", () => {
        test("returns true when clipboard contains image", async () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => [
                        {
                            types: ["image/jpeg"],
                        },
                    ],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await hasClipboardImage();
            expect(result).toBe(true);

            // @ts-ignore
            global.navigator = originalNavigator;
        });

        test("returns false when no image type", async () => {
            const originalNavigator = global.navigator;
            const mockNavigator = {
                clipboard: {
                    read: async () => [
                        {
                            types: ["text/plain"],
                        },
                    ],
                },
            } as unknown as Navigator;
            // @ts-ignore
            global.navigator = mockNavigator;

            const result = await hasClipboardImage();
            expect(result).toBe(false);

            // @ts-ignore
            global.navigator = originalNavigator;
        });
    });
});
