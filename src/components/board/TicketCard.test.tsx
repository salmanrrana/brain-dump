import type { ReactElement } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToastProvider } from "../Toast";
import { TicketCard } from "./TicketCard";
import type { TicketSummary } from "../../api/tickets";

function renderCard(ui: ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

// Helper to create a minimal ticket with required fields
function createTicket(overrides: Partial<TicketSummary> = {}): TicketSummary {
  return {
    id: "test-ticket-1",
    title: "Test Ticket Title",
    status: "backlog",
    priority: "medium",
    position: 1,
    projectId: "project-1",
    epicId: null,
    tags: null,
    subtasks: null,
    isBlocked: false,
    blockedReason: null,
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
    renderCard(<TicketCard ticket={ticket} />);
    expect(screen.getByText("Test Ticket Title")).toBeInTheDocument();
  });

  it("renders priority indicator correctly", () => {
    const ticket = createTicket({ priority: "high" });
    const { container } = renderCard(<TicketCard ticket={ticket} />);
    // High priority should have danger accent border (uses CSS variable)
    expect(container.firstChild).toHaveClass("border-l-[var(--accent-danger)]");
  });

  it("renders tags correctly", () => {
    const ticket = createTicket({ tags: JSON.stringify(["tag1", "tag2"]) });
    renderCard(<TicketCard ticket={ticket} />);
    expect(screen.getByText("tag1")).toBeInTheDocument();
    expect(screen.getByText("tag2")).toBeInTheDocument();
  });

  it("renders overflow tag indicator when more than 3 tags", () => {
    const ticket = createTicket({
      tags: JSON.stringify(["tag1", "tag2", "tag3", "tag4", "tag5"]),
    });
    renderCard(<TicketCard ticket={ticket} />);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("renders git info correctly", () => {
    const ticket = createTicket({
      branchName: "feature/test-branch",
      prNumber: 123,
    });
    renderCard(<TicketCard ticket={ticket} />);
    expect(screen.getByText("test-branch")).toBeInTheDocument();
    expect(screen.getByText("#123")).toBeInTheDocument();
  });

  it("visibly flags blocked tickets with the blocked reason", () => {
    const ticket = createTicket({
      status: "ai_verification",
      isBlocked: true,
      blockedReason: "Verification failed 3 consecutive times on step 1.",
    });

    renderCard(<TicketCard ticket={ticket} />);

    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    expect(
      screen.getByText("Verification failed 3 consecutive times on step 1.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Verification Ready")).not.toBeInTheDocument();
  });

  it("distinguishes queued and running verification jobs on cards", () => {
    const queuedTicket = createTicket({
      status: "ai_verification",
      verificationJobStatus: "queued",
    });
    const runningTicket = createTicket({
      id: "test-ticket-2",
      title: "Running verification ticket",
      status: "ai_verification",
      verificationJobStatus: "running",
    });

    renderCard(
      <>
        <TicketCard ticket={queuedTicket} />
        <TicketCard ticket={runningTicket} />
      </>
    );

    expect(screen.getByText("Verification Queued")).toBeInTheDocument();
    expect(screen.getByText("Verification Running")).toBeInTheDocument();
  });

  it("flags blocked verification jobs even before the ticket blocked flag is set", () => {
    const ticket = createTicket({
      status: "ai_verification",
      isBlocked: false,
      verificationJobStatus: "dead",
      verificationJobLastError: "Verification worker exhausted retries.",
    });

    renderCard(<TicketCard ticket={ticket} />);

    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
    expect(screen.getByText("Verification worker exhausted retries.")).toBeInTheDocument();
    expect(screen.queryByText("Verification Blocked")).not.toBeInTheDocument();
  });
});
