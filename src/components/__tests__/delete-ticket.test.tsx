/**
 * Integration tests for delete ticket flow
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Verify what users SEE and DO
 * - Only mock at boundaries (server functions)
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
 * Create mock preview data for delete ticket
 */
function createMockTicketPreview(
  overrides: Partial<DeletePreview> = {}
): DeletePreview {
  return {
    commentCount: 3,
    ...overrides,
  };
}

describe("DeleteConfirmationModal - Ticket Deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Happy Path: Delete ticket with comments", () => {
    it("should show confirmation modal with preview of affected data", async () => {
      const mockPreview = createMockTicketPreview({ commentCount: 5 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Add dark mode toggle"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should be visible
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toBeInTheDocument();

      // Should show entity name
      expect(screen.getByText(/"Add dark mode toggle"/)).toBeInTheDocument();

      // Should show comment count
      expect(screen.getByText(/5 comments/i)).toBeInTheDocument();

      // Should show warning that action cannot be undone
      expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    });

    it("should call onConfirm when user clicks delete button", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const mockPreview = createMockTicketPreview({ commentCount: 3 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          entityType="ticket"
          entityName="Fix login bug"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Click the delete button
      const deleteButton = screen.getByRole("button", { name: /delete ticket/i });
      await user.click(deleteButton);

      // onConfirm should be called
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it("should show correct singular grammar for one comment", async () => {
      const mockPreview = createMockTicketPreview({ commentCount: 1 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should use singular "comment" not "comments"
      expect(screen.getByText(/1 comment$/i)).toBeInTheDocument();
    });

    it("should not show comment preview when ticket has no comments", async () => {
      const mockPreview = createMockTicketPreview({ commentCount: 0 });

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Empty ticket"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should not show "0 comments" - the preview section should be empty
      expect(screen.queryByText(/comments/i)).not.toBeInTheDocument();
    });
  });

  describe("Cancel flow", () => {
    it("should call onClose when user clicks cancel button", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
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
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
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
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
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
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
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
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
          error="Database locked - please try again"
        />,
        { wrapper: createTestWrapper() }
      );

      // Error message should be visible
      expect(screen.getByText(/database locked/i)).toBeInTheDocument();
    });

    it("should keep modal open on error to allow retry", async () => {
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
          error="Network error"
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should still be open
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();

      // Delete button should still be clickable for retry
      const deleteButton = screen.getByRole("button", { name: /delete ticket/i });
      expect(deleteButton).not.toBeDisabled();
    });

    it("should allow retry after error", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
          error="First attempt failed"
        />,
        { wrapper: createTestWrapper() }
      );

      // Click delete again to retry
      const deleteButton = screen.getByRole("button", { name: /delete ticket/i });
      await user.click(deleteButton);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  describe("Loading state", () => {
    it("should show loading state during deletion", async () => {
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Should show "Deleting..." text
      expect(screen.getByText(/deleting/i)).toBeInTheDocument();
    });

    it("should disable delete button during loading", async () => {
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Delete button should be disabled
      const deleteButton = screen.getByRole("button", { name: /deleting/i });
      expect(deleteButton).toBeDisabled();
    });

    it("should disable cancel button during loading", async () => {
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Cancel button should be disabled
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      expect(cancelButton).toBeDisabled();
    });

    it("should disable close button (X) during loading", async () => {
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true}
          entityType="ticket"
          entityName="Test ticket"
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
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
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
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
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
      expect(screen.getByText(/delete ticket\?/i)).toBeInTheDocument();
    });
  });

  describe("Modal visibility", () => {
    it("should not render when isOpen is false", () => {
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should not be in the document
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("should render when isOpen changes to true", async () => {
      const mockPreview = createMockTicketPreview();

      const { rerender } = render(
        <DeleteConfirmationModal
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
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
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
        />
      );

      // Now should be visible
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("Entity type display", () => {
    it("should display correct entity type label for ticket", async () => {
      const mockPreview = createMockTicketPreview();

      render(
        <DeleteConfirmationModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          entityType="ticket"
          entityName="Test ticket"
          preview={mockPreview}
        />,
        { wrapper: createTestWrapper() }
      );

      // Title should say "Delete Ticket?"
      expect(screen.getByText(/delete ticket\?/i)).toBeInTheDocument();

      // Button should say "Delete Ticket"
      expect(
        screen.getByRole("button", { name: /delete ticket/i })
      ).toBeInTheDocument();
    });
  });
});
