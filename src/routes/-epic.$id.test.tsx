import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { Route } from "./epic.$id";

const mockShowToast = vi.hoisted(() => vi.fn());
const mockPushBranchServerFn = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());
const mockLaunchRalphForEpic = vi.hoisted(() => vi.fn());

let epicDetailState: ReturnType<typeof createEpicDetail>;
let mockRefetch: ReturnType<typeof vi.fn>;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({ ...config, options: config }),
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

const EpicDetailPage = Route.options.component as ComponentType;

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
  useLaunchRalphForEpic: () => ({
    mutateAsync: mockLaunchRalphForEpic,
    isPending: false,
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
    reviewRuns: [],
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
    mockLaunchRalphForEpic.mockResolvedValue({
      success: true,
      message: "Launched Ralph in terminal",
    });
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

  it("shows focused review run summaries without duplicating ticket history", () => {
    epicDetailState = createEpicDetail({
      reviewRuns: [
        {
          id: "run-12345678",
          status: "completed",
          launchMode: "focused-review",
          provider: "claude",
          steeringPrompt: "Focus on silent failures.",
          summary:
            "Focused review completed. Findings: 2 total, 1 fixed, 0 open critical, 0 open major. Demo generated: yes.",
          createdAt: "2026-03-09T05:00:00.000Z",
          startedAt: "2026-03-09T05:00:00.000Z",
          completedAt: "2026-03-09T05:15:00.000Z",
          selectedTickets: [
            {
              id: "ticket-1",
              title: "Ship modal",
              status: "completed",
              summary: "Review completed and demo generated.",
            },
          ],
          findingsTotal: 2,
          findingsFixed: 1,
          demoGenerated: true,
        },
      ],
    });

    render(<EpicDetailPage />);

    expect(screen.getByTestId("epic-review-runs")).toBeInTheDocument();
    expect(screen.getByText("Focused Review Runs")).toBeInTheDocument();
    expect(screen.getByText("Run run-1234")).toBeInTheDocument();
    expect(
      screen.getByText("Ship modal (completed: Review completed and demo generated.)")
    ).toBeInTheDocument();
    expect(screen.getByText("2 findings • 1 fixed • Demo generated")).toBeInTheDocument();
    expect(screen.getByText(/Focus on silent failures\./)).toBeInTheDocument();
  });

  it("launches a focused review with selected ticket scope and optional steering text", async () => {
    const user = userEvent.setup();

    render(<EpicDetailPage />);

    await user.click(screen.getByRole("button", { name: /review a ticket in this epic/i }));
    await user.click(screen.getByLabelText(/select ship modal for focused review/i));
    await user.type(
      screen.getByLabelText(/how do you want to steer the review\?/i),
      "Focus on loading states and silent failures."
    );
    await user.click(screen.getByRole("button", { name: /launch focused review/i }));

    await waitFor(() => {
      expect(mockLaunchRalphForEpic).toHaveBeenCalledWith({
        epicId: "epic-1",
        preferredTerminal: null,
        useSandbox: false,
        aiBackend: "claude",
        launchProfile: {
          type: "review",
          selectedTicketIds: ["ticket-1"],
          steeringPrompt: "Focus on loading states and silent failures.",
        },
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith("success", "Focused review launched for Ship modal");
  });

  it("shows inline validation when the focused review form is submitted without any ticket selected", async () => {
    const user = userEvent.setup();

    render(<EpicDetailPage />);

    await user.click(screen.getByRole("button", { name: /review a ticket in this epic/i }));
    await user.click(screen.getByRole("button", { name: /launch focused review/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select at least one ticket to review.");
    expect(mockLaunchRalphForEpic).not.toHaveBeenCalled();
  });

  it("fans out a focused review launch when the user selects more than one ticket", async () => {
    const user = userEvent.setup();
    epicDetailState = createEpicDetail({
      ticketsByStatus: {
        in_progress: 2,
        done: 0,
      },
      tickets: [
        {
          id: "ticket-1",
          title: "Ship modal",
          status: "in_progress",
        },
        {
          id: "ticket-2",
          title: "Review launch copy",
          status: "ready",
        },
      ],
      workflowState: {
        ...createEpicDetail().workflowState,
        ticketsTotal: 2,
      },
    });

    render(<EpicDetailPage />);

    await user.click(screen.getByRole("button", { name: /review a ticket in this epic/i }));
    await user.click(screen.getByLabelText(/select ship modal for focused review/i));
    await user.click(screen.getByLabelText(/select review launch copy for focused review/i));
    await user.click(screen.getByRole("button", { name: /launch focused review/i }));

    await waitFor(() => {
      expect(mockLaunchRalphForEpic).toHaveBeenCalledWith({
        epicId: "epic-1",
        preferredTerminal: null,
        useSandbox: false,
        aiBackend: "claude",
        launchProfile: {
          type: "review",
          selectedTicketIds: ["ticket-1", "ticket-2"],
          steeringPrompt: "",
        },
      });
    });

    expect(mockShowToast).toHaveBeenCalledWith("success", "Focused review launched for 2 tickets");
  });
});
