import { describe, expect, test } from "bun:test";
import {
    getStorageUsageBarClass,
    getStorageUsageWarning,
    getStorageUsagePercent,
} from "@/components/sync/StorageUsageMeter";
import type { QuotaStatus } from "@/lib/sync/types";

const baseStatus: QuotaStatus = {
    used: 0,
    limit: 100,
    percentage: 0,
    isWarning80: false,
    isWarning95: false,
    isExceeded: false,
};

describe("getStorageUsageBarClass", () => {
    test("returns error class when exceeded", () => {
        const status: QuotaStatus = {
            ...baseStatus,
            isWarning80: true,
            isWarning95: true,
            isExceeded: true,
        };

        expect(getStorageUsageBarClass(status)).toBe("bg-error");
    });

    test("returns error class when at 95% warning", () => {
        const status: QuotaStatus = {
            ...baseStatus,
            isWarning95: true,
        };

        expect(getStorageUsageBarClass(status)).toBe("bg-error");
    });

    test("returns warning class when at 80% warning", () => {
        const status: QuotaStatus = {
            ...baseStatus,
            isWarning80: true,
        };

        expect(getStorageUsageBarClass(status)).toBe("bg-warning");
    });

    test("returns primary class when normal", () => {
        expect(getStorageUsageBarClass(baseStatus)).toBe("bg-primary");
    });
});

describe("getStorageUsageWarning", () => {
    test("returns critical warning when 95% warning is set", () => {
        const status: QuotaStatus = {
            ...baseStatus,
            isWarning95: true,
        };

        expect(getStorageUsageWarning(status)).toBe(
            "Storage almost full. You may not be able to add more images soon. Consider deleting old conversations or clearing images.",
        );
    });

    test("returns warning when 80% warning is set", () => {
        const status: QuotaStatus = {
            ...baseStatus,
            isWarning80: true,
        };

        expect(getStorageUsageWarning(status)).toBe(
            "Storage usage is high. Consider removing old conversations.",
        );
    });

    test("returns null when no warning", () => {
        expect(getStorageUsageWarning(baseStatus)).toBeNull();
    });
});

describe("getStorageUsagePercent", () => {
    test("converts percentage to percent", () => {
        const status: QuotaStatus = { ...baseStatus, percentage: 0.5 };
        expect(getStorageUsagePercent(status)).toBe(50);
    });

    test("caps percent at 100", () => {
        const status: QuotaStatus = { ...baseStatus, percentage: 1.2 };
        expect(getStorageUsagePercent(status)).toBe(100);
    });
});
