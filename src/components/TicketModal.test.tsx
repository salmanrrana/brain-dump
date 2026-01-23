/**
 * Integration tests for TicketModal navigation functionality
 *
 * Following Kent C. Dodds testing philosophy:
 * - Test user behavior, not implementation details
 * - Verify what users SEE and DO
 * - Only mock at boundaries (server functions, navigation)
 *
 * Real user behaviors tested:
 * 1. User sees modal with ticket details
 * 2. User clicks navigation button
 * 3. User is navigated to ticket detail page
 * 4. Modal closes before navigation
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TicketModal from "./TicketModal";
import { ToastProvider } from "./Toast";

// Mock TanStack Router navigation
const mockNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock hooks at boundaries
vi.mock("../../lib/hooks", () => ({
  useModalKeyboard: vi.fn(),
  useClickOutside: vi.fn(),
  useDeleteTicket: vi.fn().mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  }),
  useTicketDeletePreview: vi.fn().mockReturnValue({
    data: null,
  }),
  useUpdateTicket: vi.fn().mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  }),
  useSettings: vi.fn().mockReturnValue({
    settings: null,
  }),
  useLaunchRalphForTicket: vi.fn().mockReturnValue({
    mutateAsync: vi.fn(),
  }),
  useComments: vi.fn().mockReturnValue({
    comments: [],
    loading: false,
  }),
  useCreateComment: vi.fn().mockReturnValue({
    mutate: vi.fn(),
  }),
  useTags: vi.fn().mockReturnValue({
    tags: [],
    loading: false,
  }),
  useAutoClearState: vi.fn().mockReturnValue(vi.fn()),
  useProjectServices: vi.fn().mockReturnValue({
    runningServices: [],
    error: null,
  }),
  useProjects: vi.fn().mockReturnValue({
    projects: [],
  }),
  useActiveRalphSessions: vi.fn().mockReturnValue({
    getSession: () => null,
  }),
}));

// Mock API functions
vi.mock("../../api/attachments", () => ({
  getAttachments: vi.fn().mockResolvedValue([]),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("../../api/context", () => ({
  getTicketContext: vi.fn(),
}));

vi.mock("../../api/terminal", () => ({
  launchClaudeInTerminal: vi.fn(),
  launchOpenCodeInTerminal: vi.fn(),
}));

// Mock safeJsonParse
vi.mock("../../lib/utils", () => ({
  safeJsonParse: vi.fn((json) => {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }),
}));

describe("TicketModal Navigation", () => {
  let queryClient: QueryClient;
  let mockOnClose: ReturnType<typeof vi.fn>;
  let mockOnUpdate: ReturnType<typeof vi.fn>;

  const mockTicket = {
    id: "ticket-123",
    title: "Test Ticket",
    description: "Test description",
    status: "backlog",
    priority: "medium",
    position: 1,
    projectId: "project-1",
    epicId: null,
    tags: null,
    subtasks: null,
    isBlocked: false,
    blockedReason: null,
    linkedFiles: null,
    attachments: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    completedAt: null,
    branchName: null,
    prNumber: null,
    prUrl: null,
    prStatus: null,
  };

  const mockEpics = [
    {
      id: "epic-1",
      title: "Test Epic",
      description: null,
      projectId: "project-1",
      color: null,
      createdAt: "2026-01-01",
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    mockOnClose = vi.fn();
    mockOnUpdate = vi.fn();
    mockNavigate.mockClear();
  });

  const renderModal = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <TicketModal
            ticket={mockTicket}
            epics={mockEpics}
            onClose={mockOnClose}
            onUpdate={mockOnUpdate}
          />
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  describe("Navigation Button", () => {
    it("renders navigation button with correct accessibility attributes", () => {
      renderModal();

      const navButton = screen.getByRole("button", { name: "View full ticket details" });
      expect(navButton).toBeInTheDocument();
      expect(navButton).toHaveAttribute("title", "View full ticket details");
    });

    it("closes modal and navigates to ticket detail page when clicked", async () => {
      const user = userEvent.setup();
      renderModal();

      const navButton = screen.getByRole("button", { name: "View full ticket details" });

      await user.click(navButton);

      // Should close modal first
      expect(mockOnClose).toHaveBeenCalledTimes(1);

      // Should navigate to ticket detail page
      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/ticket/ticket-123",
      });
    });

    it("navigates to correct ticket ID", async () => {
      const user = userEvent.setup();
      renderModal();

      const navButton = screen.getByRole("button", { name: "View full ticket details" });

      await user.click(navButton);

      expect(mockNavigate).toHaveBeenCalledWith({
        to: "/ticket/ticket-123",
      });
    });
  });

  describe("Modal State", () => {
    it("renders modal with ticket title in header", () => {
      renderModal();

      expect(screen.getByText("Edit Ticket")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Test Ticket")).toBeInTheDocument();
    });

    it("renders navigation button alongside close button", () => {
      renderModal();

      const navButton = screen.getByRole("button", { name: "View full ticket details" });
      const closeButton = screen.getByRole("button", { name: "Close modal" });

      // Both buttons should be in the header
      expect(navButton).toBeInTheDocument();
      expect(closeButton).toBeInTheDocument();
    });
  });
});
