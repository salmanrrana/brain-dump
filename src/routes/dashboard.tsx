import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTickets, useActiveRalphSessions, useDashboardAnalytics } from "../lib/hooks";
import { StatsGrid, AnalyticsSection } from "../components/dashboard";
import type { StatFilter } from "../components/dashboard";

export const Route = createFileRoute("/dashboard")({
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
  const { tickets, loading, error } = useTickets();
  const { sessions } = useActiveRalphSessions();
  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useDashboardAnalytics();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading dashboard...</p>
      </div>
    );
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

  // Handle stat card clicks - navigate to board and scroll to relevant column
  const handleStatClick = (filter: StatFilter) => {
    navigate({ to: "/" });
    // Scroll to the relevant column after navigation
    // Use setTimeout to ensure navigation completes first
    setTimeout(() => {
      let columnSelector: string;
      switch (filter) {
        case "in_progress":
          columnSelector = '[data-status="in_progress"]';
          break;
        case "done":
          columnSelector = '[data-status="done"]';
          break;
        case "ai_active":
          // For AI active, scroll to in_progress column (where AI sessions are)
          columnSelector = '[data-status="in_progress"]';
          break;
        default:
          return; // "all" - no scroll needed
      }
      const column = document.querySelector(columnSelector);
      if (column) {
        column.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }
    }, 100);
  };

  return (
    <div style={containerStyles}>
      <h1 style={titleStyles}>Dashboard</h1>

      <StatsGrid
        total={totalCount}
        inProgress={inProgressCount}
        aiActive={aiActiveCount}
        done={doneCount}
        onStatClick={handleStatClick}
      />

      {analytics && (
        <AnalyticsSection analytics={analytics} loading={analyticsLoading} error={analyticsError} />
      )}
    </div>
  );
}

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
  height: "100%",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

// Removed mainGridStyles - Current Focus and Up Next sections removed
