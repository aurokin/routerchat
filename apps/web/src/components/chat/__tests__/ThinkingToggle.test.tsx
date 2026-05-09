// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThinkingToggle } from "../ThinkingToggle";

const trigger = () => screen.getByTitle("Thinking level");

describe("ThinkingToggle", () => {
    it("renders the current selection label", () => {
        render(<ThinkingToggle value="high" onChange={() => {}} />);
        expect(trigger()).toHaveTextContent("High");
    });

    it("emits onChange when an option is picked", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<ThinkingToggle value="none" onChange={onChange} />);

        await user.click(trigger());
        await user.click(screen.getByRole("button", { name: /minimal/i }));

        expect(onChange).toHaveBeenCalledExactlyOnceWith("minimal");
    });

    it("does not open when disabled", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<ThinkingToggle value="none" onChange={onChange} disabled />);

        await user.click(trigger());
        expect(
            screen.queryByRole("button", { name: /minimal/i }),
        ).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
