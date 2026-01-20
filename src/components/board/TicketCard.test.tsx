import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TicketCard } from "./TicketCard";
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
    // High priority should have red border
    expect(container.firstChild).toHaveClass("border-l-red-500");
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
});
