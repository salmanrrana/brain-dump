import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicDetailPage } from "./epic.$id";

const mockShowToast = vi.hoisted(() => vi.fn());
const mockPushBranchServerFn = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());

let epicDetailState: ReturnType<typeof createEpicDetail>;
let mockRefetch: ReturnType<typeof vi.fn>;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => config,
  useParams: () => ({ id: "epic-1" }),
  useRouter: () => ({
    history: { back: vi.fn() },
    navigate: vi.fn(),
  }),
  useCanGoBack: () => true,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");

  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

vi.mock("../api/ship-server-fns", () => ({
  pushBranchServerFn: mockPushBranchServerFn,
}));

vi.mock("../lib/hooks", () => ({
  useEpicDetail: () => ({
    data: epicDetailState,
    loading: false,
    error: null,
    refetch: mockRefetch,
  }),
  useSettings: () => ({
    settings: {
      terminalEmulator: null,
    },
  }),
  useLaunchRalphForTicket: () => ({
    mutateAsync: vi.fn(),
  }),
  useClickOutside: vi.fn(),
}));

vi.mock("../components/Toast", () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock("../api/context", () => ({
  getTicketContext: vi.fn(),
}));

vi.mock("../api/terminal", () => ({
  launchClaudeInTerminal: vi.fn(),
  launchCodexInTerminal: vi.fn(),
  launchVSCodeInTerminal: vi.fn(),
  launchCursorInTerminal: vi.fn(),
  launchCopilotInTerminal: vi.fn(),
  launchOpenCodeInTerminal: vi.fn(),
}));

vi.mock("../components/epics/EpicProgressOverview", () => ({
  EpicProgressOverview: () => <div>Epic progress overview</div>,
}));

vi.mock("../components/epics/EpicTicketsList", () => ({
  EpicTicketsList: () => <div>Epic tickets list</div>,
}));

vi.mock("../components/epics/EpicLearnings", () => ({
  EpicLearnings: () => <div>Epic learnings</div>,
}));

vi.mock("../components/tickets/TicketDescription", () => ({
  TicketDescription: ({ description }: { description: string | null }) => (
    <div>{description ?? "No description"}</div>
  ),
}));

vi.mock("../components/EpicModal", () => ({
  default: () => <div>Edit epic modal</div>,
}));

vi.mock("../components/tickets", () => ({
  ShipChangesModal: ({
    scopeType,
    onSuccess,
  }: {
    scopeType: "ticket" | "epic";
    onSuccess: (prUrl: string) => void;
  }) => (
    <div>
      <div>{scopeType === "epic" ? "Epic ship modal" : "Ticket ship modal"}</div>
      <button type="button" onClick={() => onSuccess("https://example.com/pr/42")}>
        Complete ship
      </button>
    </div>
  ),
}));

function createEpicDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    epic: {
      id: "epic-1",
      title: "Ship Changes",
      description: "Ship flow integration tests",
      projectId: "project-1",
      color: "#3b82f6",
      createdAt: "2026-03-08T00:00:00.000Z",
    },
    project: {
      id: "project-1",
      name: "Brain Dump",
      path: "/tmp/brain-dump",
    },
    ticketsByStatus: {
      in_progress: 1,
      done: 0,
    },
    tickets: [
      {
        id: "ticket-1",
        title: "Ship modal",
        status: "in_progress",
      },
    ],
    findingsSummary: {
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 0,
      fixed: 0,
      total: 0,
    },
    criticalFindings: [],
    workflowState: {
      epicBranchName: "feature/epic-ship",
      prNumber: null,
      prStatus: null,
      currentTicketId: "ticket-1",
      learnings: [],
      ticketsTotal: 1,
    },
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return {
    promise,
    resolve(value: T) {
      resolve?.(value);
    },
  };
}

describe("EpicDetailPage ship entry points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    epicDetailState = createEpicDetail();
    mockRefetch = vi.fn(async () => undefined);
    mockPushBranchServerFn.mockResolvedValue({
      success: true,
      branchName: "feature/epic-ship",
    });
  });

  it("shows Ship Changes first, then refreshes to Push after a successful epic ship", async () => {
    const user = userEvent.setup();
    mockRefetch.mockImplementation(async () => {
      epicDetailState = createEpicDetail({
        workflowState: {
          ...epicDetailState.workflowState,
          prNumber: 42,
          prStatus: "draft",
        },
      });
    });

    render(<EpicDetailPage />);

    expect(screen.getByRole("button", { name: /ship epic changes/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /push epic branch updates/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ship epic changes/i }));
    expect(screen.getByText("Epic ship modal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /complete ship/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /ship epic changes/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /push epic branch updates/i })).toBeInTheDocument();
    });
  });

  it("shows push-only progress feedback and a success toast when the epic branch push completes", async () => {
    const user = userEvent.setup();
    const pushDeferred = createDeferred<{ success: true; branchName: string }>();
    epicDetailState = createEpicDetail({
      workflowState: {
        ...createEpicDetail().workflowState,
        prNumber: 42,
        prStatus: "open",
      },
    });
    mockPushBranchServerFn.mockReturnValue(pushDeferred.promise);

    render(<EpicDetailPage />);

    await user.click(screen.getByRole("button", { name: /push epic branch updates/i }));
    expect(screen.getByRole("button", { name: /push epic branch updates/i })).toHaveTextContent(
      "Pushing..."
    );

    pushDeferred.resolve({ success: true, branchName: "feature/epic-ship" });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith("success", "Pushed feature/epic-ship");
    });
    expect(screen.getByRole("button", { name: /push epic branch updates/i })).toHaveTextContent(
      "Push"
    );
  });

  it("shows aggregated review finding counts for the epic", () => {
    epicDetailState = createEpicDetail({
      findingsSummary: {
        critical: 1,
        major: 2,
        minor: 3,
        suggestion: 4,
        fixed: 5,
        total: 10,
      },
    });

    render(<EpicDetailPage />);

    expect(screen.getByText("Review Findings")).toBeInTheDocument();
    expect(screen.getByText("10 total findings across this epic")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /view review findings for this epic/i })
    ).toHaveTextContent("Findings (10)");
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("Major")).toBeInTheDocument();
    expect(screen.getByText("Minor")).toBeInTheDocument();
    expect(screen.getByText("Suggestions")).toBeInTheDocument();
    expect(screen.getByText("5/10")).toBeInTheDocument();
  });
});
