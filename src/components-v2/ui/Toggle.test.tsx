import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  describe("User interactions", () => {
    it("calls onChange with true when clicking unchecked toggle", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} />);

      await user.click(screen.getByRole("switch"));

      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it("calls onChange with false when clicking checked toggle", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={true} onChange={handleChange} />);

      await user.click(screen.getByRole("switch"));

      expect(handleChange).toHaveBeenCalledWith(false);
    });

    it("toggles when clicking on label text", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} label="Enable feature" />);

      await user.click(screen.getByText("Enable feature"));

      expect(handleChange).toHaveBeenCalledWith(true);
    });
  });

  describe("Disabled state", () => {
    it("does not call onChange when disabled", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} disabled />);

      await user.click(screen.getByRole("switch"));

      expect(handleChange).not.toHaveBeenCalled();
    });

    it("disables the underlying input", () => {
      render(<Toggle checked={false} onChange={() => {}} disabled />);
      expect(screen.getByRole("switch")).toBeDisabled();
    });
  });

  describe("Keyboard navigation", () => {
    it("is focusable with Tab", async () => {
      const user = userEvent.setup();
      render(<Toggle checked={false} onChange={() => {}} />);

      await user.tab();

      expect(screen.getByRole("switch")).toHaveFocus();
    });

    it("toggles with Space key", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} />);

      await user.tab();
      await user.keyboard(" ");

      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it("toggles with Enter key", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} />);

      await user.tab();
      await user.keyboard("{Enter}");

      expect(handleChange).toHaveBeenCalledWith(true);
    });
  });

  describe("Accessibility", () => {
    it("has role=switch with proper aria-checked", () => {
      const { rerender } = render(<Toggle checked={false} onChange={() => {}} />);

      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");

      rerender(<Toggle checked={true} onChange={() => {}} />);

      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    });

    it("associates label with input for accessibility", () => {
      render(<Toggle checked={false} onChange={() => {}} label="Enable feature" />);
      expect(screen.getByRole("switch", { name: "Enable feature" })).toBeInTheDocument();
    });
  });

  describe("Props", () => {
    it("forwards ref to input element", () => {
      const ref = vi.fn();
      render(<Toggle checked={false} onChange={() => {}} ref={ref} />);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLInputElement);
    });
  });
});
