import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditTicketModal } from "./EditTicketModal";

const mockShowToast = vi.hoisted(() => vi.fn());
const mockLaunchCodexInTerminal = vi.hoisted(() => vi.fn());
const mockGetTicketContext = vi.hoisted(() => vi.fn());

vi.mock("../../lib/hooks", () => ({
  useClickOutside: vi.fn(),
  useModalKeyboard: vi.fn(),
  useProjects: vi.fn(() => ({
    projects: [
      {
        id: "project-1",
        name: "Brain Dump",
        path: "/Users/test/brain-dump",
        epics: [],
      },
    ],
  })),
  useTags: vi.fn(() => ({ tags: [] })),
  useUpdateTicket: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
    error: null,
  })),
  useDeleteTicket: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useTicketDeletePreview: vi.fn(() => ({ data: null })),
  useSettings: vi.fn(() => ({ settings: { terminalEmulator: null } })),
  useLaunchRalphForTicket: vi.fn(() => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
  })),
}));

vi.mock("../Toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock("./TagInput", () => ({
  TagInput: () => <div data-testid="tag-input" />,
}));

vi.mock("./EpicSelect", () => ({
  EpicSelect: () => <div data-testid="epic-select" />,
}));

vi.mock("./SubtaskList", () => ({
  SubtaskList: () => <div data-testid="subtask-list" />,
}));

vi.mock("../epics/CreateEpicModal", () => ({
  CreateEpicModal: () => null,
}));

vi.mock("./LaunchActions", () => ({
  LaunchActions: ({ onLaunch }: { onLaunch: (type: string) => void }) => (
    <button type="button" onClick={() => onLaunch("codex-app")}>
      Launch Codex App
    </button>
  ),
}));

vi.mock("../../api/context", () => ({
  getTicketContext: mockGetTicketContext,
}));

vi.mock("../../api/terminal", () => ({
  launchClaudeInTerminal: vi.fn(),
  launchCodexInTerminal: mockLaunchCodexInTerminal,
  launchVSCodeInTerminal: vi.fn(),
  launchCursorInTerminal: vi.fn(),
  launchCopilotInTerminal: vi.fn(),
  launchOpenCodeInTerminal: vi.fn(),
}));

vi.mock("../../api/workflow-server-fns", () => ({
  startTicketWorkflowFn: vi.fn().mockResolvedValue({ success: true, warnings: [] }),
}));

describe("EditTicketModal launch behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetTicketContext.mockResolvedValue({
      context: "# Task: Validate security tier",
      projectPath: "/Users/test/brain-dump",
      projectName: "Brain Dump",
      epicName: "Core Epic",
      ticketTitle: "Validate security tier",
    });

    mockLaunchCodexInTerminal.mockResolvedValue({
      success: true,
      method: "app",
      message: "Opened Codex App.",
      terminalUsed: "Codex App",
      warnings: [],
    });
  });

  it("launches Codex App for a ticket using launchMode app", async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();

    render(
      <EditTicketModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        ticket={
          {
            id: "ticket-1",
            title: "Validate security tier",
            description: "Ensure valid values",
            status: "ready",
            priority: "high",
            projectId: "project-1",
            epicId: null,
            tags: "[]",
            subtasks: "[]",
            isBlocked: false,
            blockedReason: null,
          } as never
        }
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Launch Codex App" }));

    await waitFor(() => {
      expect(mockLaunchCodexInTerminal).toHaveBeenCalledWith({
        data: {
          ticketId: "ticket-1",
          context: "# Task: Validate security tier",
          projectPath: "/Users/test/brain-dump",
          launchMode: "app",
          preferredTerminal: null,
          projectName: "Brain Dump",
          epicName: "Core Epic",
          ticketTitle: "Validate security tier",
        },
      });
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
