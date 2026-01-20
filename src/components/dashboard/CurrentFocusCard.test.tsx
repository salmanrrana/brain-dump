import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrentFocusCard } from "./CurrentFocusCard";
import type { Ticket } from "../../lib/hooks";
import type { ActiveRalphSession } from "../../api/ralph";

// Mock ticket for testing
const mockTicket: Ticket = {
  id: "ticket-123",
  title: "Implement dark mode toggle",
  description:
    "Adding theme switching functionality to allow users to toggle between light and dark themes. This feature requires extensive testing and validation across all components.",
  status: "in_progress",
  priority: "high",
  position: 1,
  projectId: "project-1",
  epicId: null,
  tags: null,
  subtasks: JSON.stringify([
    { id: "1", text: "Add theme context", completed: true },
    { id: "2", text: "Create toggle component", completed: true },
    { id: "3", text: "Style dark mode", completed: true },
    { id: "4", text: "Persist preference", completed: false },
    { id: "5", text: "Add tests", completed: false },
  ]),
  isBlocked: false,
  blockedReason: null,
  linkedFiles: null,
  attachments: null,
  createdAt: "2026-01-20T10:00:00Z",
  updatedAt: "2026-01-20T12:00:00Z",
  completedAt: null,
  branchName: "feature/dark-mode",
  prNumber: null,
  prUrl: null,
  prStatus: null,
};

// Mock session that started 2 hours ago
const mockSession: ActiveRalphSession = {
  id: "session-456",
  ticketId: "ticket-123",
  currentState: "implementing",
  startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  stateHistory: [
    { state: "idle", timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { state: "analyzing", timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString() },
    { state: "implementing", timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString() },
  ],
};

describe("CurrentFocusCard", () => {
  describe("Rendering with ticket", () => {
    it("renders the card with header", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      expect(screen.getByText("Current Focus")).toBeInTheDocument();
      expect(screen.getByTestId("current-focus-card")).toBeInTheDocument();
    });

    it("displays the ticket title", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      expect(screen.getByText("Implement dark mode toggle")).toBeInTheDocument();
    });

    it("displays the description preview (truncated)", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      const description = screen.getByTestId("ticket-description");
      expect(description).toHaveTextContent("Adding theme switching functionality");
      expect(description).toHaveTextContent("...");
    });

    it("does not show description when ticket has none", () => {
      const ticketWithoutDesc = { ...mockTicket, description: null };
      render(<CurrentFocusCard ticket={ticketWithoutDesc} />);

      expect(screen.queryByTestId("ticket-description")).not.toBeInTheDocument();
    });

    it("displays subtask progress bar", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      const progress = screen.getByTestId("subtask-progress");
      expect(progress).toBeInTheDocument();
      expect(progress).toHaveTextContent("3/5 subtasks");
    });

    it("has accessible progressbar role", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "60");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });

    it("does not show progress bar when no subtasks", () => {
      const ticketWithoutSubtasks = { ...mockTicket, subtasks: null };
      render(<CurrentFocusCard ticket={ticketWithoutSubtasks} />);

      expect(screen.queryByTestId("subtask-progress")).not.toBeInTheDocument();
    });

    it("handles malformed subtasks JSON gracefully", () => {
      const ticketWithBadJson = { ...mockTicket, subtasks: "not-valid-json" };
      render(<CurrentFocusCard ticket={ticketWithBadJson} />);

      // Should not crash and should not show progress
      expect(screen.queryByTestId("subtask-progress")).not.toBeInTheDocument();
    });
  });

  describe("AI Active indicator", () => {
    it("shows AI indicator when session is provided", () => {
      render(<CurrentFocusCard ticket={mockTicket} session={mockSession} />);

      expect(screen.getByTestId("ai-indicator")).toBeInTheDocument();
    });

    it("does not show AI indicator when no session", () => {
      render(<CurrentFocusCard ticket={mockTicket} session={null} />);

      expect(screen.queryByTestId("ai-indicator")).not.toBeInTheDocument();
    });

    it("has accessible label for AI indicator", () => {
      render(<CurrentFocusCard ticket={mockTicket} session={mockSession} />);

      expect(screen.getByLabelText("AI is actively working on this ticket")).toBeInTheDocument();
    });
  });

  describe("Time since started", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("shows time since started when session provided", () => {
      const now = new Date("2026-01-20T14:00:00Z");
      vi.setSystemTime(now);

      const session: ActiveRalphSession = {
        ...mockSession,
        startedAt: "2026-01-20T12:00:00Z", // 2 hours ago
      };

      render(<CurrentFocusCard ticket={mockTicket} session={session} />);

      expect(screen.getByTestId("time-started")).toHaveTextContent("Started 2h ago");
    });

    it("shows minutes when less than 1 hour", () => {
      const now = new Date("2026-01-20T14:00:00Z");
      vi.setSystemTime(now);

      const session: ActiveRalphSession = {
        ...mockSession,
        startedAt: "2026-01-20T13:30:00Z", // 30 minutes ago
      };

      render(<CurrentFocusCard ticket={mockTicket} session={session} />);

      expect(screen.getByTestId("time-started")).toHaveTextContent("Started 30m ago");
    });

    it("shows days when more than 24 hours", () => {
      const now = new Date("2026-01-22T14:00:00Z");
      vi.setSystemTime(now);

      const session: ActiveRalphSession = {
        ...mockSession,
        startedAt: "2026-01-20T12:00:00Z", // 2 days ago
      };

      render(<CurrentFocusCard ticket={mockTicket} session={session} />);

      expect(screen.getByTestId("time-started")).toHaveTextContent("Started 2d ago");
    });

    it('shows "Just started" for very recent sessions', () => {
      const now = new Date("2026-01-20T14:00:00Z");
      vi.setSystemTime(now);

      const session: ActiveRalphSession = {
        ...mockSession,
        startedAt: "2026-01-20T14:00:00Z", // Just now
      };

      render(<CurrentFocusCard ticket={mockTicket} session={session} />);

      expect(screen.getByTestId("time-started")).toHaveTextContent("Just started");
    });

    it("does not show time when no session", () => {
      render(<CurrentFocusCard ticket={mockTicket} session={null} />);

      expect(screen.queryByTestId("time-started")).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no ticket", () => {
      render(<CurrentFocusCard ticket={null} />);

      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
      expect(screen.getByText("No active focus")).toBeInTheDocument();
      expect(screen.getByText("Start working on a ticket to see it here")).toBeInTheDocument();
    });

    it("does not show ticket content in empty state", () => {
      render(<CurrentFocusCard ticket={null} />);

      expect(screen.queryByTestId("focus-ticket")).not.toBeInTheDocument();
    });
  });

  describe("Click interactions", () => {
    it("calls onClick with ticket ID when card is clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<CurrentFocusCard ticket={mockTicket} onClick={handleClick} />);

      await user.click(screen.getByTestId("focus-ticket"));

      expect(handleClick).toHaveBeenCalledWith("ticket-123");
    });

    it("does not crash when clicked without handler", async () => {
      const user = userEvent.setup();
      render(<CurrentFocusCard ticket={mockTicket} />);

      // Should not throw
      await user.click(screen.getByTestId("focus-ticket"));
    });
  });

  describe("Keyboard navigation", () => {
    it("triggers click on Enter key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<CurrentFocusCard ticket={mockTicket} onClick={handleClick} />);

      const focusTicket = screen.getByTestId("focus-ticket");
      focusTicket.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledWith("ticket-123");
    });

    it("triggers click on Space key", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<CurrentFocusCard ticket={mockTicket} onClick={handleClick} />);

      const focusTicket = screen.getByTestId("focus-ticket");
      focusTicket.focus();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledWith("ticket-123");
    });

    it("has button role when onClick provided", () => {
      render(<CurrentFocusCard ticket={mockTicket} onClick={vi.fn()} />);

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("is focusable when onClick provided", () => {
      render(<CurrentFocusCard ticket={mockTicket} onClick={vi.fn()} />);

      expect(screen.getByTestId("focus-ticket")).toHaveAttribute("tabindex", "0");
    });

    it("is not focusable when onClick not provided", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      expect(screen.getByTestId("focus-ticket")).not.toHaveAttribute("tabindex");
    });
  });

  describe("Accessibility", () => {
    it("has accessible heading", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      expect(screen.getByRole("heading", { name: "Current Focus" })).toBeInTheDocument();
    });

    it("has section landmark", () => {
      render(<CurrentFocusCard ticket={mockTicket} />);

      const section = screen.getByTestId("current-focus-card");
      expect(section.tagName).toBe("SECTION");
    });

    it("has accessible label when clickable", () => {
      render(<CurrentFocusCard ticket={mockTicket} onClick={vi.fn()} />);

      expect(screen.getByLabelText("View ticket: Implement dark mode toggle")).toBeInTheDocument();
    });
  });
});
