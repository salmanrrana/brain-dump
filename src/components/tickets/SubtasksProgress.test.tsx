/**
 * Tests for SubtasksProgress component
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Focus on what users SEE and DO
 *
 * Real user behaviors tested:
 * 1. User sees progress bar with correct percentage
 * 2. User sees completion count ("X/Y complete")
 * 3. User clicks subtask to toggle completion
 * 4. User adds a subtask inline
 * 5. User sees empty state when no subtasks
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SubtasksProgress, type Subtask } from "./SubtasksProgress";

// Create a test QueryClient for mutations
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// Wrapper with QueryClient
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Helper to create subtasks
function createSubtask(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    text: "Test subtask",
    completed: false,
    ...overrides,
  };
}

describe("SubtasksProgress", () => {
  describe("Progress display", () => {
    it("shows correct completion count and percentage", () => {
      const subtasks = [
        createSubtask({ id: "1", text: "Done task", completed: true }),
        createSubtask({ id: "2", text: "Pending task", completed: false }),
        createSubtask({ id: "3", text: "Another done", completed: true }),
        createSubtask({ id: "4", text: "Another pending", completed: false }),
      ];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} testId="subtasks" />
        </TestWrapper>
      );

      // Should show "2/4 complete (50%)"
      expect(screen.getByText(/2\/4 complete \(50%\)/)).toBeInTheDocument();
    });

    it("shows progress bar with correct aria attributes", () => {
      const subtasks = [
        createSubtask({ id: "1", completed: true }),
        createSubtask({ id: "2", completed: false }),
      ];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "1");
      expect(progressBar).toHaveAttribute("aria-valuemax", "2");
      expect(progressBar).toHaveAttribute("aria-label", "1 of 2 subtasks complete");
    });

    it("shows 100% when all complete", () => {
      const subtasks = [
        createSubtask({ id: "1", completed: true }),
        createSubtask({ id: "2", completed: true }),
      ];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      expect(screen.getByText(/2\/2 complete \(100%\)/)).toBeInTheDocument();
    });

    it("does not show progress bar when no subtasks", () => {
      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={[]} />
        </TestWrapper>
      );

      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows empty state message when no subtasks", () => {
      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={[]} />
        </TestWrapper>
      );

      expect(screen.getByText(/no subtasks/i)).toBeInTheDocument();
    });

    it("hides empty state when subtasks exist", () => {
      const subtasks = [createSubtask({ id: "1", text: "Has subtask" })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      expect(screen.queryByText(/no subtasks/i)).not.toBeInTheDocument();
    });
  });

  describe("Toggling subtasks", () => {
    it("user clicks subtask item to toggle completion", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Click me", completed: false })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} onUpdate={onUpdate} />
        </TestWrapper>
      );

      // Find the checkbox element (whole item is a checkbox role)
      const checkbox = screen.getByRole("checkbox", { name: /click me/i });
      expect(checkbox).toHaveAttribute("aria-checked", "false");

      // Click to toggle
      await user.click(checkbox);

      // Verify onUpdate was called with toggled subtask
      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onUpdate.mock.calls[0]?.[0] as Subtask[];
      expect(updatedSubtasks[0]?.completed).toBe(true);
    });

    it("user presses Enter/Space on focused subtask to toggle", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Keyboard toggle", completed: false })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} onUpdate={onUpdate} />
        </TestWrapper>
      );

      const checkbox = screen.getByRole("checkbox");
      checkbox.focus();
      await user.keyboard("{Enter}");

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onUpdate.mock.calls[0]?.[0] as Subtask[];
      expect(updatedSubtasks[0]?.completed).toBe(true);
    });

    it("does not toggle when disabled", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const subtasks = [createSubtask({ id: "1", text: "Disabled item", completed: false })];

      render(
        <TestWrapper>
          <SubtasksProgress
            ticketId="test-ticket"
            subtasks={subtasks}
            onUpdate={onUpdate}
            disabled
          />
        </TestWrapper>
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toHaveAttribute("aria-disabled", "true");
      await user.click(checkbox);

      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe("Adding subtasks", () => {
    it("user clicks Add button and enters text to add subtask", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={[]} onUpdate={onUpdate} />
        </TestWrapper>
      );

      // Click Add subtask button to show input
      const addButton = screen.getByRole("button", { name: /add subtask/i });
      await user.click(addButton);

      // Type in the input
      const input = screen.getByPlaceholderText(/enter subtask/i);
      await user.type(input, "New task from test");

      // Click confirm button
      const confirmButton = screen.getByRole("button", { name: /confirm add/i });
      await user.click(confirmButton);

      // Verify onUpdate was called with new subtask
      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onUpdate.mock.calls[0]?.[0] as Subtask[];
      expect(updatedSubtasks).toHaveLength(1);
      expect(updatedSubtasks[0]?.text).toBe("New task from test");
      expect(updatedSubtasks[0]?.completed).toBe(false);
    });

    it("user presses Enter to add subtask", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={[]} onUpdate={onUpdate} />
        </TestWrapper>
      );

      // Click Add button to show input
      const addButton = screen.getByRole("button", { name: /add subtask/i });
      await user.click(addButton);

      // Type and press Enter
      const input = screen.getByPlaceholderText(/enter subtask/i);
      await user.type(input, "Enter key task{Enter}");

      expect(onUpdate).toHaveBeenCalledTimes(1);
      const updatedSubtasks = onUpdate.mock.calls[0]?.[0] as Subtask[];
      expect(updatedSubtasks[0]?.text).toBe("Enter key task");
    });

    it("user presses Escape to cancel add", async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={[]} onUpdate={onUpdate} />
        </TestWrapper>
      );

      // Click Add button
      const addButton = screen.getByRole("button", { name: /add subtask/i });
      await user.click(addButton);

      // Type some text then press Escape
      const input = screen.getByPlaceholderText(/enter subtask/i);
      await user.type(input, "Will cancel{Escape}");

      // Should NOT have called onUpdate
      expect(onUpdate).not.toHaveBeenCalled();

      // Add button should be visible again
      expect(screen.getByRole("button", { name: /add subtask/i })).toBeInTheDocument();
    });

    it("does not show add button when disabled", () => {
      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={[]} disabled />
        </TestWrapper>
      );

      expect(screen.queryByRole("button", { name: /add subtask/i })).not.toBeInTheDocument();
    });
  });

  describe("Visual states", () => {
    it("shows checked symbol for completed subtasks", () => {
      const subtasks = [createSubtask({ id: "1", text: "Completed", completed: true })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      // The checkbox should show checked state
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toHaveAttribute("aria-checked", "true");
      expect(screen.getByText("☑")).toBeInTheDocument();
    });

    it("shows unchecked symbol for incomplete subtasks", () => {
      const subtasks = [createSubtask({ id: "1", text: "Pending", completed: false })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toHaveAttribute("aria-checked", "false");
      expect(screen.getByText("☐")).toBeInTheDocument();
    });

    it("applies strikethrough style to completed subtask text", () => {
      const subtasks = [createSubtask({ id: "1", text: "Strike me", completed: true })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      const textElement = screen.getByText("Strike me");
      expect(textElement).toHaveStyle({ textDecoration: "line-through" });
    });
  });

  describe("Accessibility", () => {
    it("has proper group label for subtask list", () => {
      const subtasks = [createSubtask({ id: "1", text: "Accessible" })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      const group = screen.getByRole("group", { name: /subtasks checklist/i });
      expect(group).toBeInTheDocument();
    });

    it("subtask items are keyboard focusable", () => {
      const subtasks = [
        createSubtask({ id: "1", text: "First" }),
        createSubtask({ id: "2", text: "Second" }),
      ];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} />
        </TestWrapper>
      );

      const checkboxes = screen.getAllByRole("checkbox");
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toHaveAttribute("tabindex", "0");
      });
    });

    it("disabled subtasks are not keyboard focusable", () => {
      const subtasks = [createSubtask({ id: "1", text: "Disabled item" })];

      render(
        <TestWrapper>
          <SubtasksProgress ticketId="test-ticket" subtasks={subtasks} disabled />
        </TestWrapper>
      );

      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toHaveAttribute("tabindex", "-1");
    });
  });
});
