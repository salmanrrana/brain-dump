import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TicketModal from "./TicketModal";

const mockNavigate = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const mockShowToast = vi.hoisted(() => vi.fn());
const mockFormStatus = vi.hoisted(() => ({ value: "ready" }));
const mockUseStore = vi.hoisted(() =>
  vi.fn((_store, selector) =>
    selector({
      values: {
        status: mockFormStatus.value,
        tags: [],
        acceptanceCriteria: [],
      },
    })
  )
);
const mockUpdateTicketMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  error: null as Error | null,
}));

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

vi.mock("../lib/hooks", () => ({
  useModalKeyboard: vi.fn(),
  useClickOutside: vi.fn(),
  useDeleteTicket: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useTicketDeletePreview: vi.fn(() => ({ data: null })),
  useUpdateTicket: vi.fn(() => mockUpdateTicketMutation),
  useSettings: vi.fn(() => ({ settings: null })),
  useLaunchRalphForTicket: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useComments: vi.fn(() => ({ comments: [], loading: false })),
  useCreateComment: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useTags: vi.fn(() => ({ tags: [], loading: false, error: null })),
  useCostModels: vi.fn(() => ({ data: [], isLoading: false, error: null })),
  useAutoClearState: vi.fn(() => [null, vi.fn()]),
  useProjectServices: vi.fn(() => ({ runningServices: [], error: null })),
  useProjects: vi.fn(() => ({
    projects: [{ id: "project-1", path: "/tmp/project", epics: [] }],
  })),
  useActiveRalphSessions: vi.fn(() => ({ getSession: vi.fn(() => null) })),
}));

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
  DemoPanel: () => <div>Demo panel loaded</div>,
}));

vi.mock("./TelemetryPanel", () => ({
  TelemetryPanel: () => null,
}));

vi.mock("./tickets/ClaudeTasks", () => ({
  ClaudeTasks: () => null,
}));

vi.mock("./tickets/AttachmentsSection", () => ({
  AttachmentsSection: () => null,
}));

vi.mock("./tickets/ModalCommentsSection", () => ({
  ModalCommentsSection: () => null,
}));

vi.mock("./tickets/ServicesSection", () => ({
  ServicesSection: () => null,
}));

vi.mock("../api/attachments", () => ({
  getAttachments: vi.fn(async () => []),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
}));

vi.mock("../api/context", () => ({
  getTicketContext: vi.fn(),
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

describe("TicketModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormStatus.value = "ready";
    mockUpdateTicketMutation.isPending = false;
    mockUpdateTicketMutation.error = null;
  });

  it("shows an epic tag in the board modal header and navigates to epic details", async () => {
    render(
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

    await userEvent.click(screen.getByRole("button", { name: /open epic core epic/i }));

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/epic/$id",
      params: { id: "epic-1" },
    });
  });

  it("shows ticket save errors without requiring another submit", () => {
    mockUpdateTicketMutation.error = new Error("Unable to save ticket");

    render(<TicketModal ticket={createTicket()} epics={[]} onClose={vi.fn()} onUpdate={vi.fn()} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to save ticket");
  });

  it("shows demo history for completed tickets in the board modal", async () => {
    mockFormStatus.value = "done";

    render(
      <TicketModal
        ticket={createTicket({ status: "done", completedAt: "2026-04-25T11:00:00.000Z" })}
        epics={[]}
        onClose={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    expect(await screen.findByText("Demo panel loaded")).toBeInTheDocument();
  });
});
