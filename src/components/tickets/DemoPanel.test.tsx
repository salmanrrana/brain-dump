import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DemoPanel } from "./DemoPanel";

const mockUseDemoScript = vi.hoisted(() => vi.fn());

vi.mock("../../lib/hooks", () => ({
  useDemoScript: mockUseDemoScript,
  useUpdateDemoStep: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useSubmitDemoFeedback: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("../Toast", () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

describe("DemoPanel", () => {
  it("shows completed demo history as a read-only checklist", () => {
    mockUseDemoScript.mockReturnValue({
      demoScript: {
        id: "demo-1",
        ticketId: "ticket-1",
        generatedAt: "2026-04-25T10:00:00.000Z",
        completedAt: "2026-04-25T11:00:00.000Z",
        passed: true,
        feedback: "Everything worked as expected.",
        steps: [
          {
            order: 1,
            type: "manual",
            description: "Open the completed ticket.",
            expectedOutcome: "The demo checklist remains visible.",
            status: "passed",
            notes: "Visible after completion.",
          },
          {
            order: 2,
            type: "visual",
            description: "Inspect the read-only review state.",
            expectedOutcome: "The panel is clearly not editable.",
            status: "skipped",
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DemoPanel ticketId="ticket-1" />);

    expect(screen.getByText("Read-Only Demo Review: Approved")).toBeInTheDocument();
    expect(screen.getByText("Verification Checklist Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Open the completed ticket.")).toBeInTheDocument();
    expect(screen.getByText("The demo checklist remains visible.")).toBeInTheDocument();
    expect(screen.getByText("Visible after completion.")).toBeInTheDocument();
    expect(screen.getByText("Everything worked as expected.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request changes/i })).not.toBeInTheDocument();
  });
});
