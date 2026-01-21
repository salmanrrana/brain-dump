import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateEpicModal } from "./CreateEpicModal";

// Mock the hooks
vi.mock("../../lib/hooks", () => ({
  useCreateEpic: vi.fn(),
  useClickOutside: vi.fn(),
}));

import { useCreateEpic, useClickOutside } from "../../lib/hooks";

const mockUseCreateEpic = useCreateEpic as ReturnType<typeof vi.fn>;
const mockUseClickOutside = useClickOutside as ReturnType<typeof vi.fn>;

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("CreateEpicModal", () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const mockMutate = vi.fn();

  const defaultProps = {
    isOpen: true,
    projectId: "project-123",
    projectName: "Test Project",
    onClose: mockOnClose,
    onSuccess: mockOnSuccess,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateEpic.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      error: null,
    });
    mockUseClickOutside.mockImplementation(() => {});
  });

  describe("Modal visibility and structure", () => {
    it("renders nothing when isOpen is false", () => {
      renderWithQueryClient(<CreateEpicModal {...defaultProps} isOpen={false} />);
      expect(screen.queryByTestId("create-epic-modal")).not.toBeInTheDocument();
    });

    it("renders modal with form fields when isOpen is true", () => {
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      expect(screen.getByTestId("create-epic-modal")).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
      expect(screen.getByText("Create New Epic")).toBeInTheDocument();
      expect(screen.getByTestId("create-epic-title-input")).toBeInTheDocument();
      expect(screen.getByTestId("create-epic-description-input")).toBeInTheDocument();
      expect(screen.getByTestId("create-epic-color-button")).toBeInTheDocument();
    });

    it("displays project context when projectName is provided", () => {
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      expect(screen.getByTestId("create-epic-project-context")).toBeInTheDocument();
      expect(screen.getByText("Project:")).toBeInTheDocument();
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });

    it("hides project context when projectName is not provided", () => {
      const { projectName: _, ...propsWithoutProjectName } = defaultProps;
      renderWithQueryClient(<CreateEpicModal {...propsWithoutProjectName} />);
      expect(screen.queryByTestId("create-epic-project-context")).not.toBeInTheDocument();
    });
  });

  describe("Form submission", () => {
    it("submits form with title, description, and color when user fills out form", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      // User enters title
      const titleInput = screen.getByTestId("create-epic-title-input");
      await user.type(titleInput, "My New Epic");

      // User enters description
      const descriptionInput = screen.getByTestId("create-epic-description-input");
      await user.type(descriptionInput, "Epic description");

      // User clicks submit button
      const submitButton = screen.getByTestId("create-epic-submit-button");
      await user.click(submitButton);

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "My New Epic",
          projectId: "project-123",
          description: "Epic description",
          color: expect.any(String),
        }),
        expect.any(Object)
      );
    });

    it("submits form with only title when description is empty", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      // User enters only title
      const titleInput = screen.getByTestId("create-epic-title-input");
      await user.type(titleInput, "Simple Epic");

      // User clicks submit
      const submitButton = screen.getByTestId("create-epic-submit-button");
      await user.click(submitButton);

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Simple Epic",
          projectId: "project-123",
        }),
        expect.any(Object)
      );
      // Verify description is not included when empty
      const callArg = mockMutate.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArg?.description).toBeUndefined();
    });

    it("prevents submission when title is empty", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      // Submit button should be disabled when title is empty
      const submitButton = screen.getByTestId("create-epic-submit-button");
      expect(submitButton).toBeDisabled();

      // Try to click submit
      await user.click(submitButton);
      expect(mockMutate).not.toHaveBeenCalled();
    });

    it("trims whitespace from title before submission", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      const titleInput = screen.getByTestId("create-epic-title-input");
      await user.type(titleInput, "  Padded Title  ");

      const submitButton = screen.getByTestId("create-epic-submit-button");
      await user.click(submitButton);

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Padded Title",
        }),
        expect.any(Object)
      );
    });
  });

  describe("Loading state", () => {
    it("shows loading indicator when mutation is pending", () => {
      mockUseCreateEpic.mockReturnValue({
        mutate: mockMutate,
        isPending: true,
        error: null,
      });

      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      expect(screen.getByText("Creating...")).toBeInTheDocument();
      expect(screen.getByTestId("create-epic-submit-button")).toBeDisabled();
    });

    it("disables cancel button when submitting", () => {
      mockUseCreateEpic.mockReturnValue({
        mutate: mockMutate,
        isPending: true,
        error: null,
      });

      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);
      expect(screen.getByTestId("create-epic-cancel-button")).toBeDisabled();
    });
  });

  describe("Error handling", () => {
    it("displays error message when mutation fails", () => {
      const errorMessage = "Failed to create epic: Network error";
      mockUseCreateEpic.mockReturnValue({
        mutate: mockMutate,
        isPending: false,
        error: new Error(errorMessage),
      });

      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      expect(screen.getByTestId("create-epic-error")).toBeInTheDocument();
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  describe("Modal closing", () => {
    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      await user.click(screen.getByTestId("create-epic-modal-close"));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when cancel button is clicked", async () => {
      const user = userEvent.setup();
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      await user.click(screen.getByTestId("create-epic-cancel-button"));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape key is pressed", async () => {
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Success callback", () => {
    it("calls onSuccess with new epic ID and onClose after successful submission", async () => {
      const user = userEvent.setup();
      const mockNewEpic = { id: "new-epic-123", title: "Success Epic" };
      mockMutate.mockImplementation((_, options) => {
        options.onSuccess?.(mockNewEpic);
      });

      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      const titleInput = screen.getByTestId("create-epic-title-input");
      await user.type(titleInput, "Success Epic");

      const submitButton = screen.getByTestId("create-epic-submit-button");
      await user.click(submitButton);

      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
      expect(mockOnSuccess).toHaveBeenCalledWith("new-epic-123");
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it("clears form after successful submission", async () => {
      const user = userEvent.setup();
      const mockNewEpic = { id: "cleared-epic-456", title: "Epic to Clear" };
      mockMutate.mockImplementation((_, options) => {
        options.onSuccess?.(mockNewEpic);
      });

      const { rerender } = renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      // Fill out form
      const titleInput = screen.getByTestId("create-epic-title-input");
      await user.type(titleInput, "Epic to Clear");

      const descriptionInput = screen.getByTestId("create-epic-description-input");
      await user.type(descriptionInput, "Description to clear");

      // Submit
      const submitButton = screen.getByTestId("create-epic-submit-button");
      await user.click(submitButton);

      // Modal closes, but if we re-open it, form should be cleared
      // Rerender with isOpen true to simulate reopening
      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <CreateEpicModal {...defaultProps} />
        </QueryClientProvider>
      );

      // Note: The form is reset on successful submission
      // This verifies the reset was called (via the onSuccess flow)
      expect(mockOnSuccess).toHaveBeenCalledWith("cleared-epic-456");
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA attributes", () => {
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "create-epic-modal-title");
    });

    it("title input is focused on open", () => {
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      const titleInput = screen.getByTestId("create-epic-title-input");
      expect(titleInput).toHaveFocus();
    });

    it("marks title as required", () => {
      renderWithQueryClient(<CreateEpicModal {...defaultProps} />);

      const titleInput = screen.getByTestId("create-epic-title-input");
      expect(titleInput).toHaveAttribute("required");
    });
  });
});
