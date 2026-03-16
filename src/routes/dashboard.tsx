import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTickets,
  useActiveRalphSessions,
  useDashboardAnalytics,
  useDashboardTelemetryAnalytics,
  useCostAnalytics,
} from "../lib/hooks";
import { getTickets } from "../api/tickets";
import { getDashboardAnalytics } from "../api/analytics";
import { getDashboardTelemetryAnalytics } from "../api/telemetry";
import { getCostAnalytics, getCostExplorerData } from "../api/cost";
import { queryKeys } from "../lib/query-keys";
import {
  StatsGrid,
  AnalyticsSection,
  AITelemetryTab,
  CostExplorerTab,
} from "../components/dashboard";
import type { StatFilter } from "../components/dashboard";

import { DashboardSkeleton } from "../components/route-skeletons";

type DashboardTab = "overview" | "ai-telemetry" | "cost-explorer";
export const Route = createFileRoute("/dashboard")({
  pendingComponent: DashboardSkeleton,
  loader: ({ context }) => {
    // Pre-warm cache with tickets (for stats), analytics, telemetry, and cost in parallel
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.tickets({}),
      queryFn: () => getTickets({ data: {} }),
      staleTime: 30_000,
    });
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.analytics.dashboard(),
      queryFn: () => getDashboardAnalytics(),
      staleTime: 60_000,
    });
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.telemetry.dashboardAnalytics(),
      queryFn: () => getDashboardTelemetryAnalytics(),
      staleTime: 60_000,
    });
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.cost.dashboardAnalytics(),
      queryFn: () => getCostAnalytics(),
      staleTime: 300_000,
    });
  },
  component: Dashboard,
  errorComponent: DashboardError,
});

/**
 * Error component for dashboard route - shows user-friendly error with retry option.
 */
function DashboardError({ error }: { error: Error }) {
  console.error("Dashboard error:", error);

  return (
    <div style={errorContainerStyles}>
      <h2 style={errorTitleStyles}>Dashboard Error</h2>
      <p style={errorMessageStyles}>{error.message}</p>
      <button type="button" onClick={() => window.location.reload()} style={errorButtonStyles}>
        Reload Page
      </button>
    </div>
  );
}

const errorContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  gap: "var(--spacing-4)",
  color: "var(--text-primary)",
};

const errorTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  margin: 0,
};

const errorMessageStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  margin: 0,
};

const errorButtonStyles: React.CSSProperties = {
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--accent-primary)",
  color: "white",
  border: "none",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

/**
 * Dashboard route - Overview page with stats and analytics.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Dashboard                                                    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
 * │ │ Total  │ │In Prog │ │AI Active│ │ Done   │                │
 * │ └────────┘ └────────┘ └────────┘ └────────┘                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Analytics Section (8 cards in responsive grid)              │
 * │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                        │
 * │ │Chart │ │Chart │ │Chart │ │Chart │                        │
 * │ └──────┘ └──────┘ └──────┘ └──────┘                        │
 * │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                        │
 * │ │Chart │ │Chart │ │Chart │ │Chart │                        │
 * │ └──────┘ └──────┘ └──────┘ └──────┘                        │
 * └─────────────────────────────────────────────────────────────┘
 */
function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const { tickets, loading, error } = useTickets();
  const { sessions } = useActiveRalphSessions();
  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useDashboardAnalytics();
  const {
    data: telemetryAnalytics,
    isLoading: telemetryLoading,
    error: telemetryError,
  } = useDashboardTelemetryAnalytics();
  const { data: costAnalytics, error: costError } = useCostAnalytics();
  const queryClient = useQueryClient();

  const prefetchExplorer = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.cost.explorer(),
      queryFn: async () => {
        const result = await getCostExplorerData({ data: {} });
        return result;
      },
      staleTime: 300_000,
    });
  }, [queryClient]);

  const handleStatClick = useCallback(
    async (filter: StatFilter) => {
      try {
        await navigate({ to: "/board" });
        if (filter === "all") return;

        let columnSelector: string;
        switch (filter) {
          case "in_progress":
            columnSelector = '[data-status="in_progress"]';
            break;
          case "done":
            columnSelector = '[data-status="done"]';
            break;
          case "ai_active":
            columnSelector = '[data-status="in_progress"]';
            break;
          default:
            return;
        }

        const column = document.querySelector(columnSelector);
        if (column) {
          column.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
        }
      } catch (navError) {
        console.error("Failed to navigate to board:", navError);
      }
    },
    [navigate]
  );

  if (loading) {
    return <div className="h-full" />;
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--accent-danger)]">{error}</p>
      </div>
    );
  }

  const totalCount = tickets.length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const aiActiveCount = Object.keys(sessions).length;
  const doneCount = tickets.filter((t) => t.status === "done").length;

  return (
    <div style={containerStyles} className="route-fade-in">
      <div style={headerRowStyles}>
        <h1 style={titleStyles}>Dashboard</h1>
        <div style={tabBarStyles} role="tablist" aria-label="Dashboard tabs">
          <button
            role="tab"
            aria-selected={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            style={activeTab === "overview" ? activeTabStyles : tabStyles}
          >
            Overview
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "ai-telemetry"}
            onClick={() => setActiveTab("ai-telemetry")}
            style={activeTab === "ai-telemetry" ? activeTabStyles : tabStyles}
          >
            AI Telemetry
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "cost-explorer"}
            onClick={() => setActiveTab("cost-explorer")}
            onMouseEnter={prefetchExplorer}
            style={activeTab === "cost-explorer" ? activeTabStyles : tabStyles}
          >
            Cost Explorer
          </button>
        </div>
      </div>

      <StatsGrid
        total={totalCount}
        inProgress={inProgressCount}
        aiActive={aiActiveCount}
        done={doneCount}
        onStatClick={handleStatClick}
      />

      {activeTab === "overview" && analytics && (
        <AnalyticsSection analytics={analytics} loading={analyticsLoading} error={analyticsError} />
      )}

      {activeTab === "ai-telemetry" && telemetryAnalytics && (
        <AITelemetryTab
          analytics={telemetryAnalytics}
          isLoading={telemetryLoading}
          error={telemetryError}
          costAnalytics={costAnalytics}
          costError={costError}
        />
      )}

      {activeTab === "cost-explorer" && <CostExplorerTab />}
    </div>
  );
}

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
  height: "100%",
};

const headerRowStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-4)",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const tabBarStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-1)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  padding: "2px",
  border: "1px solid var(--border-primary)",
};

const tabStyles: React.CSSProperties = {
  padding: "var(--spacing-1) var(--spacing-3)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
};

const activeTabStyles: React.CSSProperties = {
  ...tabStyles,
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
};
