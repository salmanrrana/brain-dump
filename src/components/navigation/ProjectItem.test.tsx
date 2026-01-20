import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectItem, type ProjectItemProps } from "./ProjectItem";

describe("ProjectItem", () => {
  const defaultProps: ProjectItemProps = {
    id: "project-1",
    name: "Brain Dump",
    path: "/Users/test/code/brain-dump",
    color: "#8b5cf6",
  };

  describe("Rendering", () => {
    it("renders project name", () => {
      render(<ProjectItem {...defaultProps} />);

      expect(screen.getByTestId("project-name")).toHaveTextContent("Brain Dump");
    });

    it("renders truncated path with tooltip", () => {
      render(<ProjectItem {...defaultProps} />);

      const item = screen.getByRole("option");
      expect(item).toHaveAttribute("title", defaultProps.path);
      expect(screen.getByTestId("project-path")).toBeInTheDocument();
    });

    it("renders color indicator with project color", () => {
      render(<ProjectItem {...defaultProps} />);

      const colorDot = screen.getByTestId("color-indicator");
      expect(colorDot).toHaveStyle({ background: "#8b5cf6" });
    });

    it("renders fallback color when color is null", () => {
      render(<ProjectItem {...defaultProps} color={null} />);

      const colorDot = screen.getByTestId("color-indicator");
      expect(colorDot).toHaveStyle({ background: "var(--text-tertiary)" });
    });

    it("renders ticket stats when provided", () => {
      const stats = { total: 24, inProgress: 3, done: 15 };
      render(<ProjectItem {...defaultProps} stats={stats} />);

      expect(screen.getByTestId("project-stats")).toHaveTextContent("24 tickets · 3 in progress");
    });

    it("does not render stats when not provided", () => {
      render(<ProjectItem {...defaultProps} />);

      expect(screen.queryByTestId("project-stats")).not.toBeInTheDocument();
    });
  });

  describe("AI Active Indicator", () => {
    it("shows AI indicator when isAiActive is true", () => {
      render(<ProjectItem {...defaultProps} isAiActive={true} />);

      const indicator = screen.getByTestId("ai-indicator");
      expect(indicator).toBeInTheDocument();
      expect(indicator).toHaveAttribute("aria-label", "AI is active on this project");
    });

    it("does not show AI indicator when isAiActive is false", () => {
      render(<ProjectItem {...defaultProps} isAiActive={false} />);

      expect(screen.queryByTestId("ai-indicator")).not.toBeInTheDocument();
    });

    it("applies glow effect when AI is active", () => {
      render(<ProjectItem {...defaultProps} isAiActive={true} />);

      const item = screen.getByRole("option");
      // Check that box-shadow is applied (glow effect)
      expect(item.style.boxShadow).toContain("var(--accent-primary)");
    });
  });

  describe("Selection", () => {
    it("indicates selected state via aria-selected", () => {
      render(<ProjectItem {...defaultProps} isSelected={true} />);

      const item = screen.getByRole("option");
      expect(item).toHaveAttribute("aria-selected", "true");
    });

    it("indicates unselected state via aria-selected", () => {
      render(<ProjectItem {...defaultProps} isSelected={false} />);

      const item = screen.getByRole("option");
      expect(item).toHaveAttribute("aria-selected", "false");
    });

    it("applies selected background when selected", () => {
      render(<ProjectItem {...defaultProps} isSelected={true} />);

      const item = screen.getByRole("option");
      expect(item).toHaveStyle({ background: "var(--accent-muted)" });
    });
  });

  describe("Click Handlers", () => {
    it("calls onClick with project id when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<ProjectItem {...defaultProps} onClick={handleClick} />);

      await user.click(screen.getByRole("option"));
      expect(handleClick).toHaveBeenCalledWith("project-1");
    });

    it("calls onDoubleClick with project id when double-clicked", async () => {
      const user = userEvent.setup();
      const handleDoubleClick = vi.fn();

      render(<ProjectItem {...defaultProps} onDoubleClick={handleDoubleClick} />);

      await user.dblClick(screen.getByRole("option"));
      expect(handleDoubleClick).toHaveBeenCalledWith("project-1");
    });

    it("does not throw when clicking without handlers", async () => {
      const user = userEvent.setup();

      render(<ProjectItem {...defaultProps} />);

      // Should not throw
      await user.click(screen.getByRole("option"));
      await user.dblClick(screen.getByRole("option"));
    });
  });

  describe("Hover Actions", () => {
    it("shows edit button on hover when onEdit is provided", () => {
      const handleEdit = vi.fn();

      render(<ProjectItem {...defaultProps} onEdit={handleEdit} />);

      // Before hover, actions should be hidden (opacity 0)
      const actions = screen.getByTestId("hover-actions");
      expect(actions).toHaveStyle({ opacity: "0" });

      // After hover, actions should be visible
      fireEvent.mouseEnter(screen.getByRole("option"));
      expect(actions).toHaveStyle({ opacity: "1" });
    });

    it("calls onEdit when edit button is clicked", () => {
      const handleEdit = vi.fn();
      const handleClick = vi.fn();

      render(<ProjectItem {...defaultProps} onEdit={handleEdit} onClick={handleClick} />);

      // Hover to reveal buttons
      fireEvent.mouseEnter(screen.getByRole("option"));

      // Click edit button
      fireEvent.click(screen.getByTestId("edit-button"));

      expect(handleEdit).toHaveBeenCalledWith("project-1");
      // Should NOT trigger the item click
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("calls onDelete when delete button is clicked", () => {
      const handleDelete = vi.fn();
      const handleClick = vi.fn();

      render(<ProjectItem {...defaultProps} onDelete={handleDelete} onClick={handleClick} />);

      // Hover to reveal buttons
      fireEvent.mouseEnter(screen.getByRole("option"));

      // Click delete button
      fireEvent.click(screen.getByTestId("delete-button"));

      expect(handleDelete).toHaveBeenCalledWith("project-1");
      // Should NOT trigger the item click
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("does not render hover actions when no handlers provided", () => {
      render(<ProjectItem {...defaultProps} />);

      expect(screen.queryByTestId("hover-actions")).not.toBeInTheDocument();
    });

    it("edit button has correct aria-label", () => {
      render(<ProjectItem {...defaultProps} onEdit={vi.fn()} />);

      fireEvent.mouseEnter(screen.getByRole("option"));

      expect(screen.getByTestId("edit-button")).toHaveAttribute("aria-label", "Edit Brain Dump");
    });

    it("delete button has correct aria-label", () => {
      render(<ProjectItem {...defaultProps} onDelete={vi.fn()} />);

      fireEvent.mouseEnter(screen.getByRole("option"));

      expect(screen.getByTestId("delete-button")).toHaveAttribute(
        "aria-label",
        "Delete Brain Dump"
      );
    });
  });

  describe("Keyboard Navigation", () => {
    it("triggers onClick on Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<ProjectItem {...defaultProps} onClick={handleClick} />);

      // Focus the item
      await user.tab();

      // Press Enter
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledWith("project-1");
    });

    it("triggers onClick on Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();

      render(<ProjectItem {...defaultProps} onClick={handleClick} />);

      // Focus the item
      await user.tab();

      // Press Space
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledWith("project-1");
    });

    it("is focusable with Tab", async () => {
      const user = userEvent.setup();

      render(<ProjectItem {...defaultProps} />);

      await user.tab();

      expect(screen.getByRole("option")).toHaveFocus();
    });
  });

  describe("Accessibility", () => {
    it("has role option for listbox integration", () => {
      render(<ProjectItem {...defaultProps} />);

      expect(screen.getByRole("option")).toBeInTheDocument();
    });

    it("has test id with project id for easy testing", () => {
      render(<ProjectItem {...defaultProps} />);

      expect(screen.getByTestId("project-item-project-1")).toBeInTheDocument();
    });

    it("color indicator is aria-hidden", () => {
      render(<ProjectItem {...defaultProps} />);

      const colorDot = screen.getByTestId("color-indicator");
      expect(colorDot).toHaveAttribute("aria-hidden", "true");
    });

    it("AI indicator has role status", () => {
      render(<ProjectItem {...defaultProps} isAiActive={true} />);

      const indicator = screen.getByTestId("ai-indicator");
      expect(indicator).toHaveAttribute("role", "status");
    });
  });
});
