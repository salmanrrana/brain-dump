import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./Select";

const defaultOptions: SelectOption<string>[] = [
  { value: "opt1", label: "Option 1" },
  { value: "opt2", label: "Option 2" },
  { value: "opt3", label: "Option 3" },
];

describe("Select", () => {
  describe("User interactions", () => {
    it("opens dropdown on click and shows options", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Option 1")).toBeInTheDocument();
      expect(screen.getByText("Option 2")).toBeInTheDocument();
    });

    it("selects option on click and closes dropdown", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Select options={defaultOptions} value={null} onChange={handleChange} />);

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("Option 2"));

      expect(handleChange).toHaveBeenCalledWith("opt2");
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    });

    it("displays selected value in trigger", () => {
      render(<Select options={defaultOptions} value="opt2" onChange={() => {}} />);
      expect(screen.getByRole("combobox")).toHaveTextContent("Option 2");
    });

    it("closes on Escape key", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{Escape}");

      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    });

    it("closes on click outside", async () => {
      const user = userEvent.setup();

      render(
        <div>
          <Select options={defaultOptions} value={null} onChange={() => {}} />
          <button data-testid="outside">Outside</button>
        </div>
      );

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByTestId("outside"));

      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    });
  });

  describe("Keyboard navigation", () => {
    it("navigates with arrow keys and selects with Enter", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Select options={defaultOptions} value={null} onChange={handleChange} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      expect(handleChange).toHaveBeenCalledWith("opt2");
    });

    it("opens with Enter key when focused", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      screen.getByRole("combobox").focus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("Search functionality", () => {
    it("filters options when searchable", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByTestId("select-search"), "Option 1");

      const dropdown = screen.getByTestId("select-dropdown");
      expect(within(dropdown).getByText("Option 1")).toBeInTheDocument();
      expect(within(dropdown).queryByText("Option 2")).not.toBeInTheDocument();
    });

    it("shows no results message when search has no matches", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByTestId("select-search"), "xyz");

      expect(screen.getByText("No options found")).toBeInTheDocument();
    });

    it("focuses search input when dropdown opens", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));

      await waitFor(() => {
        expect(screen.getByTestId("select-search")).toHaveFocus();
      });
    });
  });

  describe("Disabled state", () => {
    it("does not open when disabled", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} disabled />);

      await user.click(screen.getByRole("combobox"));

      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByRole("combobox")).toBeDisabled();
    });
  });

  describe("Error state", () => {
    it("shows error message", () => {
      render(<Select options={defaultOptions} value={null} onChange={() => {}} error="Required" />);

      expect(screen.getByRole("alert")).toHaveTextContent("Required");
      expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA attributes", async () => {
      const user = userEvent.setup();

      render(
        <Select label="Choose option" options={defaultOptions} value="opt2" onChange={() => {}} />
      );

      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
      expect(trigger).toHaveAttribute("aria-labelledby");

      await user.click(trigger);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(3);
      expect(screen.getByTestId("select-option-1")).toHaveAttribute("aria-selected", "true");
    });
  });
});
