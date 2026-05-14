// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AttachmentPreview } from "../AttachmentPreview";
import type { PendingAttachment } from "@/lib/types";

const stubAttachment = (
    overrides: Partial<PendingAttachment> = {},
): PendingAttachment => ({
    id: "att-1",
    type: "image",
    mimeType: "image/png",
    data: "data:image/png;base64,fake",
    width: 100,
    height: 100,
    size: 2048,
    preview: "data:image/png;base64,preview",
    ...overrides,
});

describe("AttachmentPreview", () => {
    it("renders nothing when there are no attachments and no processing", () => {
        const { container } = render(
            <AttachmentPreview
                attachments={[]}
                processingCount={0}
                onRemove={() => {}}
            />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("renders processing placeholders", () => {
        render(
            <AttachmentPreview
                attachments={[]}
                processingCount={2}
                onRemove={() => {}}
            />,
        );
        expect(screen.getAllByText("Processing...")).toHaveLength(2);
    });

    it("renders an attachment with formatted size", () => {
        render(
            <AttachmentPreview
                attachments={[stubAttachment({ size: 5 * 1024 * 1024 })]}
                processingCount={0}
                onRemove={() => {}}
            />,
        );
        expect(screen.getByText("5.0 MB")).toBeInTheDocument();
        expect(screen.getByAltText("Attachment preview")).toHaveAttribute(
            "src",
            "data:image/png;base64,preview",
        );
    });

    it("renders a PDF attachment without an image preview", () => {
        render(
            <AttachmentPreview
                attachments={[
                    stubAttachment({
                        type: "file",
                        mimeType: "application/pdf",
                        filename: "report.pdf",
                        preview: "",
                    }),
                ]}
                processingCount={0}
                onRemove={() => {}}
            />,
        );

        expect(screen.getByText("PDF")).toBeInTheDocument();
        expect(screen.getByText("report.pdf")).toBeInTheDocument();
        expect(screen.queryByAltText("Attachment preview")).toBeNull();
    });

    it("calls onRemove with the attachment id when the X is clicked", async () => {
        const user = userEvent.setup();
        const onRemove = vi.fn();
        render(
            <AttachmentPreview
                attachments={[stubAttachment({ id: "abc" })]}
                processingCount={0}
                onRemove={onRemove}
            />,
        );
        await user.click(
            screen.getByRole("button", { name: "Remove attachment" }),
        );
        expect(onRemove).toHaveBeenCalledExactlyOnceWith("abc");
    });

    it("hides the remove button when disabled", () => {
        render(
            <AttachmentPreview
                attachments={[stubAttachment()]}
                processingCount={0}
                onRemove={() => {}}
                disabled
            />,
        );
        expect(
            screen.queryByRole("button", { name: "Remove attachment" }),
        ).not.toBeInTheDocument();
    });
});
