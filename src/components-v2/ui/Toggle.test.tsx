/**
 * Toggle Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (clicking, toggling)
 * - Test what users see and interact with
 * - Verify accessibility attributes (role="switch", aria-checked)
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("Toggle", () => {
  describe("Acceptance Criteria", () => {
    it("should render as switch/toggle style (not checkbox appearance)", () => {
      render(<Toggle checked={false} onChange={() => {}} />);

      // The visual switch should be a label with specific data attributes
      const toggle = document.querySelector("[data-checked]");
      expect(toggle).toBeInTheDocument();
      expect(toggle?.tagName).toBe("LABEL");
    });

    it("should have gradient fill when ON using accent colors", () => {
      render(<Toggle checked={true} onChange={() => {}} />);

      const toggle = document.querySelector('[data-checked="true"]') as HTMLElement;
      expect(toggle).toBeInTheDocument();
      expect(toggle.style.background).toBe("var(--gradient-accent)");
    });

    it("should have gray fill when OFF", () => {
      render(<Toggle checked={false} onChange={() => {}} />);

      const toggle = document.querySelector('[data-checked="false"]') as HTMLElement;
      expect(toggle).toBeInTheDocument();
      expect(toggle.style.background).toBe("var(--bg-tertiary)");
    });

    it("should have smooth slide animation via transition property", () => {
      render(<Toggle checked={false} onChange={() => {}} />);

      const toggle = document.querySelector("[data-checked]") as HTMLElement;
      expect(toggle.style.transition).toContain("var(--transition-normal)");
    });

    it("should be accessible with role=switch", () => {
      render(<Toggle checked={false} onChange={() => {}} label="Enable feature" />);

      const switchElement = screen.getByRole("switch", { name: "Enable feature" });
      expect(switchElement).toBeInTheDocument();
    });

    it("should have aria-checked matching checked state", () => {
      const { rerender } = render(<Toggle checked={false} onChange={() => {}} />);

      let switchElement = screen.getByRole("switch");
      expect(switchElement).toHaveAttribute("aria-checked", "false");

      rerender(<Toggle checked={true} onChange={() => {}} />);

      switchElement = screen.getByRole("switch");
      expect(switchElement).toHaveAttribute("aria-checked", "true");
    });

    it("should have disabled state with reduced opacity", () => {
      render(<Toggle checked={false} onChange={() => {}} disabled />);

      const toggle = document.querySelector('[data-disabled="true"]') as HTMLElement;
      expect(toggle).toBeInTheDocument();
      expect(toggle.style.opacity).toBe("0.5");
      expect(toggle.style.cursor).toBe("not-allowed");
    });

    it("should disable the underlying input when disabled", () => {
      render(<Toggle checked={false} onChange={() => {}} disabled />);

      const switchElement = screen.getByRole("switch");
      expect(switchElement).toBeDisabled();
    });
  });

  // ===========================================================================
  // CLICK BEHAVIOR TESTS
  // ===========================================================================

  describe("Click toggles state", () => {
    it("should call onChange with true when clicking unchecked toggle", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} />);

      const switchElement = screen.getByRole("switch");
      await user.click(switchElement);

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it("should call onChange with false when clicking checked toggle", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={true} onChange={handleChange} />);

      const switchElement = screen.getByRole("switch");
      await user.click(switchElement);

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(false);
    });

    it("should toggle when clicking on the label text", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} label="Enable feature" />);

      await user.click(screen.getByText("Enable feature"));

      expect(handleChange).toHaveBeenCalledTimes(1);
      expect(handleChange).toHaveBeenCalledWith(true);
    });
  });

  // ===========================================================================
  // VISUAL INDICATOR TESTS
  // ===========================================================================

  describe("Visual indicator matches state", () => {
    it("should show thumb on left when unchecked", () => {
      render(<Toggle checked={false} onChange={() => {}} />);

      const thumb = document.querySelector('[data-checked="false"] span') as HTMLElement;
      expect(thumb.style.transform).toBe("translateX(0)");
    });

    it("should show thumb on right when checked", () => {
      render(<Toggle checked={true} onChange={() => {}} />);

      const thumb = document.querySelector('[data-checked="true"] span') as HTMLElement;
      expect(thumb.style.transform).toContain("translateX");
      expect(thumb.style.transform).not.toBe("translateX(0)");
    });

    it("should have white thumb when checked", () => {
      render(<Toggle checked={true} onChange={() => {}} />);

      const thumb = document.querySelector('[data-checked="true"] span') as HTMLElement;
      expect(thumb.style.background).toBe("rgb(255, 255, 255)");
    });

    it("should have gray thumb when unchecked", () => {
      render(<Toggle checked={false} onChange={() => {}} />);

      const thumb = document.querySelector('[data-checked="false"] span') as HTMLElement;
      expect(thumb.style.background).toBe("var(--text-secondary)");
    });
  });

  // ===========================================================================
  // DISABLED STATE TESTS
  // ===========================================================================

  describe("Disabled prevents toggle", () => {
    it("should not call onChange when clicking disabled toggle", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} disabled />);

      const switchElement = screen.getByRole("switch");
      await user.click(switchElement);

      expect(handleChange).not.toHaveBeenCalled();
    });

    it("should not call onChange when clicking disabled label", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} disabled label="Disabled toggle" />);

      await user.click(screen.getByText("Disabled toggle"));

      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // SIZE TESTS
  // ===========================================================================

  describe("Sizes", () => {
    it("should render small size correctly", () => {
      render(<Toggle checked={false} onChange={() => {}} size="sm" />);

      const toggle = document.querySelector('[data-size="sm"]') as HTMLElement;
      expect(toggle).toBeInTheDocument();
      expect(toggle.style.width).toBe("36px");
      expect(toggle.style.height).toBe("20px");
    });

    it("should render medium size by default", () => {
      render(<Toggle checked={false} onChange={() => {}} />);

      const toggle = document.querySelector('[data-size="md"]') as HTMLElement;
      expect(toggle).toBeInTheDocument();
      expect(toggle.style.width).toBe("44px");
      expect(toggle.style.height).toBe("24px");
    });

    it("should render large size correctly", () => {
      render(<Toggle checked={false} onChange={() => {}} size="lg" />);

      const toggle = document.querySelector('[data-size="lg"]') as HTMLElement;
      expect(toggle).toBeInTheDocument();
      expect(toggle.style.width).toBe("52px");
      expect(toggle.style.height).toBe("28px");
    });
  });

  // ===========================================================================
  // LABEL TESTS
  // ===========================================================================

  describe("Label", () => {
    it("should render label to the right by default", () => {
      const { container } = render(
        <Toggle checked={false} onChange={() => {}} label="Enable feature" />
      );

      // The container should have the toggle first, then the label
      const flexContainer = container.firstChild as HTMLElement;
      expect(flexContainer.style.flexDirection).toBe("row");
    });

    it("should render label to the left when labelPosition is left", () => {
      const { container } = render(
        <Toggle checked={false} onChange={() => {}} label="Enable feature" labelPosition="left" />
      );

      const flexContainer = container.firstChild as HTMLElement;
      expect(flexContainer.style.flexDirection).toBe("row-reverse");
    });

    it("should associate label with input for accessibility", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} label="Click me" />);

      // Clicking the label text should toggle the switch
      await user.click(screen.getByText("Click me"));

      expect(handleChange).toHaveBeenCalledWith(true);
    });
  });

  // ===========================================================================
  // KEYBOARD ACCESSIBILITY TESTS
  // ===========================================================================

  describe("Keyboard navigation", () => {
    it("should be focusable with Tab", async () => {
      const user = userEvent.setup();
      render(<Toggle checked={false} onChange={() => {}} />);

      await user.tab();

      expect(screen.getByRole("switch")).toHaveFocus();
    });

    it("should toggle with Space key", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} />);

      await user.tab();
      await user.keyboard(" ");

      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it("should toggle with Enter key", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} />);

      await user.tab();
      await user.keyboard("{Enter}");

      expect(handleChange).toHaveBeenCalledWith(true);
    });

    it("should not toggle with keyboard when disabled", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Toggle checked={false} onChange={handleChange} disabled />);

      await user.tab();
      await user.keyboard(" ");

      expect(handleChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // PROPS PASS-THROUGH TESTS
  // ===========================================================================

  describe("Props pass-through", () => {
    it("should accept className prop", () => {
      const { container } = render(
        <Toggle checked={false} onChange={() => {}} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("should accept custom id prop", () => {
      render(<Toggle checked={false} onChange={() => {}} id="my-toggle" />);

      expect(screen.getByRole("switch")).toHaveAttribute("id", "my-toggle");
    });

    it("should accept aria-label when no label prop", () => {
      render(<Toggle checked={false} onChange={() => {}} aria-label="Dark mode toggle" />);

      expect(screen.getByRole("switch", { name: "Dark mode toggle" })).toBeInTheDocument();
    });

    it("should forward ref to input element", () => {
      const ref = vi.fn();
      render(<Toggle checked={false} onChange={() => {}} ref={ref} />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0]?.[0];
      expect(callArg).toBeInstanceOf(HTMLInputElement);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe("Edge cases", () => {
    it("should handle undefined onChange gracefully", async () => {
      const user = userEvent.setup();

      // Should not throw when onChange is undefined
      render(<Toggle checked={false} />);

      const switchElement = screen.getByRole("switch");
      await expect(user.click(switchElement)).resolves.not.toThrow();
    });

    it("should default checked to false", () => {
      render(<Toggle onChange={() => {}} />);

      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    });

    it("should work with controlled component pattern", async () => {
      const user = userEvent.setup();
      let currentChecked = false;
      const handleChange = vi.fn((newChecked: boolean) => {
        currentChecked = newChecked;
      });

      const { rerender } = render(<Toggle checked={currentChecked} onChange={handleChange} />);

      await user.click(screen.getByRole("switch"));
      expect(handleChange).toHaveBeenCalledWith(true);

      // Simulate controlled update
      rerender(<Toggle checked={true} onChange={handleChange} />);
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    });
  });
});
