import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TicketDetailPage } from "./ticket.$id";
import type { TelemetryStatsAvailable, TelemetryStatsResult } from "../api/telemetry";

const mockShowToast = vi.hoisted(() => vi.fn());
const mockGetTelemetryStats = vi.hoisted(() => vi.fn());
const mockGetLatestTelemetrySession = vi.hoisted(() => vi.fn());
const mockGetTicket = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useParams: () => ({ id: "ticket-1" }),
  useRouter: () => ({
    history: { back: vi.fn() },
    navigate: vi.fn(),
  }),
  useNavigate: () => vi.fn(),
  useCanGoBack: () => true,
}));

vi.mock("../api/tickets", () => ({
  getTicket: mockGetTicket,
}));

vi.mock("../api/telemetry", async () => {
  const actual = await vi.importActual<typeof import("../api/telemetry")>("../api/telemetry");

  return {
    ...actual,
    getTelemetryStats: mockGetTelemetryStats,
    getLatestTelemetrySession: mockGetLatestTelemetrySession,
  };
});

vi.mock("../api/context", () => ({
  getTicketContext: vi.fn(),
}));

vi.mock("../api/ship-server-fns", () => ({
  pushBranchServerFn: vi.fn(),
}));

vi.mock("../api/terminal", async () => {
  const actual = await vi.importActual<typeof import("../api/terminal")>("../api/terminal");

  return {
    ...actual,
    launchClaudeInTerminal: vi.fn(),
    launchCodexInTerminal: vi.fn(),
    launchVSCodeInTerminal: vi.fn(),
    launchCursorInTerminal: vi.fn(),
    launchCopilotInTerminal: vi.fn(),
    launchOpenCodeInTerminal: vi.fn(),
  };
});

vi.mock("../components/Toast", () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock("../lib/hooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/hooks")>("../lib/hooks");

  return {
    ...actual,
    useProjects: () => ({
      projects: [
        {
          id: "project-1",
          path: "/tmp/brain-dump",
          epics: [
            {
              id: "epic-1",
              title: "Ship Epic",
              color: "#3b82f6",
            },
          ],
        },
      ],
    }),
    useSettings: () => ({
      settings: {
        terminalEmulator: null,
      },
    }),
    useLaunchRalphForTicket: () => ({
      mutateAsync: vi.fn(),
    }),
    useWorkflowState: () => ({
      workflowState: null,
      loading: false,
      error: null,
    }),
    useClickOutside: vi.fn(),
  };
});

vi.mock("../components/tickets", () => ({
  ShipChangesModal: () => null,
  TicketDescription: ({ description }: { description: string | null }) => (
    <div>{description ?? "No description"}</div>
  ),
  SubtasksProgress: () => <div>Subtasks</div>,
}));

vi.mock("../components/tickets/ActivitySection", () => ({
  ActivitySection: () => <div>Activity</div>,
}));

vi.mock("../components/tickets/TicketDetailHeader", () => ({
  TicketDetailHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../components/tickets/EditTicketModal", () => ({
  EditTicketModal: () => null,
}));

vi.mock("../components/tickets/WorkflowProgress", () => ({
  WorkflowProgress: () => <div>Workflow</div>,
}));

vi.mock("../components/tickets/ReviewFindingsPanel", () => ({
  ReviewFindingsPanel: () => <div>Findings</div>,
}));

vi.mock("../components/tickets/ClaudeTasks", () => ({
  ClaudeTasks: () => <div>Claude tasks</div>,
}));

vi.mock("../components/tickets/DemoPanel", () => ({
  DemoPanel: () => <div>Demo</div>,
}));

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithQueryClient(component: React.ReactNode) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function createTicket(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ticket-1",
    title: "Ship ticket flow",
    description: "Test the ticket entry point",
    status: "in_progress",
    priority: "high",
    projectId: "project-1",
    epicId: "epic-1",
    tags: "[]",
    subtasks: "[]",
    branchName: "feature/ticket-ship",
    prNumber: null,
    prStatus: null,
    prUrl: null,
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

function createStatsResult(
  overrides: Partial<TelemetryStatsAvailable> = {}
): TelemetryStatsAvailable {
  return {
    status: "available",
    totalSessions: 1,
    totalPrompts: 4,
    totalToolCalls: 7,
    totalDurationMs: 1200,
    avgSessionDurationMs: 1200,
    mostUsedTools: [{ toolName: "Edit", count: 3 }],
    successRate: 100,
    latestSession: {
      id: "session-1",
      ticketId: "ticket-1",
      projectId: "project-1",
      environment: "claude-code",
      branchName: "feature/test",
      claudeSessionId: null,
      startedAt: "2026-03-08T00:00:00.000Z",
      endedAt: "2026-03-08T00:01:00.000Z",
      totalPrompts: 4,
      totalToolCalls: 7,
      totalDurationMs: 1200,
      totalTokens: null,
      outcome: "success",
    },
    ...overrides,
  };
}

describe("TicketDetailPage telemetry integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTicket.mockResolvedValue(createTicket());
    mockGetTelemetryStats.mockResolvedValue(createStatsResult());
    mockGetLatestTelemetrySession.mockResolvedValue({
      status: "available",
      session: null,
    });
  });

  it("shows the telemetry summary on the ticket route", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(<TicketDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ai telemetry/i })).toBeInTheDocument();
    });

    expect(screen.getByText("1 session")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ai telemetry/i }));

    const statsGroup = await screen.findByRole("group", { name: /telemetry statistics/i });
    expect(within(statsGroup).getByText("Prompts")).toBeInTheDocument();
    expect(within(statsGroup).getByText("4")).toBeInTheDocument();
    expect(within(statsGroup).getByText("Tool Calls")).toBeInTheDocument();
    expect(within(statsGroup).getByText("7")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /most used tools/i })).toHaveTextContent("Edit (3)");
  });

  it("shows the ticket route unavailable state when telemetry needs the schema upgrade", async () => {
    mockGetTelemetryStats.mockResolvedValue({
      status: "unavailable",
      reason: "missing_schema",
      message:
        "Telemetry is unavailable for this ticket because this Brain Dump install still needs the telemetry schema upgrade.",
    } satisfies TelemetryStatsResult);

    renderWithQueryClient(<TicketDetailPage />);

    await waitFor(() => {
      expect(screen.getByText("Telemetry unavailable")).toBeInTheDocument();
    });

    expect(screen.getByText(/needs the telemetry schema upgrade/i)).toBeInTheDocument();
  });
});
