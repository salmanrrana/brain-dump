import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  describe("Rendering", () => {
    it("renders unchecked by default", () => {
      render(<Checkbox />);
      expect(screen.getByTestId("checkbox-input")).not.toBeChecked();
    });

    it("renders checked when checked prop is true", () => {
      render(<Checkbox checked />);
      expect(screen.getByTestId("checkbox-input")).toBeChecked();
    });

    it("renders indeterminate state with mixed aria-checked", () => {
      render(<Checkbox indeterminate />);
      expect(screen.getByTestId("checkbox-input")).toHaveAttribute("aria-checked", "mixed");
      expect(screen.getByTestId("checkbox-indeterminate-icon")).toBeInTheDocument();
    });

    it("renders with label", () => {
      render(<Checkbox label="Accept terms" />);
      expect(screen.getByTestId("checkbox-label")).toHaveTextContent("Accept terms");
    });
  });

  describe("Interactions", () => {
    it("calls onChange when clicked", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} />);

      fireEvent.click(screen.getByTestId("checkbox-input"));

      expect(onChange).toHaveBeenCalledWith(true);
    });

    it("calls onChange with false when unchecking", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={true} onChange={onChange} />);

      fireEvent.click(screen.getByTestId("checkbox-input"));

      expect(onChange).toHaveBeenCalledWith(false);
    });

    it("is clickable via label", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} label="Click me" />);

      fireEvent.click(screen.getByTestId("checkbox-label"));

      expect(onChange).toHaveBeenCalled();
    });

    it("does not call onChange when disabled", () => {
      const onChange = vi.fn();
      render(<Checkbox checked={false} onChange={onChange} disabled />);

      fireEvent.click(screen.getByTestId("checkbox-input"));

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("has type checkbox", () => {
      render(<Checkbox />);
      expect(screen.getByTestId("checkbox-input")).toHaveAttribute("type", "checkbox");
    });

    it("associates label with input via htmlFor", () => {
      render(<Checkbox label="Test label" />);

      const input = screen.getByTestId("checkbox-input");
      const container = screen.getByTestId("checkbox-container");

      expect(container).toHaveAttribute("for", input.id);
    });

    it("sets correct aria-checked values", () => {
      const { rerender } = render(<Checkbox checked={false} />);
      expect(screen.getByTestId("checkbox-input")).toHaveAttribute("aria-checked", "false");

      rerender(<Checkbox checked={true} />);
      expect(screen.getByTestId("checkbox-input")).toHaveAttribute("aria-checked", "true");

      rerender(<Checkbox indeterminate />);
      expect(screen.getByTestId("checkbox-input")).toHaveAttribute("aria-checked", "mixed");
    });
  });

  describe("Props", () => {
    it("forwards ref to input element", () => {
      const ref = vi.fn();
      render(<Checkbox ref={ref} />);

      expect(ref).toHaveBeenCalled();
      expect(ref.mock.calls[0]?.[0]).toBeInstanceOf(HTMLInputElement);
    });

    it("accepts custom className", () => {
      render(<Checkbox className="custom-class" />);
      expect(screen.getByTestId("checkbox-container")).toHaveClass("custom-class");
    });
  });
});
