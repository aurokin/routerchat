// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SearchToggle } from "../SearchToggle";

const trigger = () => screen.getByTitle("Search level");

describe("SearchToggle", () => {
    it("renders the current selection label", () => {
        render(<SearchToggle value="medium" onChange={() => {}} />);
        expect(trigger()).toHaveTextContent("Medium");
    });

    it("opens the dropdown and emits onChange when an option is picked", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<SearchToggle value="none" onChange={onChange} />);

        await user.click(trigger());
        await user.click(screen.getByRole("button", { name: /high/i }));

        expect(onChange).toHaveBeenCalledExactlyOnceWith("high");
    });

    it("closes the dropdown after selection", async () => {
        const user = userEvent.setup();
        render(<SearchToggle value="none" onChange={() => {}} />);

        await user.click(trigger());
        expect(
            screen.getByRole("button", { name: /high/i }),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /high/i }));

        expect(
            screen.queryByRole("button", { name: /high/i }),
        ).not.toBeInTheDocument();
    });

    it("does not open when disabled", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<SearchToggle value="none" onChange={onChange} disabled />);

        await user.click(trigger());
        expect(
            screen.queryByRole("button", { name: /high/i }),
        ).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
