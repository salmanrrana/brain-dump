import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { Route } from "./ticket.$id";

const mockShowToast = vi.hoisted(() => vi.fn());
const mockPushBranchServerFn = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());
const mockNavigate = vi.hoisted(() => vi.fn());

let ticketState: ReturnType<typeof createTicket>;
let mockRefetch: ReturnType<typeof vi.fn>;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({ ...config, options: config }),
  useParams: () => ({ id: "ticket-1" }),
  useRouter: () => ({
    history: { back: vi.fn() },
    navigate: vi.fn(),
  }),
  useNavigate: () => mockNavigate,
  useCanGoBack: () => true,
}));

vi.mock("@tanstack/react-query", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");

  return {
    ...actual,
    useQuery: () => ({
      data: ticketState,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    }),
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

const TicketDetailPage = Route.options.component as ComponentType;

vi.mock("../api/tickets", () => ({
  getTicket: vi.fn(),
}));

vi.mock("../api/context", () => ({
  getTicketContext: vi.fn(),
}));

vi.mock("../api/ship-server-fns", () => ({
  pushBranchServerFn: mockPushBranchServerFn,
}));

vi.mock("../api/terminal", () => ({
  launchClaudeInTerminal: vi.fn(),
  launchCodexInTerminal: vi.fn(),
  launchVSCodeInTerminal: vi.fn(),
  launchCursorInTerminal: vi.fn(),
  launchCursorAgentInTerminal: vi.fn(),
  launchCopilotInTerminal: vi.fn(),
  launchOpenCodeInTerminal: vi.fn(),
}));

vi.mock("../components/Toast", () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

vi.mock("../lib/hooks", () => ({
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
}));

vi.mock("../components/tickets", () => ({
  ShipChangesModal: ({ onSuccess }: { onSuccess: (prUrl: string) => void }) => (
    <div>
      <div>Ticket ship modal</div>
      <button type="button" onClick={() => onSuccess("https://example.com/pr/52")}>
        Complete ship
      </button>
    </div>
  ),
  TicketDescription: ({ description }: { description: string | null }) => (
    <div>{description ?? "No description"}</div>
  ),
  SubtasksProgress: () => <div>Subtasks</div>,
}));

vi.mock("../components/tickets/ActivitySection", () => ({
  ActivitySection: () => <div>Activity</div>,
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

vi.mock("../components/TelemetryPanel", () => ({
  TelemetryPanel: () => <div>Telemetry</div>,
}));

vi.mock("../components/tickets/TicketCostPanel", () => ({
  TicketCostPanel: () => <div>Cost</div>,
}));

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

describe("TicketDetailPage ship entry points", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ticketState = createTicket();
    mockRefetch = vi.fn(async () => undefined);
    mockNavigate.mockResolvedValue(undefined);
    mockPushBranchServerFn.mockResolvedValue({
      success: true,
      branchName: "feature/ticket-ship",
    });
  });

  it("renders the epic badge as navigation that replaces the ticket history entry", async () => {
    const user = userEvent.setup();

    render(<TicketDetailPage />);

    await user.click(screen.getByRole("button", { name: /open epic ship epic/i }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/epic/$id",
      params: { id: "epic-1" },
      replace: true,
    });
  });

  it("keeps ticket detail behavior unchanged when no epic is assigned", () => {
    ticketState = createTicket({ epicId: null });

    render(<TicketDetailPage />);

    expect(screen.queryByRole("button", { name: /open epic/i })).not.toBeInTheDocument();
  });

  it("shows Ship first, then refreshes to Push after a successful ticket ship", async () => {
    const user = userEvent.setup();
    mockRefetch.mockImplementation(async () => {
      ticketState = createTicket({
        prNumber: 52,
        prStatus: "open",
        prUrl: "https://example.com/pr/52",
      });
    });

    render(<TicketDetailPage />);

    expect(screen.getByRole("button", { name: /ship ticket changes/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /push branch updates/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /ship ticket changes/i }));
    expect(screen.getByText("Ticket ship modal")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /complete ship/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /ship ticket changes/i })
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /push branch updates/i })).toBeInTheDocument();
    });
  });

  it("shows push-only failure feedback and returns the button to idle after an error", async () => {
    const user = userEvent.setup();
    const pushDeferred = createDeferred<{ success: false; error: string }>();
    ticketState = createTicket({
      prNumber: 52,
      prStatus: "open",
      prUrl: "https://example.com/pr/52",
    });
    mockPushBranchServerFn.mockReturnValue(pushDeferred.promise);

    render(<TicketDetailPage />);

    await user.click(screen.getByRole("button", { name: /push branch updates/i }));
    expect(screen.getByRole("button", { name: /push branch updates/i })).toHaveTextContent(
      "Pushing..."
    );

    pushDeferred.resolve({
      success: false,
      error: "Push failed: remote rejected the branch update",
    });

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        "error",
        "Push failed: remote rejected the branch update"
      );
    });
    expect(screen.getByRole("button", { name: /push branch updates/i })).toHaveTextContent("Push");
  });
});
