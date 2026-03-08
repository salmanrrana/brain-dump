import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { WorkflowDisplayState } from "../../api/workflow";
import { ReviewFindingsPanel } from "./ReviewFindingsPanel";

function createWorkflowState(
  findingsSummary: Partial<WorkflowDisplayState["findingsSummary"]> = {}
): WorkflowDisplayState {
  return {
    currentPhase: "ai_review",
    reviewIteration: 1,
    demoCompleted: false,
    demoApproved: null,
    findingsSummary: {
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 0,
      fixed: 0,
      total: 0,
      ...findingsSummary,
    },
    demoGenerated: false,
    createdAt: "2026-03-08T00:00:00.000Z",
    updatedAt: "2026-03-08T00:00:00.000Z",
  };
}

describe("ReviewFindingsPanel", () => {
  it("shows a load button when findings have not been loaded yet", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ReviewFindingsPanel workflowState={null} onRetry={onRetry} />);

    expect(screen.getByText("Findings are not loaded yet.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /load findings/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a retry button when findings fail to load", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(<ReviewFindingsPanel workflowState={null} error="fetch failed" onRetry={onRetry} />);

    expect(screen.getByText("Failed to load findings")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a refresh button when findings are already visible", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    render(
      <ReviewFindingsPanel
        workflowState={createWorkflowState({ major: 1, fixed: 0, total: 1 })}
        onRetry={onRetry}
      />
    );

    expect(screen.getByText(/P1 \(Major\):/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /refresh findings/i }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
