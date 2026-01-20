import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

describe("Input", () => {
  describe("User interactions", () => {
    it("updates value when user types", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Input placeholder="Type here" onChange={handleChange} />);

      await user.type(screen.getByPlaceholderText("Type here"), "Hello");

      expect(handleChange).toHaveBeenCalled();
      expect(screen.getByPlaceholderText("Type here")).toHaveValue("Hello");
    });

    it("supports multiline textarea variant", async () => {
      const user = userEvent.setup();

      render(<Input variant="textarea" placeholder="Description" />);

      const textarea = screen.getByPlaceholderText("Description");
      await user.type(textarea, "Multi\nline");

      expect(textarea.tagName).toBe("TEXTAREA");
      expect(textarea).toHaveValue("Multi\nline");
    });

    it("is focusable with keyboard", async () => {
      const user = userEvent.setup();
      render(<Input placeholder="Focus me" />);

      await user.tab();
      expect(screen.getByPlaceholderText("Focus me")).toHaveFocus();
    });
  });

  describe("Variants", () => {
    it("renders search variant with icon", () => {
      render(<Input variant="search" placeholder="Search..." />);

      const container = screen.getByPlaceholderText("Search...").closest("[data-variant='search']");
      expect(container?.querySelector("svg")).toBeInTheDocument();
    });

    it("renders with label", () => {
      render(<Input label="Email Address" placeholder="you@example.com" />);
      expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    });
  });

  describe("Error state", () => {
    it("displays error message with aria-invalid", () => {
      render(<Input error="This field is required" placeholder="Required" />);

      expect(screen.getByRole("alert")).toHaveTextContent("This field is required");
      expect(screen.getByPlaceholderText("Required")).toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("Disabled state", () => {
    it("is not editable when disabled", () => {
      render(<Input disabled placeholder="Disabled" />);

      const input = screen.getByPlaceholderText("Disabled");
      expect(input).toBeDisabled();
      expect(input).toHaveStyle({ cursor: "not-allowed" });
    });
  });

  describe("Adornments", () => {
    it("renders start and end adornments", () => {
      render(
        <Input
          startAdornment={<span data-testid="start">$</span>}
          endAdornment={<span data-testid="end">.00</span>}
          placeholder="Amount"
        />
      );

      expect(screen.getByTestId("start")).toBeInTheDocument();
      expect(screen.getByTestId("end")).toBeInTheDocument();
    });
  });

  describe("Props", () => {
    it("forwards ref to input element", () => {
      const ref = vi.fn();
      render(<Input ref={ref} placeholder="Test" />);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLInputElement);
    });

    it("forwards ref to textarea element", () => {
      const ref = vi.fn();
      render(<Input variant="textarea" ref={ref} placeholder="Test" />);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLTextAreaElement);
    });
  });
});
