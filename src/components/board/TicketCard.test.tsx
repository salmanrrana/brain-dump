import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketCard, type TicketEpicWorktreeInfo } from "./TicketCard";
import type { Ticket } from "../../lib/schema";

// Helper to create a minimal ticket with required fields
function createTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "test-ticket-1",
    title: "Test Ticket Title",
    description: null,
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
  it("renders ticket title", () => {
    const ticket = createTicket({ title: "Test Ticket Title" });
    render(<TicketCard ticket={ticket} />);
    expect(screen.getByText("Test Ticket Title")).toBeInTheDocument();
  });

  it("renders priority indicator correctly", () => {
    const ticket = createTicket({ priority: "high" });
    const { container } = render(<TicketCard ticket={ticket} />);
    // High priority should have danger accent border (uses CSS variable)
    expect(container.firstChild).toHaveClass("border-l-[var(--accent-danger)]");
  });

  it("renders tags correctly", () => {
    const ticket = createTicket({ tags: JSON.stringify(["tag1", "tag2"]) });
    render(<TicketCard ticket={ticket} />);
    expect(screen.getByText("tag1")).toBeInTheDocument();
    expect(screen.getByText("tag2")).toBeInTheDocument();
  });

  it("renders overflow tag indicator when more than 3 tags", () => {
    const ticket = createTicket({
      tags: JSON.stringify(["tag1", "tag2", "tag3", "tag4", "tag5"]),
    });
    render(<TicketCard ticket={ticket} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders git info correctly", () => {
    const ticket = createTicket({
      branchName: "feature/test-branch",
      prNumber: 123,
    });
    render(<TicketCard ticket={ticket} />);
    expect(screen.getByText("test-branch")).toBeInTheDocument();
    expect(screen.getByText("#123")).toBeInTheDocument();
  });

  describe("worktree indicator", () => {
    it("shows worktree badge when epic uses worktree isolation with active status", () => {
      const ticket = createTicket({ epicId: "epic-1" });
      const epicWorktreeInfo: TicketEpicWorktreeInfo = {
        isolationMode: "worktree",
        worktreeStatus: "active",
        worktreePath: "/Users/test/project-epic-worktree",
      };
      render(<TicketCard ticket={ticket} epicWorktreeInfo={epicWorktreeInfo} />);

      // User should see the worktree badge
      const badge = screen.getByRole("status");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent("worktree");
      expect(badge).toHaveAttribute("aria-label", "Isolation mode: worktree, status: active");
    });

    it("shows worktree badge with stale status indicator", () => {
      const ticket = createTicket({ epicId: "epic-1" });
      const epicWorktreeInfo: TicketEpicWorktreeInfo = {
        isolationMode: "worktree",
        worktreeStatus: "stale",
        worktreePath: "/Users/test/project-epic-worktree",
      };
      render(<TicketCard ticket={ticket} epicWorktreeInfo={epicWorktreeInfo} />);

      // User should see stale status in the badge
      const badge = screen.getByRole("status");
      expect(badge).toHaveTextContent("worktree (stale)");
      expect(badge).toHaveAttribute("aria-label", "Isolation mode: worktree, status: stale");
    });

    it("does not show worktree badge when epic uses branch isolation", () => {
      const ticket = createTicket({ epicId: "epic-1" });
      const epicWorktreeInfo: TicketEpicWorktreeInfo = {
        isolationMode: "branch",
      };
      render(<TicketCard ticket={ticket} epicWorktreeInfo={epicWorktreeInfo} />);

      // User should not see any worktree badge (branch mode is the default, no indicator needed)
      expect(screen.queryByText("worktree")).not.toBeInTheDocument();
    });

    it("does not show worktree badge when epicWorktreeInfo is null", () => {
      const ticket = createTicket({ epicId: "epic-1" });
      render(<TicketCard ticket={ticket} epicWorktreeInfo={null} />);

      // User should not see any worktree badge
      expect(screen.queryByText("worktree")).not.toBeInTheDocument();
    });

    it("does not show worktree badge when isolationMode is null", () => {
      const ticket = createTicket({ epicId: "epic-1" });
      const epicWorktreeInfo: TicketEpicWorktreeInfo = {
        isolationMode: null,
      };
      render(<TicketCard ticket={ticket} epicWorktreeInfo={epicWorktreeInfo} />);

      // User should not see any worktree badge
      expect(screen.queryByText("worktree")).not.toBeInTheDocument();
    });

    it("shows tooltip with worktree path when hovering", () => {
      const ticket = createTicket({ epicId: "epic-1" });
      const epicWorktreeInfo: TicketEpicWorktreeInfo = {
        isolationMode: "worktree",
        worktreeStatus: "active",
        worktreePath: "/Users/test/project-epic-worktree",
      };
      render(<TicketCard ticket={ticket} epicWorktreeInfo={epicWorktreeInfo} />);

      // User should be able to see the path in the tooltip
      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute(
        "title",
        expect.stringContaining("/Users/test/project-epic-worktree")
      );
    });
  });
});
