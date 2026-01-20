/**
 * Integration tests for CreateTicketModal
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Verify what users SEE and DO
 * - Only mock at boundaries (server functions)
 *
 * Real user behaviors tested:
 * 1. User sees modal with form fields
 * 2. User types title and selects project
 * 3. User submits the form
 * 4. User closes the modal
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateTicketModal } from "./CreateTicketModal";
import { ToastProvider } from "../Toast";

// Mock the API at the boundary
vi.mock("../../api/tickets", () => ({
  createTicket: vi.fn().mockResolvedValue({ id: "test-ticket-123" }),
}));

vi.mock("../../api/projects", () => ({
  getProjects: vi.fn().mockResolvedValue([
    {
      id: "project-1",
      name: "Brain Dump",
      path: "/code/brain-dump",
      color: "#8b5cf6",
      createdAt: "2026-01-01",
    },
    {
      id: "project-2",
      name: "Side Project",
      path: "/code/side-project",
      color: "#3b82f6",
      createdAt: "2026-01-02",
    },
  ]),
}));

vi.mock("../../api/epics", () => ({
  getEpicsByProject: vi.fn().mockImplementation(async ({ data: projectId }) => {
    if (projectId === "project-1") {
      return [
        {
          id: "epic-1",
          title: "Sprint 1",
          projectId: "project-1",
          description: null,
          color: null,
          createdAt: "2026-01-01",
        },
      ];
    }
    return [];
  }),
}));

import { createTicket } from "../../api/tickets";

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

describe("CreateTicketModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Modal visibility and structure", () => {
    it("renders nothing when isOpen is false", () => {
      render(<CreateTicketModal isOpen={false} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("renders modal with form fields when isOpen is true", async () => {
      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Modal should be visible
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();

      // Should show title
      expect(screen.getByText("Create New Ticket")).toBeInTheDocument();

      // Should show required form fields
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/project/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();

      // Should show action buttons
      expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /create ticket/i })).toBeInTheDocument();
    });

    it("focuses title input when modal opens", async () => {
      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Wait for focus
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toHaveFocus();
      });
    });
  });

  describe("User interactions: Closing modal", () => {
    it("calls onClose when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(<CreateTicketModal isOpen={true} onClose={onClose} />, {
        wrapper: createTestWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when X button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(<CreateTicketModal isOpen={true} onClose={onClose} />, {
        wrapper: createTestWrapper(),
      });

      await user.click(screen.getByRole("button", { name: /close modal/i }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape key is pressed", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      render(<CreateTicketModal isOpen={true} onClose={onClose} />, {
        wrapper: createTestWrapper(),
      });

      // Wait for title input to be focused (modal focuses it on open)
      await waitFor(() => {
        expect(screen.getByLabelText(/title/i)).toHaveFocus();
      });

      // Press Escape while focused on modal content
      await user.keyboard("{Escape}");

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("User interactions: Form submission", () => {
    it("does not submit when title is empty", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Wait for projects to load
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /brain dump/i })).toBeInTheDocument();
      });

      // Select project but leave title empty
      await user.selectOptions(screen.getByLabelText(/project/i), "project-1");

      // Click submit - should show validation error, not submit
      await user.click(screen.getByRole("button", { name: /create ticket/i }));

      // API should NOT have been called
      expect(createTicket).not.toHaveBeenCalled();
    });

    it("does not submit when project is not selected", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Type a title but don't select a project
      await user.type(screen.getByLabelText(/title/i), "My new ticket");

      // Click submit - should show validation error, not submit
      await user.click(screen.getByRole("button", { name: /create ticket/i }));

      // API should NOT have been called
      expect(createTicket).not.toHaveBeenCalled();
    });

    it("disables button only during submission", () => {
      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Button should be enabled even when form is empty (validation on submit)
      const submitButton = screen.getByRole("button", { name: /create ticket/i });
      expect(submitButton).not.toBeDisabled();
    });

    it("submits form with entered data and calls onSuccess", async () => {
      const user = userEvent.setup();
      const onSuccess = vi.fn();
      const onClose = vi.fn();

      render(<CreateTicketModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />, {
        wrapper: createTestWrapper(),
      });

      // Wait for projects to load
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /brain dump/i })).toBeInTheDocument();
      });

      // Fill in the form
      await user.type(screen.getByLabelText(/title/i), "Implement dark mode");
      await user.type(screen.getByLabelText(/description/i), "Add theme switching");
      await user.selectOptions(screen.getByLabelText(/project/i), "project-1");
      await user.selectOptions(screen.getByLabelText(/priority/i), "high");

      // Submit the form
      await user.click(screen.getByRole("button", { name: /create ticket/i }));

      // Verify API was called with correct data
      await waitFor(() => {
        expect(createTicket).toHaveBeenCalledWith({
          data: expect.objectContaining({
            title: "Implement dark mode",
            description: "Add theme switching",
            projectId: "project-1",
            priority: "high",
          }),
        });
      });

      // Verify callbacks were called
      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("User interactions: Epic selection", () => {
    it("disables epic dropdown when no project is selected", () => {
      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      const epicSelect = screen.getByLabelText(/epic/i);
      expect(epicSelect).toBeDisabled();
    });

    it("shows helper text when no project is selected", () => {
      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      expect(screen.getByText(/select a project first/i)).toBeInTheDocument();
    });

    it("enables epic dropdown after selecting a project", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Wait for projects to load
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /brain dump/i })).toBeInTheDocument();
      });

      // Select a project
      await user.selectOptions(screen.getByLabelText(/project/i), "project-1");

      // Epic dropdown should be enabled
      await waitFor(() => {
        expect(screen.getByLabelText(/epic/i)).not.toBeDisabled();
      });
    });
  });

  describe("User interactions: Form validation", () => {
    it("shows error message after user leaves title field empty", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Focus title field then blur without typing
      const titleInput = screen.getByLabelText(/title/i);
      await user.click(titleInput);
      await user.tab(); // Blur the field

      // Error message should appear
      expect(screen.getByText("Title is required")).toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Title is required");
    });

    it("shows error message after user leaves project unselected", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Wait for projects to load
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /brain dump/i })).toBeInTheDocument();
      });

      // Focus project dropdown then blur without selecting
      const projectSelect = screen.getByLabelText(/^project/i);
      await user.click(projectSelect);
      await user.tab(); // Blur the field

      // Error message should appear
      expect(screen.getByText("Please select a project")).toBeInTheDocument();
    });

    it("focuses first invalid field when user tries to submit invalid form", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Wait for projects to load
      await waitFor(() => {
        expect(screen.getByRole("option", { name: /brain dump/i })).toBeInTheDocument();
      });

      // Select project but leave title empty
      await user.selectOptions(screen.getByLabelText(/^project/i), "project-1");

      // Click submit button
      await user.click(screen.getByRole("button", { name: /create ticket/i }));

      // Title field should be focused (first invalid field)
      expect(screen.getByLabelText(/title/i)).toHaveFocus();

      // Error message should appear
      expect(screen.getByText("Title is required")).toBeInTheDocument();
    });

    it("shows project error when title is valid but project not selected", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Type title but don't select project
      await user.type(screen.getByLabelText(/title/i), "My ticket");

      // Click submit button
      await user.click(screen.getByRole("button", { name: /create ticket/i }));

      // Error message should appear for project field
      expect(screen.getByText("Please select a project")).toBeInTheDocument();

      // API should NOT have been called
      expect(createTicket).not.toHaveBeenCalled();
    });

    it("clears error when user provides valid input", async () => {
      const user = userEvent.setup();

      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Blur title without input to trigger error
      const titleInput = screen.getByLabelText(/title/i);
      await user.click(titleInput);
      await user.tab();

      // Error should be visible
      expect(screen.getByText("Title is required")).toBeInTheDocument();

      // Type a valid title
      await user.click(titleInput);
      await user.type(titleInput, "Valid title");

      // Error should disappear
      expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has proper aria attributes on modal", () => {
      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "create-ticket-title");
    });

    it("marks required fields with asterisk", () => {
      render(<CreateTicketModal isOpen={true} onClose={vi.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Title and Project are required
      const titleLabel = screen.getByText(/title/i).closest("label");
      const projectLabel = screen.getByText(/^project/i).closest("label");

      expect(titleLabel).toHaveTextContent("*");
      expect(projectLabel).toHaveTextContent("*");
    });
  });
});
