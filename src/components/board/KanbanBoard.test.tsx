import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { KanbanBoard } from "./KanbanBoard";
import * as hooks from "../../lib/hooks";
import type { TicketSummary } from "../../api/tickets";

// Capture onDragEnd from DndContext so tests can simulate drag-and-drop
let capturedOnDragEnd: ((...args: unknown[]) => unknown) | null = null;

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd?: (...args: unknown[]) => unknown;
  }) => {
    capturedOnDragEnd = onDragEnd ?? null;
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drag-overlay">{children}</div>
  ),
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
}));

// Mock the useTickets hook and mutation hooks
const mockStatusMutate = vi.fn().mockResolvedValue(undefined);
const mockPositionMutate = vi.fn().mockResolvedValue(undefined);

vi.mock("../../lib/hooks", () => ({
  useTicketSummaries: vi.fn(),
  useUpdateTicketStatus: vi.fn(() => ({
    mutateAsync: mockStatusMutate,
    isPending: false,
  })),
  useUpdateTicketPosition: vi.fn(() => ({
    mutateAsync: mockPositionMutate,
    isPending: false,
  })),
}));

// Mock the Toast context
const mockShowToast = vi.fn();
vi.mock("../Toast", () => ({
  useToast: vi.fn(() => ({
    showToast: mockShowToast,
  })),
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

// Mock SortableTicketCard (depends on @dnd-kit/sortable hooks)
vi.mock("./SortableTicketCard", () => ({
  SortableTicketCard: ({
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
const createMockTicket = (overrides: Partial<TicketSummary>): TicketSummary => {
  return {
    id: "1",
    title: "Test Ticket",
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
    branchName: null,
    prNumber: null,
    prUrl: null,
    prStatus: null,
    ...overrides,
  } as unknown as TicketSummary;
};

describe("KanbanBoard", () => {
  const mockTickets: TicketSummary[] = [
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
    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<KanbanBoard />);

    expect(screen.getByRole("region", { name: /loading/i })).toBeInTheDocument();
    // The test ID is on the parent columns, not the individual skeleton cards
    // Look for elements that might have this style or structure
    // Since we're using inline styles in the component for skeletons, let's verify structure
    const loadingRegion = screen.getByRole("region", { name: /loading/i });
    // Check that we have a columns container
    expect(loadingRegion.children[0]).toBeInTheDocument();
    // Check that we have 6 columns (children of the columns container)
    // Columns: backlog, ready, in_progress, ai_review, human_review, done
    expect(loadingRegion.children[0]?.children).toHaveLength(6);
  });

  it("renders error message when fetch fails", () => {
    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: [],
      loading: false,
      error: "Failed to fetch",
      refetch: vi.fn(),
    });

    render(<KanbanBoard />);

    expect(screen.getByRole("alert")).toHaveTextContent(/failed to load/i);
  });

  it("renders columns and distributes tickets correctly", () => {
    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: mockTickets,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTicketSummaries>);

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

  it("moves ticket to a new column on drag-and-drop and shows success toast", async () => {
    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: mockTickets,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTicketSummaries>);

    render(<KanbanBoard />);

    // Verify ticket 1 starts in Backlog
    expect(screen.getByText(/Backlog \(1\)/)).toBeInTheDocument();

    // Simulate drag: move ticket "1" (backlog) to the "in_progress" column
    expect(capturedOnDragEnd).not.toBeNull();
    await capturedOnDragEnd!({
      active: { id: "1" },
      over: { id: "in_progress" },
    });

    // Status mutation should fire with the new status
    expect(mockStatusMutate).toHaveBeenCalledWith({
      id: "1",
      status: "in_progress",
    });

    // Position mutation should fire to place the ticket
    expect(mockPositionMutate).toHaveBeenCalledWith({
      id: "1",
      position: expect.any(Number),
    });

    // User sees a success toast confirming the move
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("success", expect.stringContaining("In Progress"));
    });
  });

  it("moves ticket to an empty column on drag-and-drop", async () => {
    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: mockTickets, // no "ready" tickets — that column is empty
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTicketSummaries>);

    render(<KanbanBoard />);

    // "Ready" column is empty (0 tickets)
    expect(screen.getByText(/Ready \(0\)/)).toBeInTheDocument();

    // Simulate drag: move ticket "1" (backlog) to the empty "ready" column
    await capturedOnDragEnd!({
      active: { id: "1" },
      over: { id: "ready" },
    });

    // Status mutation fires with the empty column's status
    expect(mockStatusMutate).toHaveBeenCalledWith({
      id: "1",
      status: "ready",
    });

    // Position set to 1 (first ticket in empty column)
    expect(mockPositionMutate).toHaveBeenCalledWith({
      id: "1",
      position: 1,
    });

    // User sees success toast
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("success", expect.stringContaining("Ready"));
    });
  });

  it("does not call status mutation when ticket is dropped in its own column", async () => {
    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: mockTickets,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTicketSummaries>);

    render(<KanbanBoard />);

    // Simulate drag: move ticket "1" (backlog) back to the "backlog" column
    await capturedOnDragEnd!({
      active: { id: "1" },
      over: { id: "backlog" },
    });

    // Status mutation should NOT fire (same column)
    expect(mockStatusMutate).not.toHaveBeenCalled();

    // Position mutation should still fire (reordering within column)
    expect(mockPositionMutate).toHaveBeenCalled();

    // No success toast for same-column reorder
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it("shows error toast when drag-and-drop mutation fails", async () => {
    mockStatusMutate.mockRejectedValueOnce(new Error("Network error"));

    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: mockTickets,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTicketSummaries>);

    render(<KanbanBoard />);

    // Simulate drag: move ticket "1" to "done" column
    await capturedOnDragEnd!({
      active: { id: "1" },
      over: { id: "done" },
    });

    // User sees an error toast
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("error", expect.stringContaining("Network error"));
    });
  });

  it("ignores drag when dropped on nothing", async () => {
    vi.mocked(hooks.useTicketSummaries).mockReturnValue({
      tickets: mockTickets,
      loading: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useTicketSummaries>);

    render(<KanbanBoard />);

    // Simulate drag with no drop target
    await capturedOnDragEnd!({
      active: { id: "1" },
      over: null,
    });

    // No mutations should fire
    expect(mockStatusMutate).not.toHaveBeenCalled();
    expect(mockPositionMutate).not.toHaveBeenCalled();
  });
});
