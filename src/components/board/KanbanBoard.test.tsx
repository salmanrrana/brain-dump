import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KanbanBoard } from "./KanbanBoard";
import * as hooks from "../../lib/hooks";
import type { Ticket } from "../../lib/schema";

// Mock the useTickets hook
vi.mock("../../lib/hooks", () => ({
  useTickets: vi.fn(),
}));

// Mock the TicketCard component to simplify testing
vi.mock("./TicketCard", () => ({
  TicketCard: ({
    ticket,
    onClick,
  }: {
    ticket: { id: string; title: string };
    onClick?: (t: unknown) => void;
  }) => (
    <div data-testid={`ticket-${ticket.id}`} onClick={() => onClick?.(ticket)}>
      {ticket.title}
    </div>
  ),
}));

// Mock KanbanColumn to avoid nested rendering issues
vi.mock("./KanbanColumn", () => ({
  KanbanColumn: ({
    status,
    label,
    count,
    children,
  }: {
    status: string;
    label: string;
    count: number;
    children: React.ReactNode;
  }) => (
    <div data-testid={`column-${status}`} aria-label={`${label} column`}>
      <h3>
        {label} ({count})
      </h3>
      <div>{children}</div>
    </div>
  ),
}));

// Helper to create valid Ticket objects for testing
const createMockTicket = (overrides: Partial<Ticket>): Ticket => {
  return {
    id: "1",
    title: "Test Ticket",
    description: "Test Description",
    status: "backlog",
    priority: "medium",
    position: 0,
    epicId: null,
    projectId: "proj-1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
    isBlocked: false,
    blockedReason: null,
    tags: null,
    subtasks: null,
    linkedFiles: null,
    attachments: null,
    branchName: null,
    prNumber: null,
    prUrl: null,
    prStatus: null,
    ...overrides,
  } as unknown as Ticket;
};

describe("KanbanBoard", () => {
  const mockTickets: Ticket[] = [
    createMockTicket({
      id: "1",
      title: "Ticket 1",
      status: "backlog",
    }),
    createMockTicket({
      id: "2",
      title: "Ticket 2",
      status: "in_progress",
    }),
    createMockTicket({
      id: "3",
      title: "Ticket 3",
      status: "done",
    }),
    createMockTicket({
      id: "4",
      title: "Ticket 4",
      status: "done",
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading skeleton when loading", () => {
    vi.mocked(hooks.useTickets).mockReturnValue({
      tickets: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<KanbanBoard />);

    expect(screen.getByRole("region", { name: /loading/i })).toBeInTheDocument();
    expect(screen.getAllByTestId(/column-skeleton-/)).toHaveLength(7);
  });

  it("renders error message when fetch fails", () => {
    vi.mocked(hooks.useTickets).mockReturnValue({
      tickets: [],
      loading: false,
      error: "Failed to fetch",
      refetch: vi.fn(),
    });

    render(<KanbanBoard />);

    expect(screen.getByRole("alert")).toHaveTextContent(/failed to load/i);
  });

  it("renders columns and distributes tickets correctly", () => {
    vi.mocked(hooks.useTickets).mockReturnValue({
      tickets: mockTickets,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTickets>);

    render(<KanbanBoard />);

    // Check columns
    expect(screen.getByTestId("column-backlog")).toBeInTheDocument();
    expect(screen.getByTestId("column-in_progress")).toBeInTheDocument();
    expect(screen.getByTestId("column-done")).toBeInTheDocument();

    // Check tickets
    expect(screen.getByTestId("ticket-1")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-2")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-3")).toBeInTheDocument();
    expect(screen.getByTestId("ticket-4")).toBeInTheDocument();

    // Verify ticket counts in headers (from mock KanbanColumn)
    expect(screen.getByText(/Backlog \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/In Progress \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Done \(2\)/)).toBeInTheDocument();
  });

  it("passes filters to useTickets", () => {
    vi.mocked(hooks.useTickets).mockReturnValue({
      tickets: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<KanbanBoard projectId="proj-1" epicId="epic-1" />);

    expect(hooks.useTickets).toHaveBeenCalledWith({
      projectId: "proj-1",
      epicId: "epic-1",
    });
  });

  it("handles ticket clicks", async () => {
    vi.mocked(hooks.useTickets).mockReturnValue({
      tickets: mockTickets,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTickets>);

    const onTicketClick = vi.fn();
    render(<KanbanBoard onTicketClick={onTicketClick} />);

    // Click a ticket
    screen.getByTestId("ticket-1").click();

    expect(onTicketClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "1",
        title: "Ticket 1",
      })
    );
  });
});
