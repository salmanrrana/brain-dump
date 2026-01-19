/**
 * Checkbox Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (clicking, focusing, label interactions)
 * - Verify accessibility attributes work correctly
 * - Test visual states through data attributes
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "./Checkbox";

// =============================================================================
// RENDERING TESTS
// =============================================================================

describe("Checkbox", () => {
  describe("Rendering", () => {
    it("should render unchecked by default", () => {
      render(<Checkbox />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).not.toBeChecked();
      expect(screen.queryByTestId("checkbox-check-icon")).not.toBeInTheDocument();
    });

    it("should render checked when checked prop is true", () => {
      render(<Checkbox checked />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toBeChecked();
      expect(screen.getByTestId("checkbox-check-icon")).toBeInTheDocument();
    });

    it("should render indeterminate state", () => {
      render(<Checkbox indeterminate />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toHaveAttribute("aria-checked", "mixed");
      expect(screen.getByTestId("checkbox-indeterminate-icon")).toBeInTheDocument();
      expect(screen.queryByTestId("checkbox-check-icon")).not.toBeInTheDocument();
    });

    it("should prioritize indeterminate over checked visually", () => {
      // When both checked and indeterminate are true, show indeterminate icon
      render(<Checkbox checked indeterminate />);

      expect(screen.getByTestId("checkbox-indeterminate-icon")).toBeInTheDocument();
      expect(screen.queryByTestId("checkbox-check-icon")).not.toBeInTheDocument();
    });

    it("should render with label", () => {
      render(<Checkbox label="Accept terms" />);

      expect(screen.getByTestId("checkbox-label")).toHaveTextContent("Accept terms");
    });

    it("should not render label when not provided", () => {
      render(<Checkbox />);

      expect(screen.queryByTestId("checkbox-label")).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  describe("Accessibility", () => {
    it("should have type checkbox", () => {
      render(<Checkbox />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toHaveAttribute("type", "checkbox");
    });

    it("should associate label with input via htmlFor", () => {
      render(<Checkbox label="Test label" />);

      const input = screen.getByTestId("checkbox-input");
      const container = screen.getByTestId("checkbox-container");

      expect(container).toHaveAttribute("for", input.id);
    });

    it("should accept custom id", () => {
      render(<Checkbox id="custom-checkbox" label="Test" />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toHaveAttribute("id", "custom-checkbox");
    });

    it("should set aria-checked to mixed for indeterminate", () => {
      render(<Checkbox indeterminate />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toHaveAttribute("aria-checked", "mixed");
    });

    it("should set aria-checked to true when checked", () => {
      render(<Checkbox checked />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toHaveAttribute("aria-checked", "true");
    });

    it("should set aria-checked to false when unchecked", () => {
      render(<Checkbox checked={false} />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toHaveAttribute("aria-checked", "false");
    });

    it("should hide visual from screen readers", () => {
      render(<Checkbox />);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual).toHaveAttribute("aria-hidden", "true");
    });
  });

  // ===========================================================================
  // INTERACTION TESTS
  // ===========================================================================

  describe("Interactions", () => {
    it("should call onChange when clicked", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.click(input);

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("should call onChange with false when unchecking", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={true} onChange={onChange} />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.click(input);

      expect(onChange).toHaveBeenCalledWith(false);
    });

    it("should be clickable via label", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} label="Click me" />);

      const label = screen.getByTestId("checkbox-label");
      fireEvent.click(label);

      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("should not call onChange when disabled", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} disabled />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.click(input);

      // Note: The native input is disabled, so onChange won't fire
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // DISABLED STATE TESTS
  // ===========================================================================

  describe("Disabled State", () => {
    it("should set disabled attribute on input", () => {
      render(<Checkbox disabled />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toBeDisabled();
    });

    it("should have reduced opacity when disabled", () => {
      render(<Checkbox disabled />);

      const container = screen.getByTestId("checkbox-container");
      expect(container.style.opacity).toBe("0.5");
    });

    it("should have not-allowed cursor when disabled", () => {
      render(<Checkbox disabled />);

      const container = screen.getByTestId("checkbox-container");
      expect(container.style.cursor).toBe("not-allowed");
    });
  });

  // ===========================================================================
  // FOCUS STATE TESTS
  // ===========================================================================

  describe("Focus State", () => {
    it("should show focus ring when focused", () => {
      render(<Checkbox />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.focus(input);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual.style.boxShadow).toContain("var(--accent-muted)");
    });

    it("should hide focus ring when blurred", () => {
      render(<Checkbox />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.focus(input);
      fireEvent.blur(input);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual.style.boxShadow).toBe("none");
    });

    it("should call onFocus callback when provided", () => {
      const onFocus = vi.fn();
      render(<Checkbox onFocus={onFocus} />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.focus(input);

      expect(onFocus).toHaveBeenCalledTimes(1);
    });

    it("should call onBlur callback when provided", () => {
      const onBlur = vi.fn();
      render(<Checkbox onBlur={onBlur} />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(onBlur).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // VISUAL STATE TESTS
  // ===========================================================================

  describe("Visual States", () => {
    it("should have accent background when checked", () => {
      render(<Checkbox checked />);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual.style.backgroundColor).toBe("var(--accent-primary)");
    });

    it("should have transparent background when unchecked", () => {
      render(<Checkbox checked={false} />);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual.style.backgroundColor).toBe("transparent");
    });

    it("should have accent background when indeterminate", () => {
      render(<Checkbox indeterminate />);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual.style.backgroundColor).toBe("var(--accent-primary)");
    });

    it("should have accent border when checked", () => {
      render(<Checkbox checked />);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual.style.border).toContain("var(--accent-primary)");
    });

    it("should have secondary border when unchecked", () => {
      render(<Checkbox checked={false} />);

      const visual = screen.getByTestId("checkbox-visual");
      expect(visual.style.border).toContain("var(--border-secondary)");
    });
  });

  // ===========================================================================
  // CUSTOM PROPS TESTS
  // ===========================================================================

  describe("Custom Props", () => {
    it("should accept custom className", () => {
      render(<Checkbox className="custom-class" />);

      const container = screen.getByTestId("checkbox-container");
      expect(container).toHaveClass("custom-class");
    });

    it("should forward ref to input element", () => {
      const ref = vi.fn();
      render(<Checkbox ref={ref} />);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLInputElement);
    });

    it("should pass through additional input props", () => {
      render(<Checkbox name="terms" aria-label="Accept terms" />);

      const input = screen.getByTestId("checkbox-input");
      expect(input).toHaveAttribute("name", "terms");
      expect(input).toHaveAttribute("aria-label", "Accept terms");
    });
  });

  // ===========================================================================
  // INTEGRATION TESTS
  // ===========================================================================

  describe("Integration", () => {
    it("should work as a controlled component", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} label="Toggle me" />);

      const input = screen.getByTestId("checkbox-input");
      fireEvent.click(input);

      expect(onChange).toHaveBeenCalledWith(true);
    });
  });
});
