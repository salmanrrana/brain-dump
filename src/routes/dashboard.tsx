import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Profiler, Suspense, lazy, useCallback, useState } from "react";
import { onRenderCallback } from "../lib/profiler";
import { useQueryClient } from "@tanstack/react-query";
import { useTicketSummaries, useActiveRalphSessions, useDashboardAnalytics } from "../lib/hooks";
import { getTicketSummaries } from "../api/tickets";
import { getDashboardAnalytics } from "../api/analytics";
import { getDashboardTelemetryAnalytics } from "../api/telemetry";
import { getCostAnalytics, getCostExplorerData } from "../api/cost";
import { queryKeys } from "../lib/query-keys";
import { StatsGrid } from "../components/dashboard/StatsGrid";
import type { StatFilter } from "../components/dashboard/StatsGrid";
import { AnalyticsSection } from "../components/dashboard/AnalyticsSection";

import { markLoaderStart, markLoaderEnd, timedFetch } from "../lib/navigation-timing";
import { DashboardSkeleton } from "../components/route-skeletons";

type DashboardTab = "overview" | "ai-telemetry" | "cost-explorer";

const loadAITelemetryTab = () =>
  import("../components/dashboard/AITelemetryTab").then((m) => ({ default: m.AITelemetryTab }));
const AITelemetryTab = lazy(loadAITelemetryTab);

const loadCostExplorerTab = () =>
  import("../components/dashboard/CostExplorerTab").then((m) => ({ default: m.CostExplorerTab }));
const CostExplorerTab = lazy(loadCostExplorerTab);

export const Route = createFileRoute("/dashboard")({
  pendingComponent: DashboardSkeleton,
  loader: ({ context }) => {
    markLoaderStart("dashboard");
    // Pre-warm the overview data only; secondary tab code and data are prefetched on intent.
    void timedFetch("dashboard:tickets", () =>
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.ticketSummaries({}),
        queryFn: () => getTicketSummaries({ data: {} }),
        staleTime: 30_000,
      })
    );
    void timedFetch("dashboard:analytics", () =>
      context.queryClient.ensureQueryData({
        queryKey: queryKeys.analytics.dashboard(),
        queryFn: () => getDashboardAnalytics(),
        staleTime: 60_000,
      })
    );
    markLoaderEnd("dashboard");
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
  const { tickets, loading, error } = useTicketSummaries();
  const { sessions } = useActiveRalphSessions();
  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useDashboardAnalytics();
  const queryClient = useQueryClient();

  const prefetchTelemetry = useCallback(() => {
    void loadAITelemetryTab();
    void queryClient.prefetchQuery({
      queryKey: queryKeys.telemetry.dashboardAnalytics(),
      queryFn: () => getDashboardTelemetryAnalytics(),
      staleTime: 60_000,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.cost.dashboardAnalytics(),
      queryFn: () => getCostAnalytics(),
      staleTime: 300_000,
    });
  }, [queryClient]);

  const prefetchExplorer = useCallback(() => {
    void loadCostExplorerTab();
    void queryClient.prefetchQuery({
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
    <Profiler id="Dashboard" onRender={onRenderCallback}>
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
              onMouseEnter={prefetchTelemetry}
              onFocus={prefetchTelemetry}
              style={activeTab === "ai-telemetry" ? activeTabStyles : tabStyles}
            >
              AI Telemetry
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "cost-explorer"}
              onClick={() => setActiveTab("cost-explorer")}
              onMouseEnter={prefetchExplorer}
              onFocus={prefetchExplorer}
              style={activeTab === "cost-explorer" ? activeTabStyles : tabStyles}
            >
              Cost Explorer
            </button>
          </div>
        </div>

        <Profiler id="Dashboard.StatsGrid" onRender={onRenderCallback}>
          <StatsGrid
            total={totalCount}
            inProgress={inProgressCount}
            aiActive={aiActiveCount}
            done={doneCount}
            onStatClick={handleStatClick}
          />
        </Profiler>

        {activeTab === "overview" && analytics && (
          <Profiler id="Dashboard.Analytics" onRender={onRenderCallback}>
            <AnalyticsSection
              analytics={analytics}
              loading={analyticsLoading}
              error={analyticsError}
            />
          </Profiler>
        )}

        {activeTab === "ai-telemetry" && (
          <Profiler id="Dashboard.AITelemetry" onRender={onRenderCallback}>
            <Suspense fallback={<DashboardTabFallback label="Loading AI telemetry..." />}>
              <AITelemetryTab />
            </Suspense>
          </Profiler>
        )}

        {activeTab === "cost-explorer" && (
          <Profiler id="Dashboard.CostExplorer" onRender={onRenderCallback}>
            <Suspense fallback={<DashboardTabFallback label="Loading cost explorer..." />}>
              <CostExplorerTab />
            </Suspense>
          </Profiler>
        )}
      </div>
    </Profiler>
  );
}

function DashboardTabFallback({ label }: { label: string }) {
  return <div style={tabFallbackStyles}>{label}</div>;
}

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
  height: "100%",
};

const headerRowStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: "var(--spacing-4)",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-3xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-tighter)",
  color: "var(--text-primary)",
  margin: 0,
};

const tabBarStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-1)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-lg)",
  padding: "3px",
  border: "1px solid var(--border-primary)",
};

const tabStyles: React.CSSProperties = {
  padding: "var(--spacing-1) var(--spacing-3)",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-wide)",
  color: "var(--text-tertiary)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const activeTabStyles: React.CSSProperties = {
  ...tabStyles,
  color: "var(--text-primary)",
  background: "var(--bg-hover)",
};

const tabFallbackStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 240,
  color: "var(--text-secondary)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-xl)",
};
