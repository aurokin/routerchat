// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ConfirmDialog } from "../ConfirmDialog";

describe("ConfirmDialog", () => {
    it("renders nothing when closed", () => {
        const { container } = render(
            <ConfirmDialog
                open={false}
                title="Delete?"
                onConfirm={() => {}}
                onCancel={() => {}}
            />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("renders the title and description when open", () => {
        render(
            <ConfirmDialog
                open
                title="Delete chat?"
                description="This action cannot be undone."
                onConfirm={() => {}}
                onCancel={() => {}}
            />,
        );
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: "Delete chat?" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("This action cannot be undone."),
        ).toBeInTheDocument();
    });

    it("invokes onConfirm and onCancel when buttons are clicked", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <ConfirmDialog
                open
                title="Sure?"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(onConfirm).toHaveBeenCalledOnce();
        expect(onCancel).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("uses custom button labels", () => {
        render(
            <ConfirmDialog
                open
                title="Sure?"
                confirmLabel="Yes, delete"
                cancelLabel="Keep"
                onConfirm={() => {}}
                onCancel={() => {}}
            />,
        );
        expect(
            screen.getByRole("button", { name: "Yes, delete" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Keep" }),
        ).toBeInTheDocument();
    });

    it("calls onCancel on Escape and onConfirm on Enter", async () => {
        const user = userEvent.setup();
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <ConfirmDialog
                open
                title="Sure?"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );

        await user.keyboard("{Escape}");
        expect(onCancel).toHaveBeenCalledOnce();

        await user.keyboard("{Enter}");
        expect(onConfirm).toHaveBeenCalledOnce();
    });
});
