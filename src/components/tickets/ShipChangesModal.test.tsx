import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { ShipChangesModal } from "./ShipChangesModal";

const mockShowToast = vi.hoisted(() => vi.fn());
const mockGetShipPrep = vi.hoisted(() => vi.fn());
const mockGeneratePrBodyServerFn = vi.hoisted(() => vi.fn());
const mockCommitAndShipServerFn = vi.hoisted(() => vi.fn());
const mockStartTicketWorkflowFn = vi.hoisted(() => vi.fn());
const mockStartEpicWorkflowFn = vi.hoisted(() => vi.fn());
const mockLaunchTerminal = vi.hoisted(() => vi.fn());

vi.mock("../Toast", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock("../../api/ship-server-fns", () => ({
  getShipPrep: mockGetShipPrep,
  generatePrBodyServerFn: mockGeneratePrBodyServerFn,
  commitAndShipServerFn: mockCommitAndShipServerFn,
}));

vi.mock("../../api/workflow-server-fns", () => ({
  startTicketWorkflowFn: mockStartTicketWorkflowFn,
  startEpicWorkflowFn: mockStartEpicWorkflowFn,
}));

vi.mock("../../api/dev-tools", () => ({
  launchTerminal: mockLaunchTerminal,
}));

function createPrepResult(
  overrides: Partial<{
    changedFiles: Array<{ path: string; status: string }>;
    currentBranch: string;
    isSafeToShip: boolean;
    reviewMarkerFresh: boolean;
    ghAvailable: boolean;
    remoteConfigured: boolean;
    inferredScope: { type: "ticket" | "epic"; id: string; title: string } | null;
  }> = {}
) {
  return {
    success: true as const,
    changedFiles: [
      { path: "src/app.tsx", status: "M" },
      { path: "src/new-file.ts", status: "??" },
    ],
    currentBranch: "feature/ship-changes",
    isSafeToShip: true,
    reviewMarkerFresh: true,
    ghAvailable: true,
    remoteConfigured: true,
    inferredScope: {
      type: "ticket" as const,
      id: "ticket-1",
      title: "Ship Changes",
    },
    ...overrides,
  };
}

function renderModal(overrides: Partial<ComponentProps<typeof ShipChangesModal>> = {}) {
  const props: ComponentProps<typeof ShipChangesModal> = {
    isOpen: true,
    onClose: vi.fn(),
    projectPath: "/tmp/brain-dump",
    scopeType: "ticket",
    scopeId: "aa778958-2b89-4471-8711-72523627a93e",
    scopeTitle: "Ship Changes",
    onSuccess: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(<ShipChangesModal {...props} />),
  };
}

describe("ShipChangesModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetShipPrep.mockResolvedValue(createPrepResult());
    mockGeneratePrBodyServerFn.mockResolvedValue({
      success: true,
      body: "## Summary\n\n<!-- brain-dump:demo-steps -->",
    });
    mockCommitAndShipServerFn.mockResolvedValue({
      success: true,
      commitHash: "abc1234",
      prNumber: 42,
      prUrl: "https://example.com/pr/42",
    });
    mockStartTicketWorkflowFn.mockResolvedValue({
      success: true,
      branchName: "feature/ship-changes",
      branchCreated: true,
      usingEpicBranch: false,
      warnings: [],
    });
    mockStartEpicWorkflowFn.mockResolvedValue({
      success: true,
      branchName: "feature/ship-changes",
      branchCreated: true,
      warnings: [],
    });
    mockLaunchTerminal.mockResolvedValue({
      success: true,
      message: "Terminal opened in /tmp/brain-dump",
    });
  });

  it("loads preflight data on open, lets the user choose files, and completes the happy path", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    await waitFor(() => {
      expect(mockGetShipPrep).toHaveBeenCalledWith({
        data: { ticketId: props.scopeId },
      });
      expect(mockGeneratePrBodyServerFn).toHaveBeenCalledWith({
        data: { scopeType: "ticket", scopeId: props.scopeId },
      });
    });

    expect(screen.getByText("src/app.tsx")).toBeInTheDocument();
    expect(screen.getByText("src/new-file.ts")).toBeInTheDocument();
    expect(screen.getByDisplayValue("feat(aa778958): Ship Changes")).toBeInTheDocument();

    const selectAll = screen.getByRole("checkbox", { name: /select all/i });
    const shipButton = screen.getByRole("button", { name: /ship changes/i });

    await user.click(selectAll);
    expect(shipButton).toBeDisabled();

    await user.click(selectAll);
    expect(shipButton).not.toBeDisabled();

    await user.click(shipButton);

    await waitFor(() => {
      expect(mockCommitAndShipServerFn).toHaveBeenCalledWith({
        data: {
          scopeType: "ticket",
          scopeId: props.scopeId,
          message: "feat(aa778958): Ship Changes",
          selectedPaths: ["src/app.tsx", "src/new-file.ts"],
          prTitle: "Ship Changes",
          prBody: "## Summary\n\n<!-- brain-dump:demo-steps -->",
          draft: true,
        },
      });
    });

    expect(await screen.findByText("Pull request created")).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Close$/i }));

    expect(props.onSuccess).toHaveBeenCalledWith("https://example.com/pr/42");
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows blocked-review, launches a terminal for review, and rechecks back into preflight", async () => {
    const user = userEvent.setup();
    mockGetShipPrep
      .mockResolvedValueOnce(createPrepResult({ reviewMarkerFresh: false }))
      .mockResolvedValueOnce(createPrepResult({ reviewMarkerFresh: true }));

    renderModal();

    expect(await screen.findByTestId("ship-blocked-review")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /run review/i }));

    await waitFor(() => {
      expect(mockLaunchTerminal).toHaveBeenCalledWith({
        data: { projectPath: "/tmp/brain-dump" },
      });
    });

    await user.click(screen.getByRole("button", { name: /recheck/i }));

    await waitFor(() => {
      expect(mockGetShipPrep).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("ship-blocked-review")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /ship changes/i })).toBeInTheDocument();
  });

  it("shows blocked-main and creates a feature branch before returning to preflight", async () => {
    const user = userEvent.setup();
    mockGetShipPrep
      .mockResolvedValueOnce(
        createPrepResult({
          currentBranch: "main",
          isSafeToShip: false,
        })
      )
      .mockResolvedValueOnce(createPrepResult());

    const { props } = renderModal();

    expect(await screen.findByTestId("ship-blocked-main")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create feature branch and continue/i }));

    await waitFor(() => {
      expect(mockStartTicketWorkflowFn).toHaveBeenCalledWith({
        data: {
          ticketId: props.scopeId,
          projectPath: props.projectPath,
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId("ship-blocked-main")).not.toBeInTheDocument();
    });
    expect(screen.getByText(/feature\/ship-changes can be shipped/i)).toBeInTheDocument();
  });

  it("keeps shipping disabled when gh or remote checks fail and leaves the blocking feedback visible", async () => {
    const user = userEvent.setup();
    mockGetShipPrep.mockResolvedValueOnce(
      createPrepResult({
        ghAvailable: false,
        remoteConfigured: false,
      })
    );

    renderModal();

    expect(await screen.findByText("gh is not installed or not on PATH")).toBeInTheDocument();
    expect(screen.getByText("No remote configured")).toBeInTheDocument();

    const shipButton = screen.getByRole("button", { name: /ship changes/i });
    expect(shipButton).toBeDisabled();

    await user.click(shipButton);
    expect(mockCommitAndShipServerFn).not.toHaveBeenCalled();
  });

  it("submits from the commit-message field when Enter is pressed and preflight is valid", async () => {
    const user = userEvent.setup();
    const { props } = renderModal();

    const commitInput = await screen.findByDisplayValue("feat(aa778958): Ship Changes");
    await user.clear(commitInput);
    await user.type(commitInput, "feat(ship): updated flow{Enter}");

    await waitFor(() => {
      expect(mockCommitAndShipServerFn).toHaveBeenCalledWith({
        data: {
          scopeType: "ticket",
          scopeId: props.scopeId,
          message: "feat(ship): updated flow",
          selectedPaths: ["src/app.tsx", "src/new-file.ts"],
          prTitle: "Ship Changes",
          prBody: "## Summary\n\n<!-- brain-dump:demo-steps -->",
          draft: true,
        },
      });
    });
  });

  it("surfaces ship failures in the error state and lets the user retry from preflight", async () => {
    const user = userEvent.setup();
    mockCommitAndShipServerFn.mockResolvedValueOnce({
      success: false,
      step: "push",
      error: "Push failed: remote rejected the branch update",
    });

    renderModal();

    await screen.findByRole("button", { name: /ship changes/i });
    await user.click(screen.getByRole("button", { name: /ship changes/i }));

    const errorState = await screen.findByTestId("ship-error-state");
    expect(errorState).toBeInTheDocument();
    expect(within(errorState).getAllByText("Push branch").length).toBeGreaterThan(0);
    expect(within(errorState).getByText(/remote rejected the branch update/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry from preflight/i }));

    await waitFor(() => {
      expect(mockGetShipPrep).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole("button", { name: /ship changes/i })).toBeInTheDocument();
  });

  it.each([
    ["commit", /commit failed because lint hooks rejected the changes/i, /create commit/i],
    ["pr", /gh pr create returned a non-zero exit status/i, /create pull request/i],
  ] as const)(
    "surfaces %s failures with the failed step still visible to the user",
    async (step, message, failedStep) => {
      const user = userEvent.setup();
      mockCommitAndShipServerFn.mockResolvedValueOnce({
        success: false,
        step,
        error:
          step === "commit"
            ? "Commit failed because lint hooks rejected the changes"
            : "gh pr create returned a non-zero exit status",
      });

      renderModal();

      await user.click(await screen.findByRole("button", { name: /ship changes/i }));

      const errorState = await screen.findByTestId("ship-error-state");
      expect(errorState).toBeInTheDocument();
      expect(within(errorState).getAllByText(failedStep).length).toBeGreaterThan(0);
      expect(within(errorState).getByText(message)).toBeInTheDocument();
    }
  );

  it("closes on Escape before shipping, but ignores Escape while running", async () => {
    const user = userEvent.setup();
    const { props, unmount } = renderModal();

    await screen.findByRole("button", { name: /ship changes/i });
    await user.keyboard("{Escape}");

    expect(props.onClose).toHaveBeenCalledTimes(1);
    unmount();

    let resolveShip:
      | ((value: { success: true; commitHash: string; prNumber: number; prUrl: string }) => void)
      | undefined;
    mockCommitAndShipServerFn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveShip = resolve;
        })
    );

    const { props: runningProps } = renderModal({ onClose: vi.fn() });

    await user.click(await screen.findByRole("button", { name: /ship changes/i }));

    expect(await screen.findByTestId("ship-running-state")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(runningProps.onClose).not.toHaveBeenCalled();

    if (resolveShip) {
      resolveShip({
        success: true,
        commitHash: "abc1234",
        prNumber: 42,
        prUrl: "https://example.com/pr/42",
      });
    }

    await screen.findByTestId("ship-done-state");
  });
});
