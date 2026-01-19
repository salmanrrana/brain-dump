/**
 * Input Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (typing, focus, visual states)
 * - Test what users see and interact with
 * - Verify accessibility attributes
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("Input", () => {
  describe("Acceptance Criteria", () => {
    it("should render text input variant (default)", () => {
      render(<Input placeholder="Enter text" />);

      const input = screen.getByPlaceholderText("Enter text");
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe("INPUT");
    });

    it("should render search input variant with icon", () => {
      render(<Input variant="search" placeholder="Search..." />);

      const input = screen.getByPlaceholderText("Search...");
      expect(input).toBeInTheDocument();

      // Search icon should be present
      const container = input.closest("[data-variant='search']");
      expect(container).toBeInTheDocument();

      // SVG search icon should be in the document
      const svg = container?.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should render textarea variant (multiline)", () => {
      render(<Input variant="textarea" placeholder="Enter description" />);

      const textarea = screen.getByPlaceholderText("Enter description");
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe("TEXTAREA");
      expect(textarea).toHaveAttribute("data-variant", "textarea");
    });

    it("should show error state with red border", () => {
      render(<Input error="This field is required" placeholder="Enter text" />);

      const container = screen.getByPlaceholderText("Enter text").closest("[data-error='true']");
      expect(container).toBeInTheDocument();
    });

    it("should display error message", () => {
      render(<Input error="This field is required" />);

      expect(screen.getByRole("alert")).toHaveTextContent("This field is required");
    });

    it("should show disabled state", () => {
      render(<Input disabled placeholder="Disabled" />);

      const input = screen.getByPlaceholderText("Disabled");
      expect(input).toBeDisabled();
    });

    it("should render with label", () => {
      render(<Input label="Email Address" placeholder="you@example.com" />);

      const input = screen.getByLabelText("Email Address");
      expect(input).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // VALUE CHANGE TESTS
  // ===========================================================================

  describe("Value changes on input", () => {
    it("should update value when user types in text input", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Input placeholder="Type here" onChange={handleChange} />);

      const input = screen.getByPlaceholderText("Type here");
      await user.type(input, "Hello");

      expect(handleChange).toHaveBeenCalled();
      expect(input).toHaveValue("Hello");
    });

    it("should update value when user types in search input", async () => {
      const user = userEvent.setup();

      render(<Input variant="search" placeholder="Search" />);

      const input = screen.getByPlaceholderText("Search");
      await user.type(input, "tickets");

      expect(input).toHaveValue("tickets");
    });

    it("should update value when user types in textarea", async () => {
      const user = userEvent.setup();

      render(<Input variant="textarea" placeholder="Description" />);

      const textarea = screen.getByPlaceholderText("Description");
      await user.type(textarea, "Multi\nline\ntext");

      expect(textarea).toHaveValue("Multi\nline\ntext");
    });

    it("should support controlled value", () => {
      const { rerender } = render(<Input value="initial" onChange={() => {}} />);

      const input = screen.getByDisplayValue("initial");
      expect(input).toBeInTheDocument();

      rerender(<Input value="updated" onChange={() => {}} />);
      expect(input).toHaveValue("updated");
    });
  });

  // ===========================================================================
  // ERROR STATE TESTS
  // ===========================================================================

  describe("Error state displays", () => {
    it("should show error message below text input", () => {
      render(<Input error="Invalid email format" placeholder="Email" />);

      const error = screen.getByRole("alert");
      expect(error).toHaveTextContent("Invalid email format");
    });

    it("should show error message below textarea", () => {
      render(<Input variant="textarea" error="Description is required" />);

      const error = screen.getByRole("alert");
      expect(error).toHaveTextContent("Description is required");
    });

    it("should set aria-invalid when error is present", () => {
      render(<Input error="Error" placeholder="Input" />);

      const input = screen.getByPlaceholderText("Input");
      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("should link error message with aria-describedby", () => {
      render(<Input error="Error message" id="test-input" />);

      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("aria-describedby", "test-input-error");

      const error = screen.getByRole("alert");
      expect(error).toHaveAttribute("id", "test-input-error");
    });

    it("should not show error indicator when no error", () => {
      render(<Input placeholder="No error" />);

      const input = screen.getByPlaceholderText("No error");
      expect(input.closest("[data-error='true']")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // FOCUS TESTS
  // ===========================================================================

  describe("Focus ring visible", () => {
    it("should be focusable with keyboard", async () => {
      const user = userEvent.setup();
      render(<Input placeholder="Focus me" />);

      await user.tab();

      const input = screen.getByPlaceholderText("Focus me");
      expect(input).toHaveFocus();
    });

    it("should apply focus styles to container (text/search)", async () => {
      const user = userEvent.setup();
      render(<Input placeholder="Text input" />);

      const input = screen.getByPlaceholderText("Text input");
      await user.click(input);

      // Container should have focus-within class applied
      const container = input.closest("[data-variant]");
      expect(container).toHaveClass("focus-within:border-[var(--accent-primary)]");
    });

    it("should apply focus styles to textarea", async () => {
      const user = userEvent.setup();
      render(<Input variant="textarea" placeholder="Textarea" />);

      const textarea = screen.getByPlaceholderText("Textarea");
      await user.click(textarea);

      expect(textarea).toHaveFocus();
      expect(textarea).toHaveClass("focus:border-[var(--accent-primary)]");
    });

    it("should not be focusable when disabled", () => {
      render(<Input disabled placeholder="Disabled" />);

      const input = screen.getByPlaceholderText("Disabled");
      expect(input).toBeDisabled();
      // Disabled inputs are not in the tab order
      expect(input).toHaveAttribute("disabled");
    });
  });

  // ===========================================================================
  // VISUAL STYLING TESTS
  // ===========================================================================

  describe("Visual styling", () => {
    it("should apply disabled opacity", () => {
      render(<Input disabled placeholder="Disabled" />);

      const input = screen.getByPlaceholderText("Disabled");
      const container = input.closest("[data-variant]");
      expect(container).toHaveStyle({ opacity: "0.5" });
    });

    it("should apply not-allowed cursor when disabled", () => {
      render(<Input disabled placeholder="Disabled" />);

      const input = screen.getByPlaceholderText("Disabled");
      expect(input).toHaveStyle({ cursor: "not-allowed" });
    });
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  describe("Accessibility", () => {
    it("should associate label with input via htmlFor", () => {
      render(<Input label="Username" id="username" />);

      const input = screen.getByLabelText("Username");
      expect(input).toHaveAttribute("id", "username");
    });

    it("should generate unique id when not provided", () => {
      render(<Input label="Field 1" />);

      const input = screen.getByLabelText("Field 1");
      expect(input).toHaveAttribute("id");
      expect(input.id).not.toBe("");
    });

    it("should pass through aria attributes", () => {
      render(
        <Input aria-label="Custom label" aria-describedby="description" placeholder="Input" />
      );

      const input = screen.getByPlaceholderText("Input");
      expect(input).toHaveAttribute("aria-label", "Custom label");
      // aria-describedby may be overridden by error, but when no error it passes through
    });
  });

  // ===========================================================================
  // PROPS PASS-THROUGH TESTS
  // ===========================================================================

  describe("Props pass-through", () => {
    it("should accept className prop", () => {
      render(<Input className="custom-class" placeholder="Input" />);

      const input = screen.getByPlaceholderText("Input");
      const container = input.closest("[data-variant]");
      expect(container).toHaveClass("custom-class");
    });

    it("should accept style prop", () => {
      render(<Input style={{ maxWidth: "200px" }} placeholder="Input" />);

      const input = screen.getByPlaceholderText("Input");
      const container = input.closest("[data-variant]");
      expect(container).toHaveStyle({ maxWidth: "200px" });
    });

    it("should accept name prop", () => {
      render(<Input name="email" placeholder="Email" />);

      const input = screen.getByPlaceholderText("Email");
      expect(input).toHaveAttribute("name", "email");
    });

    it("should accept autoComplete prop", () => {
      render(<Input autoComplete="email" placeholder="Email" />);

      const input = screen.getByPlaceholderText("Email");
      expect(input).toHaveAttribute("autocomplete", "email");
    });

    it("should accept required prop", () => {
      render(<Input required placeholder="Required" />);

      const input = screen.getByPlaceholderText("Required");
      expect(input).toBeRequired();
    });

    it("should accept maxLength prop", () => {
      render(<Input maxLength={100} placeholder="Limited" />);

      const input = screen.getByPlaceholderText("Limited");
      expect(input).toHaveAttribute("maxLength", "100");
    });

    it("should accept rows prop for textarea", () => {
      render(<Input variant="textarea" rows={6} placeholder="Textarea" />);

      const textarea = screen.getByPlaceholderText("Textarea");
      expect(textarea).toHaveAttribute("rows", "6");
    });

    it("should forward ref to input element", () => {
      const ref = vi.fn();
      render(<Input ref={ref} placeholder="Ref test" />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0]?.[0];
      expect(callArg).toBeInstanceOf(HTMLInputElement);
    });

    it("should forward ref to textarea element", () => {
      const ref = vi.fn();
      render(<Input variant="textarea" ref={ref} placeholder="Ref test" />);

      expect(ref).toHaveBeenCalled();
      const callArg = ref.mock.calls[0]?.[0];
      expect(callArg).toBeInstanceOf(HTMLTextAreaElement);
    });
  });

  // ===========================================================================
  // ADORNMENT TESTS
  // ===========================================================================

  describe("Adornments", () => {
    it("should render start adornment for text input", () => {
      render(<Input startAdornment={<span data-testid="start">$</span>} placeholder="Amount" />);

      expect(screen.getByTestId("start")).toBeInTheDocument();
    });

    it("should render end adornment for text input", () => {
      render(<Input endAdornment={<span data-testid="end">.00</span>} placeholder="Amount" />);

      expect(screen.getByTestId("end")).toBeInTheDocument();
    });

    it("should override start adornment with search icon for search variant", () => {
      render(
        <Input
          variant="search"
          startAdornment={<span data-testid="custom">X</span>}
          placeholder="Search"
        />
      );

      // Custom adornment should be replaced by search icon
      expect(screen.queryByTestId("custom")).not.toBeInTheDocument();

      // Search icon should be present
      const input = screen.getByPlaceholderText("Search");
      const container = input.closest("[data-variant='search']");
      expect(container?.querySelector("svg")).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe("Edge cases", () => {
    it("should handle empty placeholder", () => {
      render(<Input placeholder="" data-testid="empty-placeholder" />);

      const input = screen.getByTestId("empty-placeholder");
      expect(input).toBeInTheDocument();
    });

    it("should handle switching between controlled and uncontrolled", () => {
      const { rerender } = render(<Input placeholder="Input" />);

      const input = screen.getByPlaceholderText("Input") as HTMLInputElement;
      expect(input.value).toBe("");

      rerender(<Input placeholder="Input" value="controlled" onChange={() => {}} />);
      expect(input.value).toBe("controlled");
    });
  });
});
