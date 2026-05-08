/**
 * Quota Management Tests
 *
 * Tests for storage quota enforcement and auto-purge functionality.
 */

import { describe, it, expect } from "bun:test";
import {
    calculateQuotaStatus,
    formatBytes,
    formatQuotaStatus,
} from "@/lib/sync/quota";
import {
    CLOUD_IMAGE_QUOTA,
    LOCAL_IMAGE_QUOTA,
    QUOTA_WARNING_80,
    QUOTA_WARNING_95,
} from "@/lib/sync/types";
import type { QuotaStatus } from "@/lib/sync/types";

describe("Quota Management", () => {
    describe("calculateQuotaStatus", () => {
        it("calculates correct percentage", () => {
            const status = calculateQuotaStatus(500, 1000);
            expect(status.percentage).toBe(0.5);
        });

        it("returns correct used and limit values", () => {
            const status = calculateQuotaStatus(250, 1000);
            expect(status.used).toBe(250);
            expect(status.limit).toBe(1000);
        });

        it("isWarning80 is false when under 80%", () => {
            const status = calculateQuotaStatus(79, 100);
            expect(status.isWarning80).toBe(false);
        });

        it("isWarning80 is true when at 80%", () => {
            const status = calculateQuotaStatus(80, 100);
            expect(status.isWarning80).toBe(true);
        });

        it("isWarning80 is true when over 80%", () => {
            const status = calculateQuotaStatus(85, 100);
            expect(status.isWarning80).toBe(true);
        });

        it("isWarning95 is false when under 95%", () => {
            const status = calculateQuotaStatus(94, 100);
            expect(status.isWarning95).toBe(false);
        });

        it("isWarning95 is true when at 95%", () => {
            const status = calculateQuotaStatus(95, 100);
            expect(status.isWarning95).toBe(true);
        });

        it("isWarning95 is true when over 95%", () => {
            const status = calculateQuotaStatus(98, 100);
            expect(status.isWarning95).toBe(true);
        });

        it("isExceeded is false when under 100%", () => {
            const status = calculateQuotaStatus(99, 100);
            expect(status.isExceeded).toBe(false);
        });

        it("isExceeded is true when at 100%", () => {
            const status = calculateQuotaStatus(100, 100);
            expect(status.isExceeded).toBe(true);
        });

        it("isExceeded is true when over 100%", () => {
            const status = calculateQuotaStatus(150, 100);
            expect(status.isExceeded).toBe(true);
        });

        it("handles zero usage", () => {
            const status = calculateQuotaStatus(0, 1000);
            expect(status.percentage).toBe(0);
            expect(status.isWarning80).toBe(false);
            expect(status.isWarning95).toBe(false);
            expect(status.isExceeded).toBe(false);
        });
    });

    describe("Quota Constants", () => {
        it("CLOUD_IMAGE_QUOTA is 1GB", () => {
            expect(CLOUD_IMAGE_QUOTA).toBe(1 * 1024 * 1024 * 1024);
            expect(CLOUD_IMAGE_QUOTA).toBe(1073741824);
        });

        it("LOCAL_IMAGE_QUOTA is 500MB", () => {
            expect(LOCAL_IMAGE_QUOTA).toBe(500 * 1024 * 1024);
            expect(LOCAL_IMAGE_QUOTA).toBe(524288000);
        });

        it("QUOTA_WARNING_80 is 0.8", () => {
            expect(QUOTA_WARNING_80).toBe(0.8);
        });

        it("QUOTA_WARNING_95 is 0.95", () => {
            expect(QUOTA_WARNING_95).toBe(0.95);
        });
    });

    describe("formatBytes", () => {
        it("formats 0 bytes", () => {
            expect(formatBytes(0)).toBe("0 B");
        });

        it("formats bytes", () => {
            expect(formatBytes(500)).toBe("500 B");
        });

        it("formats kilobytes", () => {
            expect(formatBytes(1024)).toBe("1 KB");
            expect(formatBytes(1536)).toBe("1.5 KB");
        });

        it("formats megabytes", () => {
            expect(formatBytes(1024 * 1024)).toBe("1 MB");
            expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
        });

        it("formats gigabytes", () => {
            expect(formatBytes(1024 * 1024 * 1024)).toBe("1 GB");
            expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
        });
    });

    describe("formatQuotaStatus", () => {
        it("formats empty quota", () => {
            const status: QuotaStatus = {
                used: 0,
                limit: 500 * 1024 * 1024,
                percentage: 0,
                isWarning80: false,
                isWarning95: false,
                isExceeded: false,
            };
            expect(formatQuotaStatus(status)).toBe("0 B / 500 MB (0%)");
        });

        it("formats partial quota", () => {
            const status: QuotaStatus = {
                used: 250 * 1024 * 1024,
                limit: 500 * 1024 * 1024,
                percentage: 0.5,
                isWarning80: false,
                isWarning95: false,
                isExceeded: false,
            };
            expect(formatQuotaStatus(status)).toBe("250 MB / 500 MB (50%)");
        });

        it("formats full quota", () => {
            const status: QuotaStatus = {
                used: 500 * 1024 * 1024,
                limit: 500 * 1024 * 1024,
                percentage: 1,
                isWarning80: true,
                isWarning95: true,
                isExceeded: true,
            };
            expect(formatQuotaStatus(status)).toBe("500 MB / 500 MB (100%)");
        });

        it("formats cloud quota", () => {
            const status: QuotaStatus = {
                used: 512 * 1024 * 1024,
                limit: CLOUD_IMAGE_QUOTA,
                percentage: 512 / 1024,
                isWarning80: false,
                isWarning95: false,
                isExceeded: false,
            };
            expect(formatQuotaStatus(status)).toBe("512 MB / 1 GB (50%)");
        });
    });

    describe("QuotaStatus interface", () => {
        it("has all required fields", () => {
            const status: QuotaStatus = {
                used: 100,
                limit: 1000,
                percentage: 0.1,
                isWarning80: false,
                isWarning95: false,
                isExceeded: false,
            };

            expect(status).toHaveProperty("used");
            expect(status).toHaveProperty("limit");
            expect(status).toHaveProperty("percentage");
            expect(status).toHaveProperty("isWarning80");
            expect(status).toHaveProperty("isWarning95");
            expect(status).toHaveProperty("isExceeded");
        });
    });

    describe("Quota thresholds", () => {
        it("80% threshold triggers first warning", () => {
            const used = LOCAL_IMAGE_QUOTA * 0.8;
            const status = calculateQuotaStatus(used, LOCAL_IMAGE_QUOTA);

            expect(status.isWarning80).toBe(true);
            expect(status.isWarning95).toBe(false);
            expect(status.isExceeded).toBe(false);
        });

        it("95% threshold triggers critical warning", () => {
            const used = LOCAL_IMAGE_QUOTA * 0.95;
            const status = calculateQuotaStatus(used, LOCAL_IMAGE_QUOTA);

            expect(status.isWarning80).toBe(true);
            expect(status.isWarning95).toBe(true);
            expect(status.isExceeded).toBe(false);
        });

        it("100% threshold triggers exceeded", () => {
            const used = LOCAL_IMAGE_QUOTA;
            const status = calculateQuotaStatus(used, LOCAL_IMAGE_QUOTA);

            expect(status.isWarning80).toBe(true);
            expect(status.isWarning95).toBe(true);
            expect(status.isExceeded).toBe(true);
        });

        it("cloud quota has same thresholds", () => {
            const used80 = CLOUD_IMAGE_QUOTA * 0.8;
            const status80 = calculateQuotaStatus(used80, CLOUD_IMAGE_QUOTA);
            expect(status80.isWarning80).toBe(true);

            const used95 = CLOUD_IMAGE_QUOTA * 0.95;
            const status95 = calculateQuotaStatus(used95, CLOUD_IMAGE_QUOTA);
            expect(status95.isWarning95).toBe(true);
        });
    });
});
