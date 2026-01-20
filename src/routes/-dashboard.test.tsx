import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

// Mock the hooks module
vi.mock("../lib/hooks", () => ({
  useTickets: vi.fn(),
  useActiveRalphSessions: vi.fn(),
}));

// Mock dashboard components - we're testing the route's data transformation logic
vi.mock("../components/dashboard", () => ({
  StatsGrid: vi.fn(({ total, inProgress, aiActive, done }) => (
    <div data-testid="stats-grid">
      <span data-testid="stat-total">{total}</span>
      <span data-testid="stat-in-progress">{inProgress}</span>
      <span data-testid="stat-ai-active">{aiActive}</span>
      <span data-testid="stat-done">{done}</span>
    </div>
  )),
  CurrentFocusCard: vi.fn(({ ticket }) => (
    <div data-testid="current-focus-card">
      {ticket ? (
        <span data-testid="focus-ticket-title">{ticket.title}</span>
      ) : (
        <span data-testid="focus-empty">No active focus</span>
      )}
    </div>
  )),
  UpNextQueue: vi.fn(({ tickets }) => (
    <ol data-testid="up-next-queue">
      {tickets.map((t: { id: string; title: string }, i: number) => (
        <li key={t.id} data-testid={`queue-item-${i}`}>
          {t.title}
        </li>
      ))}
    </ol>
  )),
}));

import { useTickets, useActiveRalphSessions } from "../lib/hooks";

const mockUseTickets = useTickets as ReturnType<typeof vi.fn>;
const mockUseActiveRalphSessions = useActiveRalphSessions as ReturnType<typeof vi.fn>;

function createTicket(
  overrides: Partial<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    position: number;
    isBlocked: boolean;
  }> = {}
) {
  return {
    id: overrides.id ?? `ticket-${Math.random()}`,
    title: overrides.title ?? "Test Ticket",
    status: overrides.status ?? "backlog",
    priority: overrides.priority ?? null,
    position: overrides.position ?? 0,
    isBlocked: overrides.isBlocked ?? false,
    description: null,
    projectId: "project-1",
    epicId: null,
    subtasks: null,
    tags: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Dashboard: any;

beforeEach(async () => {
  vi.clearAllMocks();
  mockUseTickets.mockReturnValue({ tickets: [], loading: false, error: null });
  mockUseActiveRalphSessions.mockReturnValue({ sessions: {}, error: null });
  const module = await import("./dashboard");
  Dashboard = module.Route.options.component;
});

describe("Dashboard", () => {
  it("shows loading state while fetching tickets", () => {
    mockUseTickets.mockReturnValue({ tickets: [], loading: true, error: null });

    render(<Dashboard />);

    expect(screen.getByText("Loading dashboard...")).toBeInTheDocument();
  });

  it("shows error message when ticket fetch fails", () => {
    mockUseTickets.mockReturnValue({
      tickets: [],
      loading: false,
      error: "Database connection failed",
    });

    render(<Dashboard />);

    expect(screen.getByText("Database connection failed")).toBeInTheDocument();
  });

  it("displays correct stats for a mixed set of tickets", () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        createTicket({ status: "backlog" }),
        createTicket({ status: "ready" }),
        createTicket({ status: "in_progress" }),
        createTicket({ status: "in_progress" }),
        createTicket({ status: "done" }),
        createTicket({ status: "done" }),
        createTicket({ status: "done" }),
      ],
      loading: false,
      error: null,
    });
    mockUseActiveRalphSessions.mockReturnValue({
      sessions: { "session-1": {}, "session-2": {} },
      error: null,
    });

    render(<Dashboard />);

    expect(screen.getByTestId("stat-total")).toHaveTextContent("7");
    expect(screen.getByTestId("stat-in-progress")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-ai-active")).toHaveTextContent("2");
    expect(screen.getByTestId("stat-done")).toHaveTextContent("3");
  });

  it("shows the in-progress ticket with active AI session as current focus", () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        createTicket({ id: "t1", title: "Background task", status: "in_progress" }),
        createTicket({ id: "t2", title: "AI is working on this", status: "in_progress" }),
      ],
      loading: false,
      error: null,
    });
    mockUseActiveRalphSessions.mockReturnValue({
      sessions: { t2: { ticketId: "t2", state: "implementing" } },
      error: null,
    });

    render(<Dashboard />);

    expect(screen.getByTestId("focus-ticket-title")).toHaveTextContent("AI is working on this");
  });

  it("shows empty focus when no ticket has active AI session", () => {
    mockUseTickets.mockReturnValue({
      tickets: [createTicket({ status: "in_progress" })],
      loading: false,
      error: null,
    });

    render(<Dashboard />);

    expect(screen.getByTestId("focus-empty")).toBeInTheDocument();
  });

  it("shows up next queue sorted by priority then position", () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        createTicket({ title: "Low priority", priority: "low", position: 1 }),
        createTicket({ title: "High priority", priority: "high", position: 2 }),
        createTicket({ title: "Medium priority", priority: "medium", position: 3 }),
        createTicket({ title: "Also high but later", priority: "high", position: 4 }),
      ],
      loading: false,
      error: null,
    });

    render(<Dashboard />);

    const items = within(screen.getByTestId("up-next-queue")).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("High priority");
    expect(items[1]).toHaveTextContent("Also high but later");
    expect(items[2]).toHaveTextContent("Medium priority");
    expect(items[3]).toHaveTextContent("Low priority");
  });

  it("excludes done, in-progress, and blocked tickets from up next queue", () => {
    mockUseTickets.mockReturnValue({
      tickets: [
        createTicket({ title: "Done task", status: "done" }),
        createTicket({ title: "In progress task", status: "in_progress" }),
        createTicket({ title: "Blocked task", status: "backlog", isBlocked: true }),
        createTicket({ title: "Ready to work on", status: "ready" }),
      ],
      loading: false,
      error: null,
    });

    render(<Dashboard />);

    const items = within(screen.getByTestId("up-next-queue")).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Ready to work on");
  });

  it("limits up next queue to 5 tickets", () => {
    mockUseTickets.mockReturnValue({
      tickets: Array.from({ length: 10 }, (_, i) =>
        createTicket({ title: `Task ${i + 1}`, position: i })
      ),
      loading: false,
      error: null,
    });

    render(<Dashboard />);

    const items = within(screen.getByTestId("up-next-queue")).getAllByRole("listitem");
    expect(items).toHaveLength(5);
  });
});
