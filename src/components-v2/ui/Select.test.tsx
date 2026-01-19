/**
 * Select Component Tests
 *
 * Tests follow Kent C. Dodds testing philosophy:
 * - Test user-facing behavior (clicking, typing, keyboard navigation)
 * - Test what users see and interact with
 * - Verify accessibility attributes
 *
 * @see CLAUDE.md for testing guidelines
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./Select";

// =============================================================================
// TEST DATA
// =============================================================================

const defaultOptions: SelectOption<string>[] = [
  { value: "opt1", label: "Option 1" },
  { value: "opt2", label: "Option 2" },
  { value: "opt3", label: "Option 3" },
];

const priorityOptions: SelectOption<string>[] = [
  { value: "high", label: "High Priority" },
  { value: "medium", label: "Medium Priority" },
  { value: "low", label: "Low Priority" },
];

// =============================================================================
// ACCEPTANCE CRITERIA TESTS
// =============================================================================

describe("Select", () => {
  describe("Acceptance Criteria", () => {
    it("should render custom styled dropdown (not native select)", () => {
      render(
        <Select
          options={defaultOptions}
          value={null}
          onChange={() => {}}
          placeholder="Select option"
        />
      );

      // Should have a button trigger, not a native select
      const trigger = screen.getByRole("combobox");
      expect(trigger.tagName).toBe("BUTTON");
      expect(screen.queryByRole("combobox", { name: /select/i })).not.toBeInstanceOf(
        HTMLSelectElement
      );
    });

    it("should display chevron icon on right", () => {
      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      // Check for SVG element (chevron icon)
      const trigger = screen.getByRole("combobox");
      const svg = trigger.querySelector("svg");
      expect(svg).toBeInTheDocument();
    });

    it("should support keyboard navigation with arrow keys", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Select options={defaultOptions} value={null} onChange={handleChange} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      // Navigate down once (starts at index 0, so one press goes to index 1 = "opt2")
      await user.keyboard("{ArrowDown}");

      // Select with Enter
      await user.keyboard("{Enter}");

      expect(handleChange).toHaveBeenCalledWith("opt2");
    });

    it("should close dropdown with Escape key", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");

      await user.keyboard("{Escape}");

      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("should support search/filter within options", async () => {
      const user = userEvent.setup();

      render(<Select options={priorityOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));

      const searchInput = screen.getByTestId("select-search");
      await user.type(searchInput, "high");

      // Only "High Priority" should be visible
      const dropdown = screen.getByTestId("select-dropdown");
      expect(within(dropdown).getByText("High Priority")).toBeInTheDocument();
      expect(within(dropdown).queryByText("Medium Priority")).not.toBeInTheDocument();
      expect(within(dropdown).queryByText("Low Priority")).not.toBeInTheDocument();
    });

    it("should use CSS variables for colors", () => {
      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      // Check that styles use CSS variables
      expect(trigger).toHaveStyle({ backgroundColor: "var(--bg-secondary)" });
    });

    it("should close dropdown when clicking outside", async () => {
      const user = userEvent.setup();

      render(
        <div>
          <Select options={defaultOptions} value={null} onChange={() => {}} />
          <button data-testid="outside-button">Outside</button>
        </div>
      );

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");

      // Click outside
      await user.click(screen.getByTestId("outside-button"));

      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });
  });

  // ===========================================================================
  // OPENS ON CLICK TESTS
  // ===========================================================================

  describe("Opens on click", () => {
    it("should open dropdown when trigger is clicked", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("should show all options when opened", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      const dropdown = screen.getByTestId("select-dropdown");
      expect(within(dropdown).getByText("Option 1")).toBeInTheDocument();
      expect(within(dropdown).getByText("Option 2")).toBeInTheDocument();
      expect(within(dropdown).getByText("Option 3")).toBeInTheDocument();
    });

    it("should toggle dropdown on repeated clicks", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");

      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      await user.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("should open with Enter key", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      trigger.focus();

      await user.keyboard("{Enter}");

      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("should open with Space key", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      trigger.focus();

      await user.keyboard(" ");

      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("should open with ArrowDown key", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      trigger.focus();

      await user.keyboard("{ArrowDown}");

      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
  });

  // ===========================================================================
  // SELECTION CHANGES VALUE TESTS
  // ===========================================================================

  describe("Selection changes value", () => {
    it("should call onChange when option is clicked", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Select options={defaultOptions} value={null} onChange={handleChange} />);

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("Option 2"));

      expect(handleChange).toHaveBeenCalledWith("opt2");
    });

    it("should display selected value in trigger", () => {
      render(<Select options={defaultOptions} value="opt2" onChange={() => {}} />);

      expect(screen.getByRole("combobox")).toHaveTextContent("Option 2");
    });

    it("should close dropdown after selection", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      await user.click(screen.getByText("Option 1"));

      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("should show placeholder when no value selected", () => {
      render(
        <Select
          options={defaultOptions}
          value={null}
          onChange={() => {}}
          placeholder="Choose one..."
        />
      );

      expect(screen.getByRole("combobox")).toHaveTextContent("Choose one...");
    });

    it("should mark selected option visually", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value="opt2" onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      const selectedOption = screen.getByTestId("select-option-1");
      expect(selectedOption).toHaveAttribute("data-selected", "true");
      expect(selectedOption).toHaveAttribute("aria-selected", "true");
    });
  });

  // ===========================================================================
  // KEYBOARD NAVIGATION TESTS
  // ===========================================================================

  describe("Keyboard navigation works", () => {
    it("should navigate down with ArrowDown", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      // First option should be highlighted initially
      expect(screen.getByTestId("select-option-0")).toHaveAttribute("data-highlighted", "true");

      await user.keyboard("{ArrowDown}");

      expect(screen.getByTestId("select-option-0")).not.toHaveAttribute("data-highlighted");
      expect(screen.getByTestId("select-option-1")).toHaveAttribute("data-highlighted", "true");
    });

    it("should navigate up with ArrowUp", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");

      expect(screen.getByTestId("select-option-2")).toHaveAttribute("data-highlighted", "true");

      await user.keyboard("{ArrowUp}");

      expect(screen.getByTestId("select-option-1")).toHaveAttribute("data-highlighted", "true");
    });

    it("should select highlighted option with Enter", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Select options={defaultOptions} value={null} onChange={handleChange} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Enter}");

      expect(handleChange).toHaveBeenCalledWith("opt2");
    });

    it("should jump to first option with Home key", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{Home}");

      expect(screen.getByTestId("select-option-0")).toHaveAttribute("data-highlighted", "true");
    });

    it("should jump to last option with End key", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{End}");

      expect(screen.getByTestId("select-option-2")).toHaveAttribute("data-highlighted", "true");
    });

    it("should not go past first option with ArrowUp", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{ArrowUp}");
      await user.keyboard("{ArrowUp}");

      expect(screen.getByTestId("select-option-0")).toHaveAttribute("data-highlighted", "true");
    });

    it("should not go past last option with ArrowDown", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");
      await user.keyboard("{ArrowDown}");

      expect(screen.getByTestId("select-option-2")).toHaveAttribute("data-highlighted", "true");
    });

    it("should highlight option on mouse hover", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));
      await user.hover(screen.getByTestId("select-option-2"));

      expect(screen.getByTestId("select-option-2")).toHaveAttribute("data-highlighted", "true");
    });
  });

  // ===========================================================================
  // ESCAPE CLOSES DROPDOWN TESTS
  // ===========================================================================

  describe("Escape closes dropdown", () => {
    it("should close dropdown on Escape from trigger", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      await user.keyboard("{Escape}");

      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("should close dropdown on Escape from search input", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));

      await waitFor(() => {
        expect(screen.getByTestId("select-search")).toHaveFocus();
      });

      await user.keyboard("{Escape}");

      expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    });

    it("should return focus to trigger after Escape", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);
      await user.keyboard("{Escape}");

      expect(trigger).toHaveFocus();
    });
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  describe("Accessibility", () => {
    it("should have proper ARIA attributes on trigger", () => {
      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("should have listbox role on dropdown", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("should have option role on each option", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(3);
    });

    it("should associate label with trigger", () => {
      render(
        <Select label="Choose option" options={defaultOptions} value={null} onChange={() => {}} />
      );

      // Label text should be present
      expect(screen.getByText("Choose option")).toBeInTheDocument();

      // Trigger should have aria-labelledby pointing to a label
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("aria-labelledby");
    });

    it("should set aria-invalid when error is present", () => {
      render(
        <Select
          options={defaultOptions}
          value={null}
          onChange={() => {}}
          error="Selection required"
        />
      );

      expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
    });

    it("should display error message", () => {
      render(
        <Select
          options={defaultOptions}
          value={null}
          onChange={() => {}}
          error="Selection required"
        />
      );

      expect(screen.getByRole("alert")).toHaveTextContent("Selection required");
    });
  });

  // ===========================================================================
  // DISABLED STATE TESTS
  // ===========================================================================

  describe("Disabled state", () => {
    it("should not open when disabled", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} disabled />);

      const trigger = screen.getByRole("combobox");
      await user.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("should have disabled attribute", () => {
      render(<Select options={defaultOptions} value={null} onChange={() => {}} disabled />);

      expect(screen.getByRole("combobox")).toBeDisabled();
    });

    it("should apply disabled styles", () => {
      render(<Select options={defaultOptions} value={null} onChange={() => {}} disabled />);

      expect(screen.getByRole("combobox")).toHaveStyle({
        opacity: "0.5",
        cursor: "not-allowed",
      });
    });
  });

  // ===========================================================================
  // SEARCH/FILTER TESTS
  // ===========================================================================

  describe("Search/filter functionality", () => {
    it("should show search input when searchable is true", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));

      expect(screen.getByTestId("select-search")).toBeInTheDocument();
    });

    it("should not show search input when searchable is false", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      expect(screen.queryByTestId("select-search")).not.toBeInTheDocument();
    });

    it("should filter options based on search query", async () => {
      const user = userEvent.setup();

      render(<Select options={priorityOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByTestId("select-search"), "med");

      const dropdown = screen.getByTestId("select-dropdown");
      expect(within(dropdown).getByText("Medium Priority")).toBeInTheDocument();
      expect(within(dropdown).queryByText("High Priority")).not.toBeInTheDocument();
      expect(within(dropdown).queryByText("Low Priority")).not.toBeInTheDocument();
    });

    it("should show 'No options found' when search has no matches", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByTestId("select-search"), "xyz");

      expect(screen.getByText("No options found")).toBeInTheDocument();
    });

    it("should be case-insensitive when filtering", async () => {
      const user = userEvent.setup();

      render(<Select options={priorityOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByTestId("select-search"), "HIGH");

      expect(screen.getByText("High Priority")).toBeInTheDocument();
    });

    it("should use custom search placeholder", async () => {
      const user = userEvent.setup();

      render(
        <Select
          options={defaultOptions}
          value={null}
          onChange={() => {}}
          searchable
          searchPlaceholder="Type to filter..."
        />
      );

      await user.click(screen.getByRole("combobox"));

      expect(screen.getByPlaceholderText("Type to filter...")).toBeInTheDocument();
    });

    it("should focus search input when dropdown opens", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value={null} onChange={() => {}} searchable />);

      await user.click(screen.getByRole("combobox"));

      await waitFor(() => {
        expect(screen.getByTestId("select-search")).toHaveFocus();
      });
    });

    it("should allow keyboard selection while searching", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(<Select options={priorityOptions} value={null} onChange={handleChange} searchable />);

      await user.click(screen.getByRole("combobox"));
      await user.type(screen.getByTestId("select-search"), "med");
      await user.keyboard("{Enter}");

      expect(handleChange).toHaveBeenCalledWith("medium");
    });
  });

  // ===========================================================================
  // PROPS PASS-THROUGH TESTS
  // ===========================================================================

  describe("Props pass-through", () => {
    it("should accept className prop", () => {
      render(
        <Select
          options={defaultOptions}
          value={null}
          onChange={() => {}}
          className="custom-class"
        />
      );

      expect(screen.getByTestId("select-container")).toHaveClass("custom-class");
    });

    it("should accept style prop", () => {
      render(
        <Select
          options={defaultOptions}
          value={null}
          onChange={() => {}}
          style={{ maxWidth: "300px" }}
        />
      );

      expect(screen.getByTestId("select-container")).toHaveStyle({
        maxWidth: "300px",
      });
    });

    it("should accept id prop", () => {
      render(<Select options={defaultOptions} value={null} onChange={() => {}} id="my-select" />);

      expect(screen.getByRole("combobox")).toHaveAttribute("id", "my-select");
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe("Edge cases", () => {
    it("should handle empty options array", async () => {
      const user = userEvent.setup();

      render(<Select options={[]} value={null} onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      expect(screen.getByText("No options found")).toBeInTheDocument();
    });

    it("should handle single option", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      render(
        <Select
          options={[{ value: "only", label: "Only Option" }]}
          value={null}
          onChange={handleChange}
        />
      );

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("Only Option"));

      expect(handleChange).toHaveBeenCalledWith("only");
    });

    it("should handle value not in options", () => {
      render(
        <Select
          options={defaultOptions}
          value={"nonexistent" as string}
          onChange={() => {}}
          placeholder="Select..."
        />
      );

      // Should show placeholder since value doesn't match any option
      expect(screen.getByRole("combobox")).toHaveTextContent("Select...");
    });

    it("should handle numeric values", async () => {
      const user = userEvent.setup();
      const handleChange = vi.fn();

      const numericOptions: SelectOption<number>[] = [
        { value: 1, label: "One" },
        { value: 2, label: "Two" },
        { value: 3, label: "Three" },
      ];

      render(<Select options={numericOptions} value={null} onChange={handleChange} />);

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("Two"));

      expect(handleChange).toHaveBeenCalledWith(2);
    });

    it("should highlight selected option index when opening", async () => {
      const user = userEvent.setup();

      render(<Select options={defaultOptions} value="opt2" onChange={() => {}} />);

      await user.click(screen.getByRole("combobox"));

      // Option 2 should be highlighted (index 1)
      expect(screen.getByTestId("select-option-1")).toHaveAttribute("data-highlighted", "true");
    });
  });
});
