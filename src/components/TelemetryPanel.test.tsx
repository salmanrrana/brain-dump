import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TelemetryPanel } from "./TelemetryPanel";
import type {
  TelemetrySessionAvailable,
  TelemetrySessionResult,
  TelemetryStatsAvailable,
  TelemetryStatsResult,
} from "../api/telemetry";

const mockGetTelemetryStats = vi.hoisted(() => vi.fn());
const mockGetLatestTelemetrySession = vi.hoisted(() => vi.fn());

vi.mock("../api/telemetry", async () => {
  const actual = await vi.importActual<typeof import("../api/telemetry")>("../api/telemetry");

  return {
    ...actual,
    getTelemetryStats: mockGetTelemetryStats,
    getLatestTelemetrySession: mockGetLatestTelemetrySession,
  };
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithQueryClient(component: React.ReactNode) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function createStatsResult(
  overrides: Partial<TelemetryStatsAvailable> = {}
): TelemetryStatsAvailable {
  return {
    status: "available",
    totalSessions: 1,
    totalPrompts: 4,
    totalToolCalls: 7,
    totalDurationMs: 1200,
    avgSessionDurationMs: 1200,
    mostUsedTools: [{ toolName: "Edit", count: 3 }],
    successRate: 100,
    latestSession: {
      id: "session-1",
      ticketId: "ticket-1",
      projectId: "project-1",
      environment: "claude-code",
      branchName: "feature/test",
      claudeSessionId: null,
      startedAt: "2026-03-08T00:00:00.000Z",
      endedAt: "2026-03-08T00:01:00.000Z",
      totalPrompts: 4,
      totalToolCalls: 7,
      totalDurationMs: 1200,
      totalTokens: null,
      outcome: "success",
    },
    ...overrides,
  };
}

function createLatestSessionResult(
  overrides: Partial<TelemetrySessionAvailable> = {}
): TelemetrySessionAvailable {
  return {
    status: "available",
    session: {
      id: "session-1",
      ticketId: "ticket-1",
      projectId: "project-1",
      environment: "claude-code",
      branchName: "feature/test",
      claudeSessionId: null,
      startedAt: "2026-03-08T00:00:00.000Z",
      endedAt: "2026-03-08T00:01:00.000Z",
      totalPrompts: 4,
      totalToolCalls: 7,
      totalDurationMs: 1200,
      totalTokens: null,
      outcome: "success",
      eventCount: 1,
      events: [
        {
          id: "event-1",
          sessionId: "session-1",
          ticketId: "ticket-1",
          eventType: "tool_end",
          toolName: "Edit",
          eventData: { success: true },
          durationMs: 400,
          tokenCount: null,
          isError: false,
          correlationId: "corr-1",
          createdAt: "2026-03-08T00:00:20.000Z",
        },
      ],
    },
    ...overrides,
  };
}

describe("TelemetryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTelemetryStats.mockResolvedValue(createStatsResult());
    mockGetLatestTelemetrySession.mockResolvedValue(createLatestSessionResult());
  });

  it("shows an upgrade-needed message when telemetry schema is unavailable", async () => {
    mockGetTelemetryStats.mockResolvedValue({
      status: "unavailable",
      reason: "missing_schema",
      message:
        "Telemetry is unavailable for this ticket because this Brain Dump install still needs the telemetry schema upgrade.",
    } satisfies TelemetryStatsResult);

    renderWithQueryClient(<TelemetryPanel ticketId="ticket-1" />);

    await waitFor(() => {
      expect(screen.getByText("Telemetry unavailable")).toBeInTheDocument();
    });

    expect(screen.getByText(/needs the telemetry schema upgrade/i)).toBeInTheDocument();
  });

  it("distinguishes no recorded telemetry from unavailable telemetry", async () => {
    mockGetTelemetryStats.mockResolvedValue(
      createStatsResult({
        totalSessions: 0,
        totalPrompts: 0,
        totalToolCalls: 0,
        totalDurationMs: 0,
        avgSessionDurationMs: 0,
        mostUsedTools: [],
        successRate: 0,
        latestSession: null,
      })
    );

    renderWithQueryClient(<TelemetryPanel ticketId="ticket-1" />);

    await waitFor(() => {
      expect(screen.getByText(/no ai telemetry recorded for this ticket yet/i)).toBeInTheDocument();
    });
  });

  it("shows a controlled timeline message for malformed event data", async () => {
    mockGetLatestTelemetrySession.mockResolvedValue({
      status: "unavailable",
      reason: "invalid_event_data",
      message:
        "Telemetry timeline is unavailable because one or more stored event payloads are malformed.",
    } satisfies TelemetrySessionResult);

    renderWithQueryClient(<TelemetryPanel ticketId="ticket-1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ai telemetry/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /ai telemetry/i }));
    await userEvent.click(screen.getByRole("button", { name: /show event timeline/i }));

    await waitFor(() => {
      expect(screen.getByText(/stored event payloads are malformed/i)).toBeInTheDocument();
    });
  });
});
