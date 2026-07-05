import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DemoPanel } from "./DemoPanel";

const mockUseDemoScript = vi.hoisted(() => vi.fn());
const mockUseVerificationRuns = vi.hoisted(() => vi.fn());
const mockUseTicketAttachments = vi.hoisted(() => vi.fn());

vi.mock("../../lib/hooks", () => ({
  useDemoScript: mockUseDemoScript,
  useVerificationRuns: mockUseVerificationRuns,
  useTicketAttachments: mockUseTicketAttachments,
}));

vi.mock("../Toast", () => ({
  useToast: vi.fn(() => ({ showToast: vi.fn() })),
}));

function mockBaseQueries() {
  mockUseVerificationRuns.mockReturnValue({
    verificationRuns: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
  mockUseTicketAttachments.mockReturnValue({
    attachments: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe("DemoPanel", () => {
  it("shows completed demo history as a read-only checklist", () => {
    mockBaseQueries();
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

    expect(screen.getByText("AI Verification Handoff")).toBeInTheDocument();
    expect(
      screen.getByText(
        "These steps are waiting for the verification runner. Manual approval has been retired."
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/Last recorded result: passed on/)).toBeInTheDocument();
    expect(screen.getByText("Open the completed ticket.")).toBeInTheDocument();
    expect(screen.getByText("The demo checklist remains visible.")).toBeInTheDocument();
    expect(screen.getByText("Visible after completion.")).toBeInTheDocument();
    expect(screen.getByText("Everything worked as expected.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request changes/i })).not.toBeInTheDocument();
  });

  it("shows failed runner evidence with a keyboard-accessible screenshot lightbox", async () => {
    const user = userEvent.setup();
    mockUseDemoScript.mockReturnValue({
      demoScript: {
        id: "demo-1",
        ticketId: "ticket-1",
        generatedAt: "2026-04-25T10:00:00.000Z",
        completedAt: null,
        passed: null,
        feedback: null,
        steps: [
          {
            order: 1,
            type: "visual",
            description: "Open the evidence viewer.",
            expectedOutcome: "Screenshot evidence is visible.",
            status: "failed",
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseVerificationRuns.mockReturnValue({
      verificationRuns: [
        {
          id: "run-1",
          ticketId: "ticket-1",
          round: 1,
          status: "failed",
          certified: false,
          integrityStatus: "valid",
          gitSha: "abcdef123456",
          startedAt: "2026-04-25T10:00:00.000Z",
          finishedAt: "2026-04-25T10:00:02.000Z",
          durationMs: 2000,
          manifest: {
            evidenceFiles: [{ path: "/tmp/step-1.png", hash: "hash-1" }],
            stepVerdicts: [
              {
                order: 1,
                status: "failed",
                message: "Expected banner was missing.",
                durationMs: 2000,
                evidenceFiles: [{ path: "/tmp/step-1.png", hash: "hash-1" }],
              },
            ],
          },
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseTicketAttachments.mockReturnValue({
      attachments: [
        {
          id: "attachment-1",
          filename: "step-1.png",
          size: 1000,
          isImage: true,
          url: "data:image/png;base64,abc",
          type: "verification-screenshot",
          priority: "primary",
          uploadedBy: "opencode ralph",
          uploadedAt: "2026-04-25T10:00:02.000Z",
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DemoPanel ticketId="ticket-1" ticketStatus="done" />);

    expect(screen.getByText("Verification Evidence")).toBeInTheDocument();
    expect(screen.getByText("Run 1")).toBeInTheDocument();
    expect(screen.getByText("Valid")).toBeInTheDocument();
    expect(screen.getByText("Expected banner was missing.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open screenshot evidence step-1\.png/i }));

    expect(
      screen.getByRole("dialog", { name: /evidence image: step-1\.png/i })
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: /evidence image/i })).not.toBeInTheDocument();
  });

  it("shows blocked verification tickets as needing attention", () => {
    mockBaseQueries();
    mockUseDemoScript.mockReturnValue({
      demoScript: {
        id: "demo-1",
        ticketId: "ticket-1",
        generatedAt: "2026-04-25T10:00:00.000Z",
        completedAt: null,
        passed: null,
        feedback: null,
        steps: [
          {
            order: 1,
            type: "automated",
            description: "Check blocked status.",
            expectedOutcome: "Blocked reason is visible.",
            status: "pending",
          },
        ],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(
      <DemoPanel
        ticketId="ticket-1"
        ticketStatus="ai_verification"
        isBlocked={true}
        blockedReason="Verification failed 3 consecutive times on step 1."
      />
    );

    expect(screen.getByText("Verification needs attention")).toBeInTheDocument();
    expect(
      screen.getByText("Verification failed 3 consecutive times on step 1.")
    ).toBeInTheDocument();
  });

  it("shows tampered integrity state in run history", () => {
    mockUseDemoScript.mockReturnValue({
      demoScript: {
        id: "demo-1",
        ticketId: "ticket-1",
        generatedAt: "2026-04-25T10:00:00.000Z",
        completedAt: null,
        passed: null,
        feedback: null,
        steps: [],
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseVerificationRuns.mockReturnValue({
      verificationRuns: [
        {
          id: "run-1",
          ticketId: "ticket-1",
          round: 1,
          status: "passed",
          certified: true,
          integrityStatus: "tampered",
          gitSha: null,
          startedAt: "2026-04-25T10:00:00.000Z",
          finishedAt: "2026-04-25T10:00:01.000Z",
          durationMs: 1000,
          manifest: null,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseTicketAttachments.mockReturnValue({
      attachments: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<DemoPanel ticketId="ticket-1" ticketStatus="done" />);

    expect(screen.getByText("Tampered")).toBeInTheDocument();
    expect(screen.getByText("Evidence files: 0")).toBeInTheDocument();
  });
});
