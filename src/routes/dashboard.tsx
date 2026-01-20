import { createFileRoute } from "@tanstack/react-router";
import { useTickets, useActiveRalphSessions } from "../lib/hooks";
import { StatsGrid, CurrentFocusCard, UpNextQueue } from "../components/dashboard";

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
 * Dashboard route - Overview page with stats, current focus, and up next queue.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Dashboard                                                    │
 * ├─────────────────────────────────────────────────────────────┤
 * │ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
 * │ │ Total  │ │In Prog │ │AI Active│ │ Done   │                │
 * │ └────────┘ └────────┘ └────────┘ └────────┘                │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Current Focus              │ Up Next                        │
 * │ ┌──────────────────────┐   │ 1. Ticket A                   │
 * │ │ Active Ticket        │   │ 2. Ticket B                   │
 * │ └──────────────────────┘   │ 3. Ticket C                   │
 * └─────────────────────────────────────────────────────────────┘
 */
function Dashboard() {
  const { tickets, loading, error } = useTickets();
  const { sessions, error: sessionsError } = useActiveRalphSessions();

  // Sessions error is non-critical - log and continue without AI indicators
  if (sessionsError) {
    console.error("Failed to load Ralph sessions:", sessionsError);
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  const totalCount = tickets.length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const aiActiveCount = Object.keys(sessions).length;
  const doneCount = tickets.filter((t) => t.status === "done").length;

  // Current focus = in_progress ticket with active Ralph session
  const currentFocusTicket = tickets.find(
    (t) => t.status === "in_progress" && sessions[t.id] !== undefined
  );

  // Up next = highest priority first, excludes done/in_progress/blocked
  const upNextTickets = tickets
    .filter((t) => !["done", "in_progress"].includes(t.status) && !t.isBlocked)
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.position - b.position;
    })
    .slice(0, 5);

  return (
    <div style={containerStyles}>
      <h1 style={titleStyles}>Dashboard</h1>

      <StatsGrid
        total={totalCount}
        inProgress={inProgressCount}
        aiActive={aiActiveCount}
        done={doneCount}
      />

      <div style={mainGridStyles}>
        <CurrentFocusCard
          ticket={currentFocusTicket ?? null}
          session={currentFocusTicket ? sessions[currentFocusTicket.id] : null}
        />
        <UpNextQueue tickets={upNextTickets} />
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

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

const mainGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--spacing-6)",
  flex: 1,
  minHeight: 0,
};
