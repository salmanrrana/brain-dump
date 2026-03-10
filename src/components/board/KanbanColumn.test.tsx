import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import KanbanColumn from "./KanbanColumn";
import type { TicketStatus } from "../../api/tickets";

const useDroppableMock = vi.fn();

vi.mock("@dnd-kit/core", () => ({
  useDroppable: (...args: unknown[]) => useDroppableMock(...args),
}));

describe("KanbanColumn", () => {
  beforeEach(() => {
    useDroppableMock.mockReset();
    useDroppableMock.mockReturnValue({
      isOver: false,
      setNodeRef: vi.fn(),
    });
  });

  const defaultProps = {
    status: "todo" as TicketStatus,
    label: "To Do",
    count: 0,
    accentColor: "#3b82f6",
  };

  it("renders column header with label and count", () => {
    render(<KanbanColumn {...defaultProps} count={5} />);

    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByRole("region")).toHaveAttribute("aria-label", "To Do column, 5 tickets");
  });

  it("renders empty state when count is 0", () => {
    render(<KanbanColumn {...defaultProps} count={0} />);

    expect(screen.getByText("No tickets")).toBeInTheDocument();
  });

  it("registers the column content as a droppable target", () => {
    render(<KanbanColumn {...defaultProps} count={0} />);

    expect(useDroppableMock).toHaveBeenCalledWith({
      id: "todo",
      data: { status: "todo" },
    });
    expect(screen.getByTestId("column-todo-content")).toHaveAttribute("data-droppable", "todo");
  });

  it("renders children when provided", () => {
    render(
      <KanbanColumn {...defaultProps} count={2}>
        <div data-testid="ticket-1">Ticket 1</div>
        <div data-testid="ticket-2">Ticket 2</div>
      </KanbanColumn>
    );

    expect(screen.getByTestId("ticket-1")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-2")).toBeInTheDocument();
    expect(screen.queryByText("No tickets")).not.toBeInTheDocument();
  });
});
