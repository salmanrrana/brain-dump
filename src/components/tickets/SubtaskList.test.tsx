/**
 * Tests for SubtaskList component
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - What users SEE and DO
 *
 * Real user behaviors tested:
 * 1. User sees progress indicator
 * 2. User adds a subtask
 * 3. User toggles subtask completion
 * 4. User deletes a subtask
 * 5. User edits a subtask
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SubtaskList, type Subtask } from "./SubtaskList";

// Helper to create subtasks
function createSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text: "Test subtask",
    completed: false,
    ...overrides,
  };
}

describe("SubtaskList", () => {
  describe("Progress indicator", () => {
    it("shows 0/0 complete when empty", () => {
      render(<SubtaskList value={[]} onChange={vi.fn()} />);

      expect(screen.getByText(/0\/0 complete/)).toBeInTheDocument();
    });

    it("shows correct count with some completed", () => {
      const subtasks = [
        createSubtask({ id: "1", text: "Done task", completed: true }),
        createSubtask({ id: "2", text: "Pending task", completed: false }),
        createSubtask({ id: "3", text: "Another done", completed: true }),
      ];

      render(<SubtaskList value={subtasks} onChange={vi.fn()} />);

      expect(screen.getByText(/2\/3 complete/)).toBeInTheDocument();
    });
  });

  describe("Adding subtasks", () => {
    it("user types and clicks Add button to add subtask", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<SubtaskList value={[]} onChange={onChange} />);

      // Type in the input
      const input = screen.getByPlaceholderText(/add a subtask/i);
      await user.type(input, "New subtask");

      // Click Add button
      const addButton = screen.getByRole("button", { name: /add subtask/i });
      await user.click(addButton);

      // Verify onChange was called with new subtask
      expect(onChange).toHaveBeenCalledTimes(1);
      const newSubtasks = onChange.mock.calls[0]?.[0] as Subtask[] | undefined;
      expect(newSubtasks).toHaveLength(1);
      expect(newSubtasks?.[0]?.text).toBe("New subtask");
      expect(newSubtasks?.[0]?.completed).toBe(false);
    });

    it("user presses Enter to add subtask", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<SubtaskList value={[]} onChange={onChange} />);

      const input = screen.getByPlaceholderText(/add a subtask/i);
      await user.type(input, "Enter-added subtask{Enter}");

      expect(onChange).toHaveBeenCalledTimes(1);
      const newSubtasks = onChange.mock.calls[0]?.[0] as Subtask[] | undefined;
      expect(newSubtasks?.[0]?.text).toBe("Enter-added subtask");
    });

    it("does not add empty subtasks", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();

      render(<SubtaskList value={[]} onChange={onChange} />);

      const input = screen.getByPlaceholderText(/add a subtask/i);
      await user.type(input, "   "); // Whitespace only
      await user.keyboard("{Enter}");

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe("Toggling subtasks", () => {
    it("user clicks checkbox to mark subtask complete", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Incomplete task", completed: false })];

      render(<SubtaskList value={subtasks} onChange={onChange} />);

      const checkbox = screen.getByRole("checkbox", {
        name: /mark "incomplete task" as complete/i,
      });
      await user.click(checkbox);

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onChange.mock.calls[0]?.[0] as Subtask[] | undefined;
      expect(updatedSubtasks?.[0]?.completed).toBe(true);
    });

    it("user clicks checkbox to mark subtask incomplete", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Complete task", completed: true })];

      render(<SubtaskList value={subtasks} onChange={onChange} />);

      const checkbox = screen.getByRole("checkbox", {
        name: /mark "complete task" as incomplete/i,
      });
      await user.click(checkbox);

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onChange.mock.calls[0]?.[0] as Subtask[] | undefined;
      expect(updatedSubtasks?.[0]?.completed).toBe(false);
    });
  });

  describe("Deleting subtasks", () => {
    it("user clicks delete button to remove subtask", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const subtasks = [
        createSubtask({ id: "1", text: "Task to delete" }),
        createSubtask({ id: "2", text: "Task to keep" }),
      ];

      render(<SubtaskList value={subtasks} onChange={onChange} />);

      const deleteButton = screen.getByRole("button", { name: /delete "task to delete"/i });
      await user.click(deleteButton);

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onChange.mock.calls[0]?.[0] as Subtask[] | undefined;
      expect(updatedSubtasks).toHaveLength(1);
      expect(updatedSubtasks?.[0]?.text).toBe("Task to keep");
    });
  });

  describe("Editing subtasks", () => {
    it("user clicks edit button and saves new text", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Original text" })];

      render(<SubtaskList value={subtasks} onChange={onChange} />);

      // Click edit button
      const editButton = screen.getByRole("button", { name: /edit "original text"/i });
      await user.click(editButton);

      // Find the edit input and clear + type new text
      const editInput = screen.getByRole("textbox", { name: /edit subtask text/i });
      await user.clear(editInput);
      await user.type(editInput, "Updated text");

      // Click save button
      const saveButton = screen.getByRole("button", { name: /save edit/i });
      await user.click(saveButton);

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onChange.mock.calls[0]?.[0] as Subtask[] | undefined;
      expect(updatedSubtasks?.[0]?.text).toBe("Updated text");
    });

    it("user presses Enter to save edit", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Original" })];

      render(<SubtaskList value={subtasks} onChange={onChange} />);

      const editButton = screen.getByRole("button", { name: /edit "original"/i });
      await user.click(editButton);

      const editInput = screen.getByRole("textbox", { name: /edit subtask text/i });
      await user.clear(editInput);
      await user.type(editInput, "New text{Enter}");

      expect(onChange).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onChange.mock.calls[0]?.[0] as Subtask[] | undefined;
      expect(updatedSubtasks?.[0]?.text).toBe("New text");
    });

    it("user presses Escape to cancel edit", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Keep this" })];

      render(<SubtaskList value={subtasks} onChange={onChange} />);

      const editButton = screen.getByRole("button", { name: /edit "keep this"/i });
      await user.click(editButton);

      const editInput = screen.getByRole("textbox", { name: /edit subtask text/i });
      await user.clear(editInput);
      await user.type(editInput, "Different text{Escape}");

      // Should NOT call onChange since edit was cancelled
      expect(onChange).not.toHaveBeenCalled();

      // Original text should still be visible
      expect(screen.getByText("Keep this")).toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows empty state message when no subtasks", () => {
      render(<SubtaskList value={[]} onChange={vi.fn()} />);

      expect(screen.getByText(/no subtasks yet/i)).toBeInTheDocument();
    });

    it("hides empty state message when subtasks exist", () => {
      const subtasks = [createSubtask({ id: "1", text: "Has subtasks" })];

      render(<SubtaskList value={subtasks} onChange={vi.fn()} />);

      expect(screen.queryByText(/no subtasks yet/i)).not.toBeInTheDocument();
    });
  });

  describe("Disabled state", () => {
    it("hides add input when disabled", () => {
      render(<SubtaskList value={[]} onChange={vi.fn()} disabled />);

      expect(screen.queryByPlaceholderText(/add a subtask/i)).not.toBeInTheDocument();
    });

    it("hides edit and delete buttons when disabled", () => {
      const subtasks = [createSubtask({ id: "1", text: "Task" })];

      render(<SubtaskList value={subtasks} onChange={vi.fn()} disabled />);

      expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    });

    it("disables checkbox when disabled", () => {
      const subtasks = [createSubtask({ id: "1", text: "Task" })];

      render(<SubtaskList value={subtasks} onChange={vi.fn()} disabled />);

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeDisabled();
    });
  });
});
