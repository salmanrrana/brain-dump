import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import KanbanColumn from "./KanbanColumn";
import type { TicketStatus } from "../../api/tickets";

describe("KanbanColumn", () => {
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

  it("applies accent color to header indicator", () => {
    const accentColor = "rgb(255, 0, 0)";
    render(<KanbanColumn {...defaultProps} accentColor={accentColor} />);

    // The accent indicator is an empty span with aria-hidden="true"
    // We can find it by its style attribute or structure
    // Since we don't have a specific test id for the accent bar, we check style application
    // This is implicitly tested by visual inspection, but we can verify props passed
    // by snapshot or searching for the style
    const header = screen.getByText("To Do").parentElement;
    const accentBar = header?.firstChild as HTMLElement;
    expect(accentBar).toHaveStyle({ backgroundColor: accentColor });
  });

  it("has correct width constraints", () => {
    render(<KanbanColumn {...defaultProps} />);

    const column = screen.getByTestId("column-todo");
    expect(column).toHaveStyle({
      minWidth: "280px",
      maxWidth: "320px",
    });
  });

  it("exposes content area for drag and drop", () => {
    render(<KanbanColumn {...defaultProps} />);

    const content = screen.getByTestId("column-todo-content");
    expect(content).toBeInTheDocument();
    expect(content).toHaveAttribute("data-droppable", "todo");
  });
});
