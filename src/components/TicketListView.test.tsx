import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import type { TicketSummary } from "../api/tickets";
import TicketListView from "./TicketListView";

vi.mock("./board/CopyableTag", () => ({
  CopyableTag: ({
    tag,
    onClick,
    onPointerDown,
    onKeyDown,
  }: {
    tag: string;
    onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
    onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void;
    onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  }) => (
    <button type="button" onClick={onClick} onPointerDown={onPointerDown} onKeyDown={onKeyDown}>
      {tag}
    </button>
  ),
}));

function createTicket(overrides: Partial<TicketSummary>): TicketSummary {
  return {
    id: "ticket-1",
    title: "First ticket",
    status: "backlog",
    priority: "medium",
    position: 1,
    epicId: "epic-1",
    projectId: "project-1",
    createdAt: "2026-04-01T12:00:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z",
    completedAt: null,
    isBlocked: false,
    blockedReason: null,
    tags: JSON.stringify(["frontend", "performance"]),
    subtasks: JSON.stringify([{ completed: true }, { completed: false }]),
    branchName: null,
    prNumber: null,
    prUrl: null,
    prStatus: null,
    ...overrides,
  } as TicketSummary;
}

describe("TicketListView", () => {
  it("renders ticket details and opens the clicked ticket", async () => {
    const user = userEvent.setup();
    const onTicketClick = vi.fn();
    const ticket = createTicket({});

    render(
      <TicketListView
        tickets={[ticket]}
        epics={[{ id: "epic-1", title: "Performance epic" }]}
        onTicketClick={onTicketClick}
      />
    );

    expect(screen.getByText("First ticket")).toBeInTheDocument();
    expect(screen.getByText("Performance epic")).toBeInTheDocument();
    expect(screen.getByText("Apr 1, 2026")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();

    await user.click(screen.getByText("First ticket"));

    expect(onTicketClick).toHaveBeenCalledWith(ticket);
  });

  it("keeps tag clicks from opening the ticket row", async () => {
    const user = userEvent.setup();
    const onTicketClick = vi.fn();

    render(
      <TicketListView tickets={[createTicket({})]} epics={[]} onTicketClick={onTicketClick} />
    );

    await user.click(screen.getByText("frontend"));

    expect(onTicketClick).not.toHaveBeenCalled();
  });
});
