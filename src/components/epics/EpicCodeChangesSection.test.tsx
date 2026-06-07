import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EpicCodeChangesSection } from "./EpicCodeChangesSection";
import type { CodeChangeSummaryResult, CodeChangeStateKind } from "../../lib/hooks/code-changes";
import type { CodeChangeRouteSearchState } from "../../lib/code-change-route-search";

const mockUseEpicCodeChangeSummary = vi.hoisted(() => vi.fn());
const mockUseCodeChangePatch = vi.hoisted(() => vi.fn());

vi.mock("../../lib/hooks/code-changes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/hooks/code-changes")>(
    "../../lib/hooks/code-changes"
  );

  return {
    ...actual,
    useEpicCodeChangeSummary: mockUseEpicCodeChangeSummary,
    useCodeChangePatch: mockUseCodeChangePatch,
  };
});

// A two-ticket epic where both tickets touch src/common/util.ts, so it is a file
// shared across ticket groups.
function createSummary(overrides: Partial<CodeChangeSummaryResult> = {}): CodeChangeSummaryResult {
  return {
    scope: { type: "epic", id: "epic-1" },
    project: { id: "project-1", name: "Brain Dump" },
    state: { kind: "available", message: "Code changes are available for this scope." },
    totals: { files: 3, additions: 24, deletions: 6 },
    groups: [
      {
        ticketId: "ticket-1",
        title: "Ticket one",
        status: "in_progress",
        state: { kind: "available", message: "2 changed files found." },
        totals: { files: 2, additions: 13, deletions: 3 },
        sources: [
          {
            id: "ticket:ticket-1:commit:abc123",
            kind: "linked_commit",
            label: "Commit abc1234",
            commitHash: "abc123",
            state: { kind: "available", message: "Commit is available." },
          },
        ],
        files: [
          {
            path: "src/features/auth/Login.tsx",
            additions: 10,
            deletions: 2,
            binary: false,
            status: "M",
            sourceIds: ["ticket:ticket-1:commit:abc123"],
          },
          {
            path: "src/common/util.ts",
            additions: 3,
            deletions: 1,
            binary: false,
            status: "M",
            sourceIds: ["ticket:ticket-1:commit:abc123"],
          },
        ],
      },
      {
        ticketId: "ticket-2",
        title: "Ticket two",
        status: "ai_review",
        state: { kind: "available", message: "2 changed files found." },
        totals: { files: 2, additions: 11, deletions: 3 },
        sources: [
          {
            id: "ticket:ticket-2:commit:def456",
            kind: "linked_commit",
            label: "Commit def4567",
            commitHash: "def456",
            state: { kind: "available", message: "Commit is available." },
          },
        ],
        files: [
          {
            path: "src/features/dash/Panel.tsx",
            additions: 8,
            deletions: 2,
            binary: false,
            status: "A",
            sourceIds: ["ticket:ticket-2:commit:def456"],
          },
          {
            path: "src/common/util.ts",
            additions: 3,
            deletions: 1,
            binary: false,
            status: "M",
            sourceIds: ["ticket:ticket-2:commit:def456"],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function unavailableSummary(
  kind: CodeChangeStateKind,
  message: string,
  groups: CodeChangeSummaryResult["groups"] = []
): CodeChangeSummaryResult {
  return createSummary({
    state: { kind, message },
    totals: { files: 0, additions: 0, deletions: 0 },
    groups,
  });
}

function setSummary(summary: CodeChangeSummaryResult | null, extra: Record<string, unknown> = {}) {
  mockUseEpicCodeChangeSummary.mockReturnValue({
    summary,
    loading: false,
    fetching: false,
    error: null,
    refetch: vi.fn(),
    ...extra,
  });
}

function closedSearch(
  overrides: Partial<CodeChangeRouteSearchState> = {}
): CodeChangeRouteSearchState {
  return {
    open: false,
    wordWrap: true,
    ignoreWhitespace: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCodeChangePatch.mockReturnValue({
    patch: null,
    loading: false,
    fetching: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("EpicCodeChangesSection", () => {
  it("aggregates total changed files and stats across the epic's tickets", () => {
    setSummary(createSummary());

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        branchName="feature/epic-1"
        search={closedSearch()}
        onSearchChange={vi.fn()}
      />
    );

    expect(screen.getByText("3 changed files across 2 tickets")).toBeInTheDocument();
    expect(screen.getByText("+24")).toBeInTheDocument();
    expect(screen.getByText("-6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review changes/i })).toBeInTheDocument();
  });

  it("shows a per-ticket strip with title, status, and stats when opened", async () => {
    setSummary(createSummary());

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({ open: true })}
        onSearchChange={vi.fn()}
      />
    );

    // Both ticket groups appear in the strip alongside an "All tickets" option.
    expect(await screen.findByRole("button", { name: /All tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ticket one/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ticket two/i })).toBeInTheDocument();
    // Statuses are surfaced for each group.
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("AI Review")).toBeInTheDocument();
  });

  it("surfaces ticket metadata tags in the consolidated work ledger", async () => {
    setSummary(createSummary());

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        tickets={[
          {
            id: "ticket-1",
            priority: "high",
            isBlocked: true,
            blockedReason: "Waiting on review",
            branchName: "feature/ticket-1",
            prNumber: 17,
            prUrl: "https://example.com/pr/17",
            prStatus: "draft",
          },
        ]}
        currentTicketId="ticket-1"
        search={closedSearch({ open: true })}
        onSearchChange={vi.fn()}
      />
    );

    expect(await screen.findByText("High")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toHaveAttribute("title", "Waiting on review");
    expect(screen.getByText("PR #17")).toBeInTheDocument();
  });

  it("flags files that are shared across multiple tickets in the aggregate view", async () => {
    setSummary(createSummary());

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({ open: true })}
        onSearchChange={vi.fn()}
      />
    );

    // src/common/util.ts is touched by both tickets, so it is marked "shared".
    expect(await screen.findByLabelText("Changed files")).toBeInTheDocument();
    expect(screen.getByText("shared")).toBeInTheDocument();
  });

  it("filters to a single ticket group when one is selected from the strip", async () => {
    setSummary(createSummary());
    const onSearchChange = vi.fn();

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({ open: true })}
        onSearchChange={onSearchChange}
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: /Ticket two/i }));

    expect(onSearchChange).toHaveBeenCalledWith({
      selectedTicketId: "ticket-2",
      selectedFilePath: null,
      selectedSourceId: null,
    });
  });

  it("keeps the aggregate ticket filter when a file is selected from All tickets", async () => {
    setSummary(createSummary());
    const onSearchChange = vi.fn();

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({ open: true })}
        onSearchChange={onSearchChange}
      />
    );

    await userEvent.click(await screen.findByRole("button", { name: /util\.ts.*shared/i }));

    expect(onSearchChange).toHaveBeenCalledWith({
      selectedTicketId: null,
      selectedFilePath: "src/common/util.ts",
      selectedSourceId: "ticket:ticket-1:commit:abc123",
    });
  });

  it("loads a deep-linked shared file diff from the source's owning ticket", async () => {
    setSummary(createSummary());
    mockUseCodeChangePatch.mockReturnValue({
      patch: {
        scope: { type: "epic", id: "epic-1" },
        ticketId: "ticket-2",
        filePath: "src/common/util.ts",
        state: { kind: "available", message: "Patch is available." },
        patches: [
          {
            sourceId: "ticket:ticket-2:commit:def456",
            sourceLabel: "Commit def4567",
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      },
      loading: false,
      fetching: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({
          open: true,
          selectedFilePath: "src/common/util.ts",
          selectedSourceId: "ticket:ticket-2:commit:def456",
        })}
        onSearchChange={vi.fn()}
      />
    );

    expect(await screen.findByLabelText("Unified diff")).toBeInTheDocument();
    expect(mockUseCodeChangePatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: { type: "epic", id: "epic-1" },
        ticketId: "ticket-2",
        sourceId: "ticket:ticket-2:commit:def456",
        filePath: "src/common/util.ts",
      }),
      { enabled: true }
    );
  });

  it("explains when the epic has no tickets", () => {
    setSummary(unavailableSummary("no_linked_changes", "No tickets are available in this scope."));

    render(
      <EpicCodeChangesSection epicId="epic-1" search={closedSearch()} onSearchChange={vi.fn()} />
    );

    expect(screen.getByText(/no tickets are available in this scope/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review changes/i })).not.toBeInTheDocument();
  });

  it("explains when tickets exist but have no linked code changes", () => {
    setSummary(
      unavailableSummary(
        "no_linked_changes",
        "No linked commits, branch, or pull request metadata is available for this ticket.",
        [
          {
            ticketId: "ticket-1",
            title: "Ticket one",
            status: "ready",
            state: {
              kind: "no_linked_changes",
              message: "No linked commits, branch, or pull request metadata is available.",
            },
            sources: [],
            files: [],
            totals: { files: 0, additions: 0, deletions: 0 },
          },
        ]
      )
    );

    render(
      <EpicCodeChangesSection epicId="epic-1" search={closedSearch()} onSearchChange={vi.fn()} />
    );

    expect(screen.getByText("1 ticket, no linked file changes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show tickets/i })).toBeInTheDocument();
  });

  it("opens the ticket ledger even before a ticket has file diffs", async () => {
    setSummary(
      unavailableSummary(
        "no_linked_changes",
        "No linked commits, branch, or pull request metadata is available for this ticket.",
        [
          {
            ticketId: "ticket-1",
            title: "Ticket one",
            status: "ready",
            state: {
              kind: "no_linked_changes",
              message: "No linked commits, branch, or pull request metadata is available.",
            },
            sources: [],
            files: [],
            totals: { files: 0, additions: 0, deletions: 0 },
          },
        ]
      )
    );

    const onSearchChange = vi.fn();
    const { rerender } = render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch()}
        onSearchChange={onSearchChange}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /show tickets/i }));

    expect(onSearchChange).toHaveBeenCalledWith({ open: true });

    rerender(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({ open: true })}
        onSearchChange={onSearchChange}
      />
    );

    expect(await screen.findByText("Work ledger")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ticket one/i })).toBeInTheDocument();
    expect(screen.getByText("No source")).toBeInTheDocument();
  });

  it("explains when the project is not a git repository", () => {
    setSummary(
      unavailableSummary("missing_git_repo", "Project path /tmp/app is not a git repository.")
    );

    render(
      <EpicCodeChangesSection epicId="epic-1" search={closedSearch()} onSearchChange={vi.fn()} />
    );

    expect(screen.getByText(/is not a git repository/i)).toBeInTheDocument();
  });

  it("does not fetch patch text while the panel is closed", () => {
    setSummary(createSummary());

    render(
      <EpicCodeChangesSection epicId="epic-1" search={closedSearch()} onSearchChange={vi.fn()} />
    );

    expect(screen.queryByLabelText("Changed files")).not.toBeInTheDocument();
    expect(mockUseCodeChangePatch).not.toHaveBeenCalled();
  });

  it("loads a deep-linked file diff scoped to the selected ticket", async () => {
    setSummary(createSummary());
    mockUseCodeChangePatch.mockReturnValue({
      patch: {
        scope: { type: "epic", id: "epic-1" },
        ticketId: "ticket-2",
        filePath: "src/features/dash/Panel.tsx",
        state: { kind: "available", message: "Patch is available." },
        patches: [
          {
            sourceId: "ticket:ticket-2:commit:def456",
            sourceLabel: "Commit def4567",
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      },
      loading: false,
      fetching: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({
          open: true,
          selectedTicketId: "ticket-2",
          selectedFilePath: "src/features/dash/Panel.tsx",
          selectedSourceId: "ticket:ticket-2:commit:def456",
        })}
        onSearchChange={vi.fn()}
      />
    );

    expect(await screen.findByLabelText("Unified diff")).toBeInTheDocument();
    expect(mockUseCodeChangePatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: { type: "epic", id: "epic-1" },
        ticketId: "ticket-2",
        sourceId: "ticket:ticket-2:commit:def456",
        filePath: "src/features/dash/Panel.tsx",
      }),
      { enabled: true }
    );
  });

  it("resets stale ticket/file/source selection when switching epics", () => {
    setSummary(createSummary());
    const onSearchChange = vi.fn();

    const { rerender } = render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch({
          open: true,
          selectedTicketId: "ticket-1",
          selectedFilePath: "src/features/auth/Login.tsx",
          selectedSourceId: "ticket:ticket-1:commit:abc123",
        })}
        onSearchChange={onSearchChange}
      />
    );

    onSearchChange.mockClear();

    rerender(
      <EpicCodeChangesSection
        epicId="epic-2"
        search={closedSearch({
          open: true,
          selectedTicketId: "ticket-1",
          selectedFilePath: "src/features/auth/Login.tsx",
          selectedSourceId: "ticket:ticket-1:commit:abc123",
        })}
        onSearchChange={onSearchChange}
      />
    );

    expect(onSearchChange).toHaveBeenCalledWith({
      selectedFilePath: null,
      selectedSourceId: null,
      selectedTicketId: null,
    });
  });

  it("opens the panel via the toggle and reports the new open state", async () => {
    setSummary(createSummary());
    const onSearchChange = vi.fn();

    render(
      <EpicCodeChangesSection
        epicId="epic-1"
        search={closedSearch()}
        onSearchChange={onSearchChange}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /review changes/i }));

    expect(onSearchChange).toHaveBeenCalledWith({ open: true });
  });
});
