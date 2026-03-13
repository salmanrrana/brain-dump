import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TicketModal from "./TicketModal";
import type { TelemetryStatsAvailable } from "../api/telemetry";

const mockNavigate = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockShowToast = vi.hoisted(() => vi.fn());
const mockGetTelemetryStats = vi.hoisted(() => vi.fn());
const mockGetLatestTelemetrySession = vi.hoisted(() => vi.fn());
const mockUseStore = vi.hoisted(() =>
  vi.fn((_store, selector) =>
    selector({
      values: {
        status: "ready",
        tags: [],
        acceptanceCriteria: [],
      },
    })
  )
);

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@tanstack/react-form-start", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-form-start")>(
    "@tanstack/react-form-start"
  );

  return {
    ...actual,
    useStore: mockUseStore,
  };
});

vi.mock("../api/telemetry", async () => {
  const actual = await vi.importActual<typeof import("../api/telemetry")>("../api/telemetry");

  return {
    ...actual,
    getTelemetryStats: mockGetTelemetryStats,
    getLatestTelemetrySession: mockGetLatestTelemetrySession,
  };
});

vi.mock("../lib/hooks", async () => {
  const actual = await vi.importActual<typeof import("../lib/hooks")>("../lib/hooks");

  return {
    ...actual,
    useModalKeyboard: vi.fn(),
    useClickOutside: vi.fn(),
    useDeleteTicket: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useTicketDeletePreview: vi.fn(() => ({ data: null })),
    useUpdateTicket: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false, error: null })),
    useSettings: vi.fn(() => ({ settings: null })),
    useLaunchRalphForTicket: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useComments: vi.fn(() => ({ comments: [], loading: false })),
    useCreateComment: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useTags: vi.fn(() => ({ tags: [], loading: false, error: null })),
    useAutoClearState: vi.fn(() => [null, vi.fn()]),
    useProjectServices: vi.fn(() => ({ runningServices: [], error: null })),
    useProjects: vi.fn(() => ({
      projects: [{ id: "project-1", path: "/tmp/project", epics: [] }],
    })),
    useActiveRalphSessions: vi.fn(() => ({ getSession: vi.fn(() => null) })),
  };
});

vi.mock("./Toast", () => ({
  useToast: vi.fn(() => ({
    showToast: mockShowToast,
  })),
}));

vi.mock("./DeleteConfirmationModal", () => ({
  default: () => null,
}));

vi.mock("./RalphStatusBadge", () => ({
  RalphStatusBadge: () => null,
}));

vi.mock("./tickets/DemoPanel", () => ({
  DemoPanel: () => null,
}));

vi.mock("./tickets/ClaudeTasks", () => ({
  ClaudeTasks: () => null,
}));

vi.mock("../api/attachments", () => ({
  getAttachments: vi.fn(async () => []),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("../api/context", () => ({
  getTicketContext: vi.fn(),
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
    errorCount: 0,
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

function createTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: "ticket-1",
    title: "Board modal ticket",
    description: "Ticket opened from the board",
    status: "ready",
    priority: "medium",
    epicId: "epic-1",
    projectId: "project-1",
    isBlocked: false,
    blockedReason: null,
    tags: "[]",
    subtasks: "[]",
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
    completedAt: null,
    position: 0,
    linkedFiles: null,
    attachments: null,
    branchName: null,
    prNumber: null,
    prUrl: null,
    prStatus: null,
    ...overrides,
  } as never;
}

describe("TicketModal telemetry integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTelemetryStats.mockResolvedValue(createStatsResult());
    mockGetLatestTelemetrySession.mockResolvedValue({
      status: "available",
      session: null,
    });
  });

  it("shows the telemetry summary in the board ticket details modal", async () => {
    const user = userEvent.setup();

    renderWithQueryClient(
      <TicketModal
        ticket={createTicket()}
        epics={[
          {
            id: "epic-1",
            title: "Core Epic",
            description: null,
            projectId: "project-1",
            color: "#3b82f6",
            createdAt: "2026-03-08T00:00:00.000Z",
          },
        ]}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

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
});
