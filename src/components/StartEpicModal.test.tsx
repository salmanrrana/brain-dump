import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StartEpicModal, type StartEpicModalProps } from "./StartEpicModal";

// Mock the hooks
const mockUpdateEpicMutate = vi.fn();
const mockUpdateProjectMutate = vi.fn();

vi.mock("../lib/hooks", () => ({
  useClickOutside: vi.fn(),
  useUpdateEpic: () => ({
    mutateAsync: mockUpdateEpicMutate,
    isPending: false,
    error: null,
  }),
  useUpdateProject: () => ({
    mutateAsync: mockUpdateProjectMutate,
    isPending: false,
    error: null,
  }),
}));

// Create a wrapper with QueryClient for testing
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Default props for testing
const defaultEpic = {
  id: "epic-123-456-789",
  title: "Git Worktree Integration",
  isolationMode: null as "branch" | "worktree" | null,
};

const defaultProject = {
  id: "proj-abc-def",
  name: "Brain Dump",
  path: "/Users/dev/brain-dump",
  defaultIsolationMode: null as "branch" | "worktree" | "ask" | null,
};

function renderModal(props: Partial<StartEpicModalProps> = {}) {
  const defaultProps: StartEpicModalProps = {
    isOpen: true,
    epic: defaultEpic,
    project: defaultProject,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...props,
  };

  return render(<StartEpicModal {...defaultProps} />, { wrapper: createWrapper() });
}

describe("StartEpicModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEpicMutate.mockResolvedValue({});
    mockUpdateProjectMutate.mockResolvedValue({});
  });

  describe("rendering", () => {
    it("renders nothing when closed", () => {
      const { container } = renderModal({ isOpen: false });
      expect(container).toBeEmptyDOMElement();
    });

    it("renders the modal when open", () => {
      renderModal();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("displays the epic title in the header", () => {
      renderModal();
      expect(screen.getByText(/Git Worktree Integration/)).toBeInTheDocument();
    });

    it("renders both isolation mode options", () => {
      renderModal();
      expect(screen.getByTestId("start-epic-option-branch")).toBeInTheDocument();
      expect(screen.getByTestId("start-epic-option-worktree")).toBeInTheDocument();
    });

    it("displays branch option with correct description", () => {
      renderModal();
      const branchOption = screen.getByTestId("start-epic-option-branch");
      expect(within(branchOption).getByText("Branch (Default)")).toBeInTheDocument();
      expect(within(branchOption).getByText(/Work in current directory/)).toBeInTheDocument();
    });

    it("displays worktree option with correct description", () => {
      renderModal();
      const worktreeOption = screen.getByTestId("start-epic-option-worktree");
      expect(within(worktreeOption).getByText("Worktree (Isolated)")).toBeInTheDocument();
      expect(within(worktreeOption).getByText(/Create separate directory/)).toBeInTheDocument();
    });

    it("shows worktree path preview", () => {
      renderModal();
      const pathPreview = screen.getByTestId("worktree-path-preview");
      // Path should contain the project name and epic short id and slugified title
      expect(pathPreview).toHaveTextContent(/brain-dump-epic-epic-123-git-worktree/);
    });

    it("renders remember checkbox", () => {
      renderModal();
      expect(screen.getByTestId("start-epic-remember-checkbox")).toBeInTheDocument();
    });

    it("renders cancel and submit buttons", () => {
      renderModal();
      expect(screen.getByTestId("start-epic-cancel-button")).toBeInTheDocument();
      expect(screen.getByTestId("start-epic-submit-button")).toBeInTheDocument();
    });
  });

  describe("initial selection", () => {
    it("defaults to branch when no mode is set", () => {
      renderModal();
      const branchOption = screen.getByTestId("start-epic-option-branch");
      const radioInput = within(branchOption).getByRole("radio");
      expect(radioInput).toBeChecked();
    });

    it("selects branch when epic has branch mode", () => {
      renderModal({
        epic: { ...defaultEpic, isolationMode: "branch" },
      });
      const branchOption = screen.getByTestId("start-epic-option-branch");
      const radioInput = within(branchOption).getByRole("radio");
      expect(radioInput).toBeChecked();
    });

    it("selects worktree when epic has worktree mode", () => {
      renderModal({
        epic: { ...defaultEpic, isolationMode: "worktree" },
      });
      const worktreeOption = screen.getByTestId("start-epic-option-worktree");
      const radioInput = within(worktreeOption).getByRole("radio");
      expect(radioInput).toBeChecked();
    });

    it("respects project default when epic has no mode", () => {
      renderModal({
        project: { ...defaultProject, defaultIsolationMode: "worktree" },
      });
      const worktreeOption = screen.getByTestId("start-epic-option-worktree");
      const radioInput = within(worktreeOption).getByRole("radio");
      expect(radioInput).toBeChecked();
    });
  });

  describe("user interactions", () => {
    it("can select worktree option", async () => {
      const user = userEvent.setup();
      renderModal();

      const worktreeOption = screen.getByTestId("start-epic-option-worktree");
      await user.click(worktreeOption);

      const radioInput = within(worktreeOption).getByRole("radio");
      expect(radioInput).toBeChecked();
    });

    it("can toggle remember checkbox", async () => {
      const user = userEvent.setup();
      renderModal();

      const checkbox = screen.getByTestId("start-epic-remember-checkbox").querySelector("input")!;
      expect(checkbox).not.toBeChecked();

      await user.click(checkbox);
      expect(checkbox).toBeChecked();
    });

    it("calls onClose when cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      await user.click(screen.getByTestId("start-epic-cancel-button"));
      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when close button is clicked", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      await user.click(screen.getByTestId("start-epic-modal-close"));
      expect(onClose).toHaveBeenCalled();
    });

    it("closes on Escape key", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      // Global escape handler should work without focusing the modal
      await user.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("form submission", () => {
    it("updates epic isolation mode on submit", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      renderModal({ onConfirm });

      // Select worktree option
      const worktreeOption = screen.getByTestId("start-epic-option-worktree");
      await user.click(worktreeOption);

      // Submit
      await user.click(screen.getByTestId("start-epic-submit-button"));

      await waitFor(() => {
        expect(mockUpdateEpicMutate).toHaveBeenCalledWith({
          id: "epic-123-456-789",
          updates: { isolationMode: "worktree" },
        });
      });
    });

    it("updates project default when remember is checked", async () => {
      const user = userEvent.setup();
      renderModal();

      // Select worktree option
      const worktreeOption = screen.getByTestId("start-epic-option-worktree");
      await user.click(worktreeOption);

      // Check remember
      const checkbox = screen.getByTestId("start-epic-remember-checkbox").querySelector("input")!;
      await user.click(checkbox);

      // Submit
      await user.click(screen.getByTestId("start-epic-submit-button"));

      await waitFor(() => {
        expect(mockUpdateProjectMutate).toHaveBeenCalledWith({
          id: "proj-abc-def",
          updates: { defaultIsolationMode: "worktree" },
        });
      });
    });

    it("does not update project default when remember is unchecked", async () => {
      const user = userEvent.setup();
      renderModal();

      // Submit without checking remember
      await user.click(screen.getByTestId("start-epic-submit-button"));

      await waitFor(() => {
        expect(mockUpdateEpicMutate).toHaveBeenCalled();
      });
      expect(mockUpdateProjectMutate).not.toHaveBeenCalled();
    });

    it("calls onConfirm with epic id and selected mode", async () => {
      const user = userEvent.setup();
      const onConfirm = vi.fn();
      renderModal({ onConfirm });

      // Select worktree option
      const worktreeOption = screen.getByTestId("start-epic-option-worktree");
      await user.click(worktreeOption);

      // Submit
      await user.click(screen.getByTestId("start-epic-submit-button"));

      await waitFor(() => {
        expect(onConfirm).toHaveBeenCalledWith("epic-123-456-789", "worktree");
      });
    });

    it("calls onClose after successful submission", async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ onClose });

      await user.click(screen.getByTestId("start-epic-submit-button"));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
      });
    });
  });

  describe("accessibility", () => {
    it("has correct dialog role and aria attributes", () => {
      renderModal();
      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(dialog).toHaveAttribute("aria-labelledby", "start-epic-modal-title");
    });

    it("close button has aria-label", () => {
      renderModal();
      const closeButton = screen.getByTestId("start-epic-modal-close");
      expect(closeButton).toHaveAttribute("aria-label", "Close modal");
    });

    it("radio inputs are accessible", () => {
      renderModal();
      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(2);
    });
  });

  describe("worktree path preview", () => {
    it("generates correct path format", () => {
      renderModal({
        epic: { ...defaultEpic, id: "abc12345-6789-0000-0000-000000000000" },
        project: { ...defaultProject, path: "/Users/dev/my-project" },
      });

      const pathPreview = screen.getByTestId("worktree-path-preview");
      // Should contain project name and short epic id
      expect(pathPreview.textContent).toMatch(/my-project-epic-abc12345/);
    });

    it("slugifies epic title in path", () => {
      renderModal({
        epic: { ...defaultEpic, title: "Add User Authentication!" },
      });

      const pathPreview = screen.getByTestId("worktree-path-preview");
      // Should have slugified title without special characters
      expect(pathPreview.textContent).toMatch(/add-user-authentication/);
    });
  });
});
