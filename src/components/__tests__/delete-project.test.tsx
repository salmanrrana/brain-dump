/**
 * Integration tests for delete project flow
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Verify what users SEE and DO
 * - Only mock at boundaries (server functions)
 *
 * @see https://kentcdodds.com/blog/testing-implementation-details
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DeleteProjectModal from "../DeleteProjectModal";
import type { DeleteProjectPreview } from "../../api/projects";

// Mock the deleteProject server function
vi.mock("../../api/projects", () => ({
  deleteProject: vi.fn(),
}));

// Import the mocked function for assertions
import { deleteProject } from "../../api/projects";
const mockDeleteProject = vi.mocked(deleteProject);

/**
 * Create a wrapper with TanStack Query provider
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Create mock preview data for delete project
 */
function createMockPreview(overrides: Partial<DeleteProjectPreview> = {}): DeleteProjectPreview {
  return {
    preview: true,
    project: {
      id: "test-project-id",
      name: "Test Project",
      path: "/test/path",
    },
    epics: [
      { id: "epic-1", title: "Q1 Features" },
      { id: "epic-2", title: "Bug Fixes" },
    ],
    tickets: [
      { id: "ticket-1", title: "Add dark mode", status: "done", epicId: "epic-1" },
      { id: "ticket-2", title: "User auth", status: "in_progress", epicId: "epic-1" },
      { id: "ticket-3", title: "Fix login bug", status: "backlog", epicId: "epic-2" },
    ],
    commentCount: 25,
    ...overrides,
  };
}

describe("DeleteProjectModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Name confirmation requirement", () => {
    it("should show delete button as disabled initially", async () => {
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Brain Dump"
        />,
        { wrapper: createTestWrapper() }
      );

      // Delete button should be disabled initially
      const deleteButton = screen.getByRole("button", { name: /delete project/i });
      expect(deleteButton).toBeDisabled();
    });

    it("should keep delete button disabled when wrong name is typed", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview({ project: { id: "1", name: "Brain Dump", path: "/" } });
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Brain Dump"
        />,
        { wrapper: createTestWrapper() }
      );

      // Find the input and type wrong name
      const input = screen.getByPlaceholderText("Brain Dump");
      await user.type(input, "wrong name");

      // Delete button should still be disabled
      const deleteButton = screen.getByRole("button", { name: /delete project/i });
      expect(deleteButton).toBeDisabled();
    });

    it("should enable delete button when correct name is typed", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview({ project: { id: "1", name: "Brain Dump", path: "/" } });
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Brain Dump"
        />,
        { wrapper: createTestWrapper() }
      );

      // Type correct name
      const input = screen.getByPlaceholderText("Brain Dump");
      await user.type(input, "Brain Dump");

      // Delete button should now be enabled
      const deleteButton = screen.getByRole("button", { name: /delete project/i });
      expect(deleteButton).not.toBeDisabled();
    });

    it("should be case-sensitive for name confirmation", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview({ project: { id: "1", name: "Brain Dump", path: "/" } });
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Brain Dump"
        />,
        { wrapper: createTestWrapper() }
      );

      // Type lowercase version
      const input = screen.getByPlaceholderText("Brain Dump");
      await user.type(input, "brain dump");

      // Delete button should still be disabled (case mismatch)
      const deleteButton = screen.getByRole("button", { name: /delete project/i });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe("Preview display", () => {
    it("should show loading state while fetching preview", async () => {
      // Make the promise never resolve to keep loading state
      mockDeleteProject.mockImplementation(() => new Promise(() => {}));

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Should show loading text
      expect(screen.getByText(/loading preview/i)).toBeInTheDocument();
    });

    it("should show complete preview of data to be deleted", async () => {
      const mockPreview = createMockPreview({
        epics: [
          { id: "epic-1", title: "Q1 Features" },
          { id: "epic-2", title: "Bug Fixes" },
        ],
        tickets: [
          { id: "t1", title: "Ticket 1", status: "done", epicId: "epic-1" },
          { id: "t2", title: "Ticket 2", status: "backlog", epicId: "epic-1" },
          { id: "t3", title: "Ticket 3", status: "in_progress", epicId: "epic-2" },
        ],
        commentCount: 25,
      });
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Wait for preview to load and verify counts
      await waitFor(() => {
        expect(screen.getByText(/epics \(2\)/i)).toBeInTheDocument();
      });

      // Verify epic names are shown (they appear in bullet list with "• " prefix)
      // The list items contain the text "• Epic Name"
      await waitFor(() => {
        const listItems = screen.getAllByRole("listitem");
        const epicNames = listItems.map((item) => item.textContent);
        expect(epicNames.some((name) => name?.includes("Q1 Features"))).toBe(true);
        expect(epicNames.some((name) => name?.includes("Bug Fixes"))).toBe(true);
      });

      // Verify comment count is shown
      expect(screen.getByText(/comments: 25/i)).toBeInTheDocument();
    });

    it("should show message for empty project", async () => {
      const mockPreview = createMockPreview({
        epics: [],
        tickets: [],
        commentCount: 0,
      });
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Wait for preview and verify empty state message
      await waitFor(() => {
        expect(
          screen.getByText(/this project has no epics or tickets/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe("Deletion flow", () => {
    it("should call onConfirm when delete button is clicked", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview({ project: { id: "1", name: "Test Project", path: "/" } });
      mockDeleteProject.mockResolvedValue(mockPreview);
      const onConfirm = vi.fn();

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Wait for preview to load
      await waitFor(() => {
        expect(screen.queryByText(/loading preview/i)).not.toBeInTheDocument();
      });

      // Type correct name to enable button
      const input = screen.getByPlaceholderText("Test Project");
      await user.type(input, "Test Project");

      // Click delete button
      const deleteButton = screen.getByRole("button", { name: /delete project/i });
      await user.click(deleteButton);

      // onConfirm should be called
      expect(onConfirm).toHaveBeenCalled();
    });

    it("should allow confirmation via Enter key after typing name", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview({ project: { id: "1", name: "Test Project", path: "/" } });
      mockDeleteProject.mockResolvedValue(mockPreview);
      const onConfirm = vi.fn();

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Wait for preview
      await waitFor(() => {
        expect(screen.queryByText(/loading preview/i)).not.toBeInTheDocument();
      });

      // Type correct name and press Enter
      const input = screen.getByPlaceholderText("Test Project");
      await user.type(input, "Test Project{Enter}");

      // onConfirm should be called
      expect(onConfirm).toHaveBeenCalled();
    });

    it("should show loading state during deletion", async () => {
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={true} // Simulate deletion in progress
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Should show deleting text
      expect(screen.getByText(/deleting/i)).toBeInTheDocument();

      // Button should be disabled during deletion
      const deleteButton = screen.getByRole("button", { name: /deleting/i });
      expect(deleteButton).toBeDisabled();
    });
  });

  describe("Error handling", () => {
    it("should display error message when provided", async () => {
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
          error="Database connection failed"
        />,
        { wrapper: createTestWrapper() }
      );

      // Error message should be displayed
      expect(screen.getByText(/database connection failed/i)).toBeInTheDocument();
    });

    it("should allow retry after error (button stays enabled)", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview({ project: { id: "1", name: "Test Project", path: "/" } });
      mockDeleteProject.mockResolvedValue(mockPreview);
      const onConfirm = vi.fn();

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={onConfirm}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
          error="Network error"
        />,
        { wrapper: createTestWrapper() }
      );

      // Wait for preview
      await waitFor(() => {
        expect(screen.queryByText(/loading preview/i)).not.toBeInTheDocument();
      });

      // Type correct name
      const input = screen.getByPlaceholderText("Test Project");
      await user.type(input, "Test Project");

      // Delete button should be enabled for retry
      const deleteButton = screen.getByRole("button", { name: /delete project/i });
      expect(deleteButton).not.toBeDisabled();

      // Should be able to click again
      await user.click(deleteButton);
      expect(onConfirm).toHaveBeenCalled();
    });
  });

  describe("Cancel flow", () => {
    it("should call onClose when Cancel is clicked", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);
      const onClose = vi.fn();

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Click cancel button
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await user.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });

    it("should call onClose when clicking backdrop", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);
      const onClose = vi.fn();

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Click backdrop (first div with bg-black)
      const backdrop = document.querySelector(".bg-black\\/60");
      if (backdrop) {
        await user.click(backdrop);
      }

      expect(onClose).toHaveBeenCalled();
    });

    it("should call onClose when pressing Escape key", async () => {
      const user = userEvent.setup();
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);
      const onClose = vi.fn();

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={onClose}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Press Escape
      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", async () => {
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should have alertdialog role
      const dialog = screen.getByRole("alertdialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("should focus input on open", async () => {
      const mockPreview = createMockPreview();
      mockDeleteProject.mockResolvedValue(mockPreview);

      render(
        <DeleteProjectModal
          isOpen={true}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Input should receive focus
      await waitFor(() => {
        const input = screen.getByPlaceholderText("Test Project");
        expect(document.activeElement).toBe(input);
      });
    });
  });

  describe("Modal visibility", () => {
    it("should not render when isOpen is false", () => {
      render(
        <DeleteProjectModal
          isOpen={false}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          isLoading={false}
          projectId="test-project-id"
          projectName="Test Project"
        />,
        { wrapper: createTestWrapper() }
      );

      // Modal should not be in the document
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });
});
