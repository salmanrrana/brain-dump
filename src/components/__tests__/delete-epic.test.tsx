/**
 * Integration tests for delete epic flow
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Verify what users SEE and DO
 * - Only mock at boundaries (server functions)
 *
 * Key difference from ticket deletion:
 * - Epics UNLINK tickets (tickets remain in project)
 * - Tickets DELETE comments (data is removed)
 *
 * @see https://kentcdodds.com/blog/testing-implementation-details
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DeleteConfirmationModal from "../DeleteConfirmationModal";
import { ToastProvider } from "../Toast";
import type { DeletePreview } from "../DeleteConfirmationModal";

/**
 * Create a wrapper with TanStack Query provider and Toast provider
 */
function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    );
  };
}

/**
 * Create mock preview data for delete epic
 */
function createMockEpicPreview(
  overrides: Partial<DeletePreview> = {}
): DeletePreview {
  return {
    ticketCount: 5,
    ...overrides,
  };
}

describe("DeleteConfirmationModal - Epic Deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Happy Path: Delete epic with tickets", () => {
    it("should show confirmation modal with preview of unlinked tickets", async () => {
      const mockPreview = createMockEpicPreview({ ticketCount: 3 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Q1 Features"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should be visible
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toBeInTheDocument();

      // Should show entity name
      expect(screen.getByText(/"Q1 Features"/)).toBeInTheDocument();

      // Should say "unlinked" not "deleted" for epic tickets
      expect(screen.getByText(/3 tickets will be unlinked/i)).toBeInTheDocument();

      // Should NOT say "cannot be undone" - tickets are preserved
      expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument();

      // Should say tickets will remain in project
      expect(screen.getByText(/tickets will remain in the project/i)).toBeInTheDocument();
    });

    it("should call onConfirm when user clicks delete button", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const mockPreview = createMockEpicPreview({ ticketCount: 5 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          entityType="epic"
          entityName="Bug Fixes"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Click the delete button
      const deleteButton = screen.getByRole("button", { name: /delete epic/i });
      await user.click(deleteButton);

      // onConfirm should be called
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("should show correct singular grammar for one ticket", async () => {
      const mockPreview = createMockEpicPreview({ ticketCount: 1 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Solo Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should use singular "ticket" not "tickets"
      expect(screen.getByText(/1 ticket will be unlinked/i)).toBeInTheDocument();
    });

    it("should not show ticket preview when epic has no tickets", async () => {
      const mockPreview = createMockEpicPreview({ ticketCount: 0 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Empty Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should not show "0 tickets will be unlinked" or any unlink count
      expect(screen.queryByText(/\d+ tickets? will be unlinked/i)).not.toBeInTheDocument();

      // The "This will affect:" section should not appear when there's nothing to list
      expect(screen.queryByText(/this will affect:/i)).not.toBeInTheDocument();

      // Should still show the warning about tickets remaining in project
      expect(screen.getByText(/tickets will remain in the project/i)).toBeInTheDocument();
    });
  });

  describe("Epic-specific UX: Tickets are preserved", () => {
    it("should use amber warning color instead of red for non-destructive action", async () => {
      const mockPreview = createMockEpicPreview({ ticketCount: 10 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Tech Debt"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // The warning text should have amber class (not red)
      const warningText = screen.getByText(/tickets will remain in the project/i);
      expect(warningText).toHaveClass("text-amber-400");
    });

    it("should say 'This will affect' instead of 'This will permanently delete'", async () => {
      const mockPreview = createMockEpicPreview({ ticketCount: 5 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Feature Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should say "This will affect:" not "This will permanently delete:"
      expect(screen.getByText(/this will affect:/i)).toBeInTheDocument();
      expect(screen.queryByText(/permanently delete/i)).not.toBeInTheDocument();
    });
  });

  describe("Cancel flow", () => {
    it("should call onClose when user clicks cancel button", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Click cancel button
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when user clicks backdrop", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Click backdrop (the bg-black/60 overlay)
      const backdrop = document.querySelector(".bg-black\\/60");
      expect(backdrop).not.toBeNull();
      await user.click(backdrop!);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should call onClose when user presses Escape key", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Press Escape key
      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("should not call onConfirm when modal is cancelled", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Click cancel
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should display error message when provided", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
          error="Database locked - please try again"
        />,
        { wrapper: createTestWrapper() }
      );

      // Error message should be visible
      expect(screen.getByText(/database locked/i)).toBeInTheDocument();
    });

    it("should keep modal open on error to allow retry", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
          error="Network error"
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should still be open
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      // Delete button should still be clickable for retry
      const deleteButton = screen.getByRole("button", { name: /delete epic/i });
      expect(deleteButton).not.toBeDisabled();
    });

    it("should allow retry after error", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
          error="First attempt failed"
        />,
        { wrapper: createTestWrapper() }
      );

      // Click delete again to retry
      const deleteButton = screen.getByRole("button", { name: /delete epic/i });
      await user.click(deleteButton);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe("Loading state", () => {
    it("should show loading state during deletion", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should show "Deleting..." text
      expect(screen.getByText(/deleting/i)).toBeInTheDocument();
    });

    it("should disable delete button during loading", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Delete button should be disabled
      const deleteButton = screen.getByRole("button", { name: /deleting/i });
      expect(deleteButton).toBeDisabled();
    });

    it("should disable cancel button during loading", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Cancel button should be disabled
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      expect(cancelButton).toBeDisabled();
    });

    it("should disable close button (X) during loading", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Close button (aria-label="Close modal") should be disabled
      const closeButton = screen.getByRole("button", { name: /close modal/i });
      expect(closeButton).toBeDisabled();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should have alertdialog role (since it's a destructive action)
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("should have accessible title and description", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should have labeled title
      expect(screen.getByRole("alertdialog")).toHaveAttribute(
        "aria-labelledby",
        "delete-modal-title"
      );

      // Title should exist
      expect(screen.getByText(/delete epic\?/i)).toBeInTheDocument();
    });
  });

  describe("Modal visibility", () => {
    it("should not render when isOpen is false", () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should not be in the document
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("should render when isOpen changes to true", async () => {
      const mockPreview = createMockEpicPreview();

      const { rerender } = render(
        <DeleteConfirmationModal
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Initially not visible
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

      // Rerender with isOpen=true
      rerender(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />
      );

      // Now should be visible
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("Entity type display", () => {
    it("should display correct entity type label for epic", async () => {
      const mockPreview = createMockEpicPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="epic"
          entityName="Test Epic"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Title should say "Delete Epic?"
      expect(screen.getByText(/delete epic\?/i)).toBeInTheDocument();

      // Button should say "Delete Epic"
      expect(
        screen.getByRole("button", { name: /delete epic/i })
      ).toBeInTheDocument();
    });
  });
});
