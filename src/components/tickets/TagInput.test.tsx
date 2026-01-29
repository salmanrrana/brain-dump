import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagInput } from "./TagInput";

/**
 * TagInput Component Tests
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Focus on what users see, click, and experience
 * - Each test answers: "What real user behavior does this verify?"
 */

describe("TagInput", () => {
  // =========================================================================
  // ADD TAG BEHAVIOR
  // User behavior: Type a tag name and press Enter to add it
  // =========================================================================

  describe("adding tags", () => {
    it("adds a tag when user types and presses Enter", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={[]} onChange={onChange} availableTags={["api", "backend"]} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "frontend{Enter}");

      expect(onChange).toHaveBeenCalledWith(["frontend"]);
    });

    it("adds multiple tags when user types comma-separated values", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={[]} onChange={onChange} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "api,backend,");

      // First call adds "api", second call adds "backend"
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenNthCalledWith(1, ["api"]);
      expect(onChange).toHaveBeenNthCalledWith(2, ["backend"]);
    });

    it("trims whitespace from tags before adding", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={[]} onChange={onChange} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "  spaced  {Enter}");

      expect(onChange).toHaveBeenCalledWith(["spaced"]);
    });

    it("does not add empty tags", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={[]} onChange={onChange} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "   {Enter}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // DUPLICATE PREVENTION
  // User behavior: Cannot add the same tag twice (case-insensitive)
  // =========================================================================

  describe("duplicate prevention", () => {
    it("prevents adding duplicate tags (case-insensitive)", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={["API"]} onChange={onChange} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "api{Enter}");

      expect(onChange).not.toHaveBeenCalled();
    });

    it("prevents adding exact duplicate tags", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={["backend"]} onChange={onChange} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "backend{Enter}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // REMOVE TAG BEHAVIOR
  // User behavior: Click X button on a tag to remove it
  // =========================================================================

  describe("removing tags", () => {
    it("removes tag when user clicks the X button", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={["api", "backend", "frontend"]} onChange={onChange} />);

      // Find and click the remove button for "backend"
      const removeButton = screen.getByRole("button", { name: /remove tag backend/i });
      await user.click(removeButton);

      expect(onChange).toHaveBeenCalledWith(["api", "frontend"]);
    });

    it("removes last tag when user presses Backspace with empty input", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={["api", "backend"]} onChange={onChange} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.click(input);
      await user.keyboard("{Backspace}");

      expect(onChange).toHaveBeenCalledWith(["api"]);
    });
  });

  // =========================================================================
  // AUTOCOMPLETE BEHAVIOR
  // User behavior: See suggestions while typing, select with click or keyboard
  // =========================================================================

  describe("autocomplete", () => {
    it("shows matching suggestions when user types", async () => {
      const user = userEvent.setup();

      render(
        <TagInput
          value={[]}
          onChange={vi.fn()}
          availableTags={["api", "api-gateway", "backend", "frontend"]}
        />
      );

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "api");

      // Should show "api" and "api-gateway" suggestions
      const listbox = screen.getByRole("listbox");
      expect(listbox).toBeInTheDocument();

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(2);
      expect(options[0]).toHaveTextContent("api");
      expect(options[1]).toHaveTextContent("api-gateway");
    });

    it("filters out already selected tags from suggestions", async () => {
      const user = userEvent.setup();

      render(
        <TagInput
          value={["api"]}
          onChange={vi.fn()}
          availableTags={["api", "api-gateway", "backend"]}
        />
      );

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "api");

      // Should only show "api-gateway" (not "api" since it's already selected)
      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(1);
      expect(options[0]).toHaveTextContent("api-gateway");
    });

    it("adds suggestion when user clicks on it", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={[]} onChange={onChange} availableTags={["api", "backend"]} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "ba");

      const option = screen.getByRole("option", { name: /backend/i });
      await user.click(option);

      expect(onChange).toHaveBeenCalledWith(["backend"]);
    });

    it("navigates suggestions with arrow keys and selects with Enter", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<TagInput value={[]} onChange={onChange} availableTags={["api", "api-gateway"]} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "api");

      // Navigate down to second option
      await user.keyboard("{ArrowDown}");

      // Verify second option is highlighted
      const options = screen.getAllByRole("option");
      expect(options[1]).toHaveAttribute("aria-selected", "true");

      // Press Enter to select
      await user.keyboard("{Enter}");

      expect(onChange).toHaveBeenCalledWith(["api-gateway"]);
    });

    it("closes dropdown when user presses Escape", async () => {
      const user = userEvent.setup();

      render(<TagInput value={[]} onChange={vi.fn()} availableTags={["api", "backend"]} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "api");

      // Dropdown should be open
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Press Escape
      await user.keyboard("{Escape}");

      // Dropdown should be closed
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // DISPLAY BEHAVIOR
  // User behavior: See existing tags as colored pills
  // =========================================================================

  describe("display", () => {
    it("displays existing tags as pills", () => {
      render(<TagInput value={["api", "backend", "frontend"]} onChange={vi.fn()} />);

      // Tags should be visible as text
      expect(screen.getByText("api")).toBeInTheDocument();
      expect(screen.getByText("backend")).toBeInTheDocument();
      expect(screen.getByText("frontend")).toBeInTheDocument();

      // Each tag should have a remove button
      expect(screen.getByRole("button", { name: /remove tag api/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove tag backend/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remove tag frontend/i })).toBeInTheDocument();
    });

    it("shows placeholder when no tags are selected", () => {
      render(<TagInput value={[]} onChange={vi.fn()} placeholder="Add tags..." />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      expect(input).toHaveAttribute("placeholder", "Add tags...");
    });

    it("hides placeholder when tags exist", () => {
      render(<TagInput value={["api"]} onChange={vi.fn()} placeholder="Add tags..." />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      expect(input).toHaveAttribute("placeholder", "");
    });
  });

  // =========================================================================
  // DISABLED STATE
  // User behavior: Cannot interact when disabled
  // =========================================================================

  describe("disabled state", () => {
    it("prevents adding tags when disabled", () => {
      render(<TagInput value={[]} onChange={vi.fn()} disabled />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      expect(input).toBeDisabled();
    });

    it("prevents removing tags when disabled", () => {
      render(<TagInput value={["api"]} onChange={vi.fn()} disabled />);

      const removeButton = screen.getByRole("button", { name: /remove tag api/i });
      expect(removeButton).toBeDisabled();
    });
  });

  // =========================================================================
  // MAX TAGS LIMIT
  // User behavior: Input disappears when max tags reached
  // =========================================================================

  describe("max tags limit", () => {
    it("hides input when max tags reached", () => {
      render(<TagInput value={["api", "backend"]} onChange={vi.fn()} maxTags={2} />);

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("shows input when below max tags", () => {
      render(<TagInput value={["api"]} onChange={vi.fn()} maxTags={2} />);

      expect(screen.getByRole("textbox", { name: /add tag/i })).toBeInTheDocument();
    });

    it("does not add tag when at max limit", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      // Start with 1 tag, max 2
      const { rerender } = render(<TagInput value={["api"]} onChange={onChange} maxTags={2} />);

      const input = screen.getByRole("textbox", { name: /add tag/i });
      await user.type(input, "backend{Enter}");

      // Should add one tag
      expect(onChange).toHaveBeenCalledWith(["api", "backend"]);

      // Simulate parent updating with new value (now at max)
      rerender(<TagInput value={["api", "backend"]} onChange={onChange} maxTags={2} />);

      // Input should now be hidden
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });
  });
});
