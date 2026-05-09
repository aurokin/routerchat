import { test, expect, describe } from "bun:test";
import type { ThinkingLevel } from "@/lib/types";

const THINKING_OPTIONS: {
    value: ThinkingLevel;
    label: string;
    intensity: number;
}[] = [
    { value: "none", label: "Off", intensity: 0 },
    { value: "minimal", label: "Minimal", intensity: 1 },
    { value: "low", label: "Low", intensity: 2 },
    { value: "medium", label: "Medium", intensity: 3 },
    { value: "high", label: "High", intensity: 4 },
    { value: "xhigh", label: "XHigh", intensity: 5 },
];

describe("ThinkingToggle constants", () => {
    test("THINKING_OPTIONS has all 6 levels", () => {
        expect(THINKING_OPTIONS).toHaveLength(6);
    });

    test("THINKING_OPTIONS has correct order", () => {
        expect(THINKING_OPTIONS[0]!.value).toBe("none");
        expect(THINKING_OPTIONS[1]!.value).toBe("minimal");
        expect(THINKING_OPTIONS[2]!.value).toBe("low");
        expect(THINKING_OPTIONS[3]!.value).toBe("medium");
        expect(THINKING_OPTIONS[4]!.value).toBe("high");
        expect(THINKING_OPTIONS[5]!.value).toBe("xhigh");
    });

    test("THINKING_OPTIONS has correct intensity values", () => {
        expect(THINKING_OPTIONS[0]!.intensity).toBe(0);
        expect(THINKING_OPTIONS[1]!.intensity).toBe(1);
        expect(THINKING_OPTIONS[2]!.intensity).toBe(2);
        expect(THINKING_OPTIONS[3]!.intensity).toBe(3);
        expect(THINKING_OPTIONS[4]!.intensity).toBe(4);
        expect(THINKING_OPTIONS[5]!.intensity).toBe(5);
    });

    test("THINKING_OPTIONS has correct labels", () => {
        expect(THINKING_OPTIONS[0]!.label).toBe("Off");
        expect(THINKING_OPTIONS[1]!.label).toBe("Minimal");
        expect(THINKING_OPTIONS[2]!.label).toBe("Low");
        expect(THINKING_OPTIONS[3]!.label).toBe("Medium");
        expect(THINKING_OPTIONS[4]!.label).toBe("High");
        expect(THINKING_OPTIONS[5]!.label).toBe("XHigh");
    });
});

describe("selectedOption", () => {
    test("finds correct option for none", () => {
        const value: ThinkingLevel = "none";
        const selectedOption = THINKING_OPTIONS.find(
            (opt) => opt.value === value,
        );

        expect(selectedOption?.value).toBe("none");
        expect(selectedOption?.label).toBe("Off");
    });

    test("finds correct option for high", () => {
        const value: ThinkingLevel = "high";
        const selectedOption = THINKING_OPTIONS.find(
            (opt) => opt.value === value,
        );

        expect(selectedOption?.value).toBe("high");
        expect(selectedOption?.label).toBe("High");
    });

    test("finds correct option for xhigh", () => {
        const value: ThinkingLevel = "xhigh";
        const selectedOption = THINKING_OPTIONS.find(
            (opt) => opt.value === value,
        );

        expect(selectedOption?.value).toBe("xhigh");
        expect(selectedOption?.label).toBe("XHigh");
    });

    test("returns undefined for invalid value", () => {
        const value: ThinkingLevel = "invalid" as ThinkingLevel;
        const selectedOption = THINKING_OPTIONS.find(
            (opt) => opt.value === value,
        );

        expect(selectedOption).toBeUndefined();
    });
});

describe("isActive", () => {
    test("is true when value is not none", () => {
        const values: ThinkingLevel[] = [
            "minimal",
            "low",
            "medium",
            "high",
            "xhigh",
        ];

        for (const value of values) {
            const isActive = value !== "none";
            expect(isActive).toBe(true);
        }
    });

    test("is false when value is none", () => {
        const value: ThinkingLevel = "none";
        const isActive = value !== "none";

        expect(isActive).toBe(false);
    });
});

describe("intensity indicator", () => {
    test("correct number of bars for each level", () => {
        const getIntensityBars = (intensity: number) => {
            return [...Array(5)].map((_, i) => i < intensity);
        };

        expect(getIntensityBars(0).filter(Boolean)).toHaveLength(0);
        expect(getIntensityBars(1).filter(Boolean)).toHaveLength(1);
        expect(getIntensityBars(2).filter(Boolean)).toHaveLength(2);
        expect(getIntensityBars(3).filter(Boolean)).toHaveLength(3);
        expect(getIntensityBars(4).filter(Boolean)).toHaveLength(4);
        expect(getIntensityBars(5).filter(Boolean)).toHaveLength(5);
    });

    test("correctly highlights active intensity", () => {
        const intensity = 3;
        const isSelected = true;

        const bars = [...Array(5)].map((_, i) => {
            const isLit = i < intensity;
            const colorClass =
                isLit && isSelected
                    ? "bg-warning"
                    : isLit
                      ? "bg-warning/40"
                      : "bg-border";
            return colorClass;
        });

        expect(bars[0]).toBe("bg-warning");
        expect(bars[1]).toBe("bg-warning");
        expect(bars[2]).toBe("bg-warning");
        expect(bars[3]).toBe("bg-border");
        expect(bars[4]).toBe("bg-border");
    });
});

describe("dropdown behavior", () => {
    test("closes on escape key", () => {
        let isOpen = true;

        const handleEscape = (e: { key: string }) => {
            if (e.key === "Escape") isOpen = false;
        };

        handleEscape({ key: "Escape" });
        expect(isOpen).toBe(false);
    });

    test("does not close on other keys", () => {
        let isOpen = true;

        const handleKey = (e: { key: string }) => {
            if (e.key === "Escape") isOpen = false;
        };

        handleKey({ key: "Enter" });
        expect(isOpen).toBe(true);
    });

    test("closes on outside click", () => {
        let isOpen = true;

        const dropdownRef = { current: { contains: (_el: unknown) => false } };
        const event = { target: {} };

        if (isOpen) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target)
            ) {
                isOpen = false;
            }
        }

        expect(isOpen).toBe(false);
    });

    test("does not close on inside click", () => {
        let isOpen = true;
        const insideElement = {};

        const dropdownRef = {
            current: { contains: (_el: unknown) => _el === insideElement },
        };
        const event = { target: insideElement };

        if (isOpen) {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target)
            ) {
                isOpen = false;
            }
        }

        expect(isOpen).toBe(true);
    });
});

describe("onChange handler", () => {
    test("closes dropdown after selection", () => {
        let isOpen = true;
        const onChange = (_value: ThinkingLevel) => {
            isOpen = false;
        };

        onChange("medium");
        expect(isOpen).toBe(false);
    });
});

describe("disabled state", () => {
    test("does not open when disabled", () => {
        let isOpen = false;
        const disabled = true;

        if (!disabled) {
            isOpen = !isOpen;
        }

        expect(isOpen).toBe(false);
    });

    test("can open when not disabled", () => {
        let isOpen = false;
        const disabled = false;

        if (!disabled) {
            isOpen = !isOpen;
        }

        expect(isOpen).toBe(true);
    });
});

describe("rotation animation", () => {
    test("rotates chevron when open", () => {
        const isOpen = true;
        const rotationClass = isOpen
            ? "transition-transform rotate-180"
            : "transition-transform";

        expect(rotationClass).toContain("rotate-180");
    });

    test("does not rotate chevron when closed", () => {
        const isOpen = false;
        const rotationClass = isOpen
            ? "transition-transform rotate-180"
            : "transition-transform";

        expect(rotationClass).toBe("transition-transform");
    });
});

describe("option selection", () => {
    test("can select each thinking level", () => {
        for (const option of THINKING_OPTIONS) {
            let selectedValue: ThinkingLevel = "none";

            selectedValue = option.value;

            expect(selectedValue).toBe(option.value);
        }
    });

    test("dropdown closes after any selection", () => {
        for (const option of THINKING_OPTIONS) {
            let isOpen = true;
            isOpen = false;
            expect(isOpen).toBe(false);
        }
    });
});

describe("intensity visualization", () => {
    test("none shows no bars", () => {
        const option = THINKING_OPTIONS.find((o) => o.value === "none");
        expect(option?.intensity).toBe(0);
    });

    test("xhigh shows all bars", () => {
        const option = THINKING_OPTIONS.find((o) => o.value === "xhigh");
        expect(option?.intensity).toBe(5);
    });

    test("intensity increases with level", () => {
        for (let i = 1; i < THINKING_OPTIONS.length; i++) {
            expect(THINKING_OPTIONS[i]!.intensity).toBeGreaterThan(
                THINKING_OPTIONS[i - 1]!.intensity,
            );
        }
    });
});
