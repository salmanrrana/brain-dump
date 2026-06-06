import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TicketCodeChangesSection } from "./TicketCodeChangesSection";
import type { CodeChangeSummaryResult, CodeChangeStateKind } from "../../lib/hooks/code-changes";
import type { CodeChangeRouteSearchState } from "../../lib/code-change-route-search";

const mockUseTicketCodeChangeSummary = vi.hoisted(() => vi.fn());
const mockUseCodeChangePatch = vi.hoisted(() => vi.fn());

vi.mock("../../lib/hooks/code-changes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/hooks/code-changes")>(
    "../../lib/hooks/code-changes"
  );

  return {
    ...actual,
    useTicketCodeChangeSummary: mockUseTicketCodeChangeSummary,
    useCodeChangePatch: mockUseCodeChangePatch,
  };
});

function createSummary(overrides: Partial<CodeChangeSummaryResult> = {}): CodeChangeSummaryResult {
  return {
    scope: { type: "ticket", id: "ticket-1" },
    project: { id: "project-1", name: "Brain Dump" },
    state: { kind: "available", message: "Code changes are available." },
    totals: { files: 2, additions: 13, deletions: 3 },
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
            label: "Commit abc123",
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
            path: "src/features/auth/api.ts",
            additions: 3,
            deletions: 1,
            binary: false,
            status: "A",
            sourceIds: ["ticket:ticket-1:commit:abc123"],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function unavailableSummary(kind: CodeChangeStateKind, message: string): CodeChangeSummaryResult {
  return createSummary({
    state: { kind, message },
    totals: { files: 0, additions: 0, deletions: 0 },
    groups: [
      {
        ticketId: "ticket-1",
        title: "Ticket one",
        status: "in_progress",
        state: { kind, message },
        sources: [],
        files: [],
        totals: { files: 0, additions: 0, deletions: 0 },
      },
    ],
  });
}

function setSummary(summary: CodeChangeSummaryResult | null, extra: Record<string, unknown> = {}) {
  mockUseTicketCodeChangeSummary.mockReturnValue({
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

describe("TicketCodeChangesSection", () => {
  it("shows the changed file count and additions/deletions when changes are available", () => {
    setSummary(createSummary());

    render(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        branchName="feature/auth"
        search={closedSearch()}
        onSearchChange={vi.fn()}
      />
    );

    expect(screen.getByText("2 changed files")).toBeInTheDocument();
    expect(screen.getByText("+13")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /review changes/i })).toBeInTheDocument();
  });

  it("explains when the ticket has no linked code changes and disables review", () => {
    setSummary(
      unavailableSummary(
        "no_linked_changes",
        "No linked commits, branch, or pull request metadata is available for this ticket."
      )
    );

    render(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch()}
        onSearchChange={vi.fn()}
      />
    );

    expect(
      screen.getByText(/no linked commits, branch, or pull request metadata/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review changes/i })).not.toBeInTheDocument();
  });

  it("explains when the project is not a git repository", () => {
    setSummary(
      unavailableSummary("missing_git_repo", "Project path /tmp/app is not a git repository.")
    );

    render(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch()}
        onSearchChange={vi.fn()}
      />
    );

    expect(screen.getByText(/is not a git repository/i)).toBeInTheDocument();
  });

  it("does not fetch patch text while the panel is closed", () => {
    setSummary(createSummary());

    render(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch()}
        onSearchChange={vi.fn()}
      />
    );

    // Review surface is not rendered while closed, so the lazy patch hook never runs.
    expect(screen.queryByLabelText("Changed files")).not.toBeInTheDocument();
    expect(mockUseCodeChangePatch).not.toHaveBeenCalled();
  });

  it("lets the user open the panel and retry when the summary fails to load", async () => {
    const refetch = vi.fn();
    setSummary(null, { error: "git command failed" });
    mockUseTicketCodeChangeSummary.mockReturnValue({
      summary: null,
      loading: false,
      fetching: false,
      error: "git command failed",
      refetch,
    });

    // With an error, the header toggle stays enabled so the user can reach Retry.
    const { rerender } = render(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch()}
        onSearchChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /code changes/i })).toBeEnabled();

    rerender(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch({ open: true })}
        onSearchChange={vi.fn()}
      />
    );

    const retry = await screen.findByRole("button", { name: /retry/i });
    await userEvent.click(retry);
    expect(refetch).toHaveBeenCalled();
  });

  it("opens the panel via the toggle and reports the new open state", async () => {
    setSummary(createSummary());
    const onSearchChange = vi.fn();

    render(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch()}
        onSearchChange={onSearchChange}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /review changes/i }));

    expect(onSearchChange).toHaveBeenCalledWith({ open: true });
  });

  it("loads the selected file diff when opened directly from search params", async () => {
    setSummary(createSummary());
    mockUseCodeChangePatch.mockReturnValue({
      patch: {
        scope: { type: "ticket", id: "ticket-1" },
        ticketId: "ticket-1",
        filePath: "src/features/auth/Login.tsx",
        state: { kind: "available", message: "Patch is available." },
        patches: [
          {
            sourceId: "ticket:ticket-1:commit:abc123",
            sourceLabel: "Commit abc123",
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
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch({
          open: true,
          selectedFilePath: "src/features/auth/Login.tsx",
          selectedSourceId: "ticket:ticket-1:commit:abc123",
        })}
        onSearchChange={vi.fn()}
      />
    );

    // The review surface (lazy-loaded) renders its changed-files tree and the diff
    // for the deep-linked file.
    expect(await screen.findByLabelText("Changed files")).toBeInTheDocument();
    expect(await screen.findByLabelText("Unified diff")).toBeInTheDocument();
    expect(mockUseCodeChangePatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ticketId: "ticket-1",
        sourceId: "ticket:ticket-1:commit:abc123",
        filePath: "src/features/auth/Login.tsx",
      }),
      { enabled: true }
    );
  });

  it("resets stale file/source selection when switching tickets", () => {
    setSummary(createSummary());
    const onSearchChange = vi.fn();

    const { rerender } = render(
      <TicketCodeChangesSection
        ticketId="ticket-1"
        search={closedSearch({
          open: true,
          selectedFilePath: "src/features/auth/Login.tsx",
          selectedSourceId: "ticket:ticket-1:commit:abc123",
        })}
        onSearchChange={onSearchChange}
      />
    );

    onSearchChange.mockClear();

    rerender(
      <TicketCodeChangesSection
        ticketId="ticket-2"
        search={closedSearch({
          open: true,
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
});
