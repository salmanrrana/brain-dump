import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketCard } from "./TicketCard";
import type { Ticket } from "../../lib/hooks";

// Helper to create a minimal ticket with required fields
function createTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "test-ticket-1",
    title: "Test Ticket Title",
    description: null,
    status: "backlog",
    priority: null,
    position: 1,
    projectId: "project-1",
    epicId: null,
    tags: null,
    subtasks: null,
    isBlocked: false,
    blockedReason: null,
    linkedFiles: null,
    attachments: null,
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
    completedAt: null,
    branchName: null,
    prNumber: null,
    prUrl: null,
    prStatus: null,
    ...overrides,
  };
}

describe("TicketCard", () => {
  describe("Title display", () => {
    it("renders ticket title", () => {
      const ticket = createTicket({ title: "Implement user authentication" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByText("Implement user authentication")).toBeInTheDocument();
    });

    it("renders long titles (truncation is CSS-handled)", () => {
      const longTitle =
        "This is a very long ticket title that should be truncated to two lines by CSS line-clamp";
      const ticket = createTicket({ title: longTitle });
      render(<TicketCard ticket={ticket} />);

      // Title should be present in the DOM
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });
  });

  describe("Priority indicator", () => {
    it("applies high priority data attribute", () => {
      const ticket = createTicket({ priority: "high" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("data-priority", "high");
    });

    it("applies medium priority data attribute", () => {
      const ticket = createTicket({ priority: "medium" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("data-priority", "medium");
    });

    it("applies low priority data attribute for low priority tickets", () => {
      const ticket = createTicket({ priority: "low" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("data-priority", "low");
    });

    it("defaults to low priority when priority is null", () => {
      const ticket = createTicket({ priority: null });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("data-priority", "low");
    });
  });

  describe("Tags display", () => {
    it("does not render tags row when ticket has no tags", () => {
      const ticket = createTicket({ tags: null });
      render(<TicketCard ticket={ticket} />);

      expect(screen.queryByTestId("tags-row")).not.toBeInTheDocument();
    });

    it("does not render tags row when tags is empty array", () => {
      const ticket = createTicket({ tags: "[]" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.queryByTestId("tags-row")).not.toBeInTheDocument();
    });

    it("renders single tag", () => {
      const ticket = createTicket({ tags: '["auth"]' });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByText("auth")).toBeInTheDocument();
    });

    it("renders up to 3 tags", () => {
      const ticket = createTicket({ tags: '["auth", "backend", "api"]' });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByText("auth")).toBeInTheDocument();
      expect(screen.getByText("backend")).toBeInTheDocument();
      expect(screen.getByText("api")).toBeInTheDocument();
    });

    it("shows overflow indicator when more than 3 tags", () => {
      const ticket = createTicket({ tags: '["auth", "backend", "api", "security", "middleware"]' });
      render(<TicketCard ticket={ticket} />);

      // Should show first 3 tags
      expect(screen.getByText("auth")).toBeInTheDocument();
      expect(screen.getByText("backend")).toBeInTheDocument();
      expect(screen.getByText("api")).toBeInTheDocument();

      // Should show +2 indicator
      expect(screen.getByText("+2")).toBeInTheDocument();
      expect(screen.getByTestId("tags-overflow")).toBeInTheDocument();
    });

    it("overflow indicator has tooltip with remaining tags", () => {
      const ticket = createTicket({ tags: '["auth", "backend", "api", "security", "middleware"]' });
      render(<TicketCard ticket={ticket} />);

      const overflow = screen.getByTestId("tags-overflow");
      expect(overflow).toHaveAttribute("title", "security, middleware");
    });

    it("handles malformed tags JSON gracefully", () => {
      const ticket = createTicket({ tags: "invalid json" });
      render(<TicketCard ticket={ticket} />);

      // Should not crash and should not render tags row
      expect(screen.queryByTestId("tags-row")).not.toBeInTheDocument();
    });
  });

  describe("Git info display", () => {
    it("does not render git info when no branch or PR", () => {
      const ticket = createTicket({ branchName: null, prNumber: null });
      render(<TicketCard ticket={ticket} />);

      expect(screen.queryByTestId("git-info")).not.toBeInTheDocument();
    });

    it("renders branch name", () => {
      const ticket = createTicket({ branchName: "feature/auth" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByText("feature/auth")).toBeInTheDocument();
    });

    it("truncates long branch names", () => {
      const longBranch = "feature/very-long-branch-name-that-should-be-truncated";
      const ticket = createTicket({ branchName: longBranch });
      render(<TicketCard ticket={ticket} />);

      // Truncation shows first 8 + ... + last 8 characters
      // "feature/very-long-branch-name-that-should-be-truncated" -> "feature/...runcated"
      expect(screen.getByText("feature/...runcated")).toBeInTheDocument();
    });

    it("renders PR number with hash prefix", () => {
      const ticket = createTicket({ prNumber: 42 });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByText("#42")).toBeInTheDocument();
    });

    it("renders PR status dot for open PR", () => {
      const ticket = createTicket({ prNumber: 42, prStatus: "open" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("pr-status-dot")).toBeInTheDocument();
      expect(screen.getByTestId("pr-status-dot")).toHaveAttribute("aria-label", "PR status: open");
    });

    it("renders PR status dot for merged PR", () => {
      const ticket = createTicket({ prNumber: 42, prStatus: "merged" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("pr-status-dot")).toBeInTheDocument();
      expect(screen.getByTestId("pr-status-dot")).toHaveAttribute(
        "aria-label",
        "PR status: merged"
      );
    });

    it("renders both branch and PR when both present", () => {
      const ticket = createTicket({
        branchName: "feature/auth",
        prNumber: 42,
        prStatus: "open",
      });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByText("feature/auth")).toBeInTheDocument();
      expect(screen.getByText("#42")).toBeInTheDocument();
      expect(screen.getByTestId("pr-status-dot")).toBeInTheDocument();
    });
  });

  describe("Click interaction", () => {
    it("calls onClick handler when clicked", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const ticket = createTicket();

      render(<TicketCard ticket={ticket} onClick={handleClick} />);
      await user.click(screen.getByTestId("ticket-card"));

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(handleClick).toHaveBeenCalledWith(ticket);
    });

    it("does not call onClick when handler is not provided", async () => {
      const user = userEvent.setup();
      const ticket = createTicket();

      render(<TicketCard ticket={ticket} />);
      await user.click(screen.getByTestId("ticket-card"));

      // Should not throw
    });

    it("has button role when onClick is provided", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} onClick={() => {}} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("role", "button");
    });

    it("has article role when onClick is not provided", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("role", "article");
    });

    it("is focusable when onClick is provided", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} onClick={() => {}} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("tabIndex", "0");
    });

    it("is not focusable when onClick is not provided", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("ticket-card")).not.toHaveAttribute("tabIndex");
    });
  });

  describe("Keyboard accessibility", () => {
    it("triggers onClick on Enter key press", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const ticket = createTicket();

      render(<TicketCard ticket={ticket} onClick={handleClick} />);
      const card = screen.getByTestId("ticket-card");
      card.focus();
      await user.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("triggers onClick on Space key press", async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      const ticket = createTicket();

      render(<TicketCard ticket={ticket} onClick={handleClick} />);
      const card = screen.getByTestId("ticket-card");
      card.focus();
      await user.keyboard(" ");

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("has accessible label for interactive cards", () => {
      const ticket = createTicket({ title: "My Task" });
      render(<TicketCard ticket={ticket} onClick={() => {}} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute(
        "aria-label",
        "View ticket: My Task"
      );
    });

    it("has accessible label for non-interactive cards", () => {
      const ticket = createTicket({ title: "My Task" });
      render(<TicketCard ticket={ticket} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("aria-label", "Ticket: My Task");
    });
  });

  describe("AI active state", () => {
    it("shows ai-active class when isAiActive is true", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} isAiActive={true} />);

      expect(screen.getByTestId("ticket-card")).toHaveClass("ai-active");
    });

    it("sets data-ai-active attribute when AI is active", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} isAiActive={true} />);

      expect(screen.getByTestId("ticket-card")).toHaveAttribute("data-ai-active");
    });

    it("does not have ai-active class when isAiActive is false", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} isAiActive={false} />);

      expect(screen.getByTestId("ticket-card")).not.toHaveClass("ai-active");
    });

    it("does not have data-ai-active attribute when AI is not active", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} isAiActive={false} />);

      expect(screen.getByTestId("ticket-card")).not.toHaveAttribute("data-ai-active");
    });
  });

  describe("Overlay mode", () => {
    it("applies isOverlay prop without crashing", () => {
      const ticket = createTicket();
      render(<TicketCard ticket={ticket} isOverlay={true} />);

      // Just verify it renders - actual styling is CSS
      expect(screen.getByTestId("ticket-card")).toBeInTheDocument();
    });
  });
});
