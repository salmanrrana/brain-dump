import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock the hooks module
vi.mock("../lib/hooks", () => ({
  useTickets: vi.fn(),
  useActiveRalphSessions: vi.fn(),
  useDashboardAnalytics: vi.fn(),
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
  AnalyticsSection: vi.fn(() => <div data-testid="analytics-section">Analytics</div>),
}));

import { useTickets, useActiveRalphSessions, useDashboardAnalytics } from "../lib/hooks";

const mockUseTickets = useTickets as ReturnType<typeof vi.fn>;
const mockUseActiveRalphSessions = useActiveRalphSessions as ReturnType<typeof vi.fn>;
const mockUseDashboardAnalytics = useDashboardAnalytics as ReturnType<typeof vi.fn>;

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
  mockUseDashboardAnalytics.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
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

  it("renders analytics section when analytics data is available", () => {
    mockUseTickets.mockReturnValue({
      tickets: [],
      loading: false,
      error: null,
    });
    mockUseDashboardAnalytics.mockReturnValue({
      data: {
        completionTrend: [],
        velocity: { thisWeek: 0, lastWeek: 0, thisMonth: 0, trend: "stable" },
        aiUsage: { claude: 0, ralph: 0, opencode: 0, user: 0 },
        ralphMetrics: { totalSessions: 0, successRate: 0, avgDuration: 0, avgTimeByState: {} },
        prMetrics: { total: 0, merged: 0, open: 0, draft: 0, mergeRate: 0 },
        cycleTime: { avg: 0, median: 0, p95: 0, distribution: [] },
        topProjects: [],
        commitsPerDay: [],
      },
      isLoading: false,
      error: null,
    });

    render(<Dashboard />);

    expect(screen.getByTestId("analytics-section")).toBeInTheDocument();
  });
});
