import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChangedFilesTree } from "./ChangedFilesTree";
import { buildCodeChangeFileTree } from "./file-tree";
import { CodeChangeReviewSurface } from "./CodeChangeReviewSurface";
import { DiffPatchViewer } from "./DiffPatchViewer";
import type { CodeChangeSummaryResult } from "../../lib/hooks/code-changes";

const mockUseCodeChangePatch = vi.hoisted(() => vi.fn());

vi.mock("../../lib/hooks/code-changes", async () => {
  const actual = await vi.importActual<typeof import("../../lib/hooks/code-changes")>(
    "../../lib/hooks/code-changes"
  );

  return {
    ...actual,
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
        state: { kind: "available", message: "Code changes are available." },
        totals: { files: 2, additions: 13, deletions: 3 },
        sources: [
          {
            id: "ticket:ticket-1:commit:abc123",
            kind: "linked_commit",
            label: "abc123 Commit abc123",
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

beforeEach(() => {
  mockUseCodeChangePatch.mockReturnValue({
    patch: null,
    loading: false,
    fetching: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe("ChangedFilesTree", () => {
  it("builds a compact directory tree and lets users select a file", async () => {
    const summary = createSummary();
    const tree = buildCodeChangeFileTree(summary.groups[0]?.files ?? []);

    expect(tree[0]?.name).toBe("src/features/auth");
    expect(tree[0]?.files).toBe(2);

    const onSelectFile = vi.fn();
    render(<ChangedFilesTree files={summary.groups[0]?.files ?? []} onSelectFile={onSelectFile} />);

    expect(screen.getByRole("button", { name: /src\/features\/auth/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Login\.tsx/i }));

    expect(onSelectFile).toHaveBeenCalledWith(
      expect.objectContaining({ path: "src/features/auth/Login.tsx" }),
      "ticket:ticket-1:commit:abc123"
    );
  });

  it("handles a large synthetic summary without requiring patch text", () => {
    const files = Array.from({ length: 1000 }, (_, index) => ({
      path: `src/large/file-${index}.ts`,
      additions: 1,
      deletions: 0,
      binary: false,
      status: "M",
      sourceIds: ["ticket:ticket-1:commit:abc123"],
    }));

    render(<ChangedFilesTree files={files} />);

    expect(screen.getByText("Changed files")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /src\/large/i })).toBeInTheDocument();
  });
});

describe("CodeChangeReviewSurface", () => {
  it("shows loading, error, and empty states explicitly", () => {
    const selection = { wordWrap: true, ignoreWhitespace: false };

    const { rerender } = render(
      <CodeChangeReviewSurface
        scope={{ type: "ticket", id: "ticket-1" }}
        summary={null}
        open={true}
        loading={true}
        selection={selection}
      />
    );
    expect(screen.getByText(/loading code-change summary/i)).toBeInTheDocument();

    rerender(
      <CodeChangeReviewSurface
        scope={{ type: "ticket", id: "ticket-1" }}
        summary={null}
        open={true}
        error="Git repository is unavailable."
        selection={selection}
      />
    );
    expect(screen.getByText("Git repository is unavailable.")).toBeInTheDocument();

    rerender(
      <CodeChangeReviewSurface
        scope={{ type: "ticket", id: "ticket-1" }}
        summary={createSummary({ groups: [], totals: { files: 0, additions: 0, deletions: 0 } })}
        open={true}
        selection={selection}
      />
    );
    expect(screen.getByText(/no code changes to review/i)).toBeInTheDocument();
  });

  it("does not fetch full patch text until a file is selected", async () => {
    const onSelectionChange = vi.fn();

    render(
      <CodeChangeReviewSurface
        scope={{ type: "ticket", id: "ticket-1" }}
        summary={createSummary()}
        open={true}
        selection={{ wordWrap: true, ignoreWhitespace: false }}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByText("Select a file to load its diff.")).toBeInTheDocument();
    expect(mockUseCodeChangePatch).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { type: "ticket", id: "ticket-1" } }),
      { enabled: false }
    );

    await userEvent.click(screen.getByRole("button", { name: /Login\.tsx/i }));

    expect(onSelectionChange).toHaveBeenCalledWith({
      selectedTicketId: "ticket-1",
      selectedFilePath: "src/features/auth/Login.tsx",
      selectedSourceId: "ticket:ticket-1:commit:abc123",
    });
  });

  it("shows patch loading and then renders selected unified diff", () => {
    mockUseCodeChangePatch.mockReturnValue({
      patch: {
        scope: { type: "ticket", id: "ticket-1" },
        ticketId: "ticket-1",
        filePath: "src/features/auth/Login.tsx",
        state: { kind: "available", message: "Patch is available." },
        patches: [
          {
            sourceId: "ticket:ticket-1:commit:abc123",
            sourceLabel: "abc123 Commit abc123",
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
      <CodeChangeReviewSurface
        scope={{ type: "ticket", id: "ticket-1" }}
        summary={createSummary()}
        open={true}
        selection={{
          selectedFilePath: "src/features/auth/Login.tsx",
          selectedSourceId: "ticket:ticket-1:commit:abc123",
          wordWrap: true,
          ignoreWhitespace: false,
        }}
      />
    );

    expect(mockUseCodeChangePatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ticketId: "ticket-1",
        sourceId: "ticket:ticket-1:commit:abc123",
        filePath: "src/features/auth/Login.tsx",
      }),
      { enabled: true }
    );
    expect(screen.getByLabelText("Unified diff")).toBeInTheDocument();
  });
});

describe("DiffPatchViewer", () => {
  it("renders binary and large diff fallback states", () => {
    const { rerender } = render(
      <DiffPatchViewer patch="Binary files a/logo.png and b/logo.png differ" />
    );
    expect(screen.getByText("Binary file")).toBeInTheDocument();

    const largePatch = `${"@@ -1 +1 @@\n+line\n"}${" context\n".repeat(130000)}`;
    rerender(<DiffPatchViewer patch={largePatch} />);
    expect(screen.getByText(/large patch rendered with virtualization/i)).toBeInTheDocument();
  });
});
