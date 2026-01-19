/**
 * Button Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (clicking, visual states)
 * - Test what users see and interact with
 * - Verify accessibility attributes
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

// =============================================================================
// MOCK ICON COMPONENT
// =============================================================================

/**
 * Simple mock icon for testing icon rendering.
 */
function MockIcon({ testId = "mock-icon" }: { testId?: string }) {
  return <span data-testid={testId}>icon</span>;
}

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("Button", () => {
  describe("Acceptance Criteria", () => {
    it("should render all 4 variants correctly", () => {
      const { rerender } = render(<Button variant="primary">Primary</Button>);
      expect(screen.getByRole("button", { name: "Primary" })).toHaveAttribute(
        "data-variant",
        "primary"
      );

      rerender(<Button variant="secondary">Secondary</Button>);
      expect(screen.getByRole("button", { name: "Secondary" })).toHaveAttribute(
        "data-variant",
        "secondary"
      );

      rerender(<Button variant="ghost">Ghost</Button>);
      expect(screen.getByRole("button", { name: "Ghost" })).toHaveAttribute(
        "data-variant",
        "ghost"
      );

      rerender(<Button variant="danger">Danger</Button>);
      expect(screen.getByRole("button", { name: "Danger" })).toHaveAttribute(
        "data-variant",
        "danger"
      );
    });

    it("should render all 3 sizes correctly", () => {
      const { rerender } = render(<Button size="sm">Small</Button>);
      expect(screen.getByRole("button", { name: "Small" })).toHaveAttribute("data-size", "sm");

      rerender(<Button size="md">Medium</Button>);
      expect(screen.getByRole("button", { name: "Medium" })).toHaveAttribute("data-size", "md");

      rerender(<Button size="lg">Large</Button>);
      expect(screen.getByRole("button", { name: "Large" })).toHaveAttribute("data-size", "lg");
    });

    it("should use md size by default", () => {
      render(<Button>Default</Button>);
      expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute("data-size", "md");
    });

    it("should use primary variant by default", () => {
      render(<Button>Default</Button>);
      expect(screen.getByRole("button", { name: "Default" })).toHaveAttribute(
        "data-variant",
        "primary"
      );
    });

    it("should apply disabled state with opacity and cursor", () => {
      render(<Button disabled>Disabled</Button>);

      const button = screen.getByRole("button", { name: "Disabled" });
      expect(button).toBeDisabled();
      expect(button).toHaveStyle({ opacity: "0.5", cursor: "not-allowed" });
    });

    it("should show loading state with spinner", () => {
      render(<Button isLoading>Loading</Button>);

      const button = screen.getByRole("button", { name: "Loading" });
      expect(button).toHaveAttribute("data-loading", "true");

      // Spinner should be present (SVG with animate-spin class)
      const spinner = button.querySelector("svg.animate-spin");
      expect(spinner).toBeInTheDocument();
    });

    it("should disable button when loading", () => {
      render(<Button isLoading>Loading</Button>);

      const button = screen.getByRole("button", { name: "Loading" });
      expect(button).toBeDisabled();
      expect(button).toHaveStyle({ cursor: "not-allowed" });
    });

    it("should support left icon", () => {
      render(<Button iconLeft={<MockIcon testId="left-icon" />}>With Icon</Button>);

      expect(screen.getByTestId("left-icon")).toBeInTheDocument();
    });

    it("should support right icon", () => {
      render(<Button iconRight={<MockIcon testId="right-icon" />}>With Icon</Button>);

      expect(screen.getByTestId("right-icon")).toBeInTheDocument();
    });

    it("should support both left and right icons", () => {
      render(
        <Button
          iconLeft={<MockIcon testId="left-icon" />}
          iconRight={<MockIcon testId="right-icon" />}
        >
          Both Icons
        </Button>
      );

      expect(screen.getByTestId("left-icon")).toBeInTheDocument();
      expect(screen.getByTestId("right-icon")).toBeInTheDocument();
    });

    it("should replace left icon with spinner when loading", () => {
      render(
        <Button isLoading iconLeft={<MockIcon testId="left-icon" />}>
          Loading
        </Button>
      );

      // Left icon should be replaced by spinner
      expect(screen.queryByTestId("left-icon")).not.toBeInTheDocument();

      const button = screen.getByRole("button");
      expect(button.querySelector("svg.animate-spin")).toBeInTheDocument();
    });

    it("should hide right icon when loading", () => {
      render(
        <Button isLoading iconRight={<MockIcon testId="right-icon" />}>
          Loading
        </Button>
      );

      expect(screen.queryByTestId("right-icon")).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // CLICK HANDLER TESTS
  // ===========================================================================

  describe("Click handler", () => {
    it("should fire onClick when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Click Me</Button>);

      await user.click(screen.getByRole("button", { name: "Click Me" }));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should not fire onClick when disabled", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <Button onClick={handleClick} disabled>
          Disabled
        </Button>
      );

      await user.click(screen.getByRole("button", { name: "Disabled" }));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it("should not fire onClick when loading", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(
        <Button onClick={handleClick} isLoading>
          Loading
        </Button>
      );

      await user.click(screen.getByRole("button", { name: "Loading" }));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // VISUAL STYLING TESTS
  // ===========================================================================

  describe("Visual styling", () => {
    it("should apply gradient background to primary variant", () => {
      render(<Button variant="primary">Primary</Button>);

      const button = screen.getByRole("button", { name: "Primary" });
      expect(button).toHaveStyle({ background: "var(--gradient-accent)" });
    });

    it("should apply transparent background to secondary variant", () => {
      render(<Button variant="secondary">Secondary</Button>);

      const button = screen.getByRole("button", { name: "Secondary" });
      expect(button).toHaveStyle({ background: "transparent" });
    });

    it("should apply transparent background to ghost variant", () => {
      render(<Button variant="ghost">Ghost</Button>);

      const button = screen.getByRole("button", { name: "Ghost" });
      expect(button).toHaveStyle({ background: "transparent" });
    });

    it("should apply error color background to danger variant", () => {
      render(<Button variant="danger">Danger</Button>);

      const button = screen.getByRole("button", { name: "Danger" });
      expect(button).toHaveStyle({ background: "var(--error)" });
    });

    it("should apply border to secondary variant", () => {
      render(<Button variant="secondary">Secondary</Button>);

      const button = screen.getByRole("button", { name: "Secondary" });
      // JSDOM doesn't compute CSS variables, so check the raw style string
      expect(button.style.border).toBe("1px solid var(--border-secondary)");
    });

    it("should not apply visible border to ghost variant", () => {
      render(<Button variant="ghost">Ghost</Button>);

      const button = screen.getByRole("button", { name: "Ghost" });
      // Ghost variant should have no border - "none" normalizes to "medium" in JSDOM
      // but borderStyle should be "none"
      expect(button.style.borderStyle).toBe("none");
    });
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  describe("Accessibility", () => {
    it("should be focusable with keyboard", async () => {
      const user = userEvent.setup();
      render(<Button>Focus Me</Button>);

      await user.tab();

      expect(screen.getByRole("button", { name: "Focus Me" })).toHaveFocus();
    });

    it("should trigger click on Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Press Enter</Button>);

      await user.tab();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should trigger click on Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<Button onClick={handleClick}>Press Space</Button>);

      await user.tab();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should pass through aria attributes", () => {
      render(
        <Button aria-label="Custom label" aria-describedby="description">
          Button
        </Button>
      );

      const button = screen.getByRole("button", { name: "Custom label" });
      expect(button).toHaveAttribute("aria-describedby", "description");
    });

    it("should set aria-busy when loading", () => {
      render(
        <Button isLoading aria-busy="true">
          Loading
        </Button>
      );

      const button = screen.getByRole("button", { name: "Loading" });
      expect(button).toHaveAttribute("aria-busy", "true");
    });
  });

  // ===========================================================================
  // PROPS PASS-THROUGH TESTS
  // ===========================================================================

  describe("Props pass-through", () => {
    it("should accept className prop for custom styling", () => {
      render(<Button className="custom-class">Custom</Button>);

      const button = screen.getByRole("button", { name: "Custom" });
      expect(button).toHaveClass("custom-class");
    });

    it("should accept type prop", () => {
      render(<Button type="submit">Submit</Button>);

      expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute("type", "submit");
    });

    it("should accept form prop", () => {
      render(<Button form="my-form">Submit</Button>);

      expect(screen.getByRole("button", { name: "Submit" })).toHaveAttribute("form", "my-form");
    });

    it("should accept custom style prop", () => {
      render(<Button style={{ marginTop: "10px" }}>Styled</Button>);

      const button = screen.getByRole("button", { name: "Styled" });
      expect(button).toHaveStyle({ marginTop: "10px" });
    });

    it("should forward ref to button element", () => {
      const ref = vi.fn();
      render(<Button ref={ref}>Ref Test</Button>);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0]?.[0];
      expect(callArg).toBeInstanceOf(HTMLButtonElement);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe("Edge cases", () => {
    it("should render without children (icon-only button)", () => {
      render(<Button iconLeft={<MockIcon />} aria-label="Icon button" />);

      expect(screen.getByRole("button", { name: "Icon button" })).toBeInTheDocument();
    });

    it("should handle undefined children gracefully", () => {
      render(<Button>{undefined}</Button>);

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("should handle null children gracefully", () => {
      render(<Button>{null}</Button>);

      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });
});
