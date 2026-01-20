import { createFileRoute } from "@tanstack/react-router";
import { useTickets, useActiveRalphSessions } from "../lib/hooks";
import { StatsGrid, CurrentFocusCard, UpNextQueue } from "../components/dashboard";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

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
  // Fetch all tickets for stats calculation
  const { tickets, loading, error } = useTickets();

  // Fetch active Ralph sessions to identify AI-active tickets
  const { sessions } = useActiveRalphSessions();

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

  // Calculate stats
  const totalCount = tickets.length;
  const inProgressCount = tickets.filter((t) => t.status === "in_progress").length;
  const aiActiveCount = Object.keys(sessions).length;
  const doneCount = tickets.filter((t) => t.status === "done").length;

  // Get current focus (in_progress ticket with active Ralph session)
  const currentFocusTicket = tickets.find(
    (t) => t.status === "in_progress" && sessions[t.id] !== undefined
  );

  // Get up next queue (priority order: high → medium → low, exclude done/in_progress)
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
      {/* Page Title */}
      <h1 style={titleStyles}>Dashboard</h1>

      {/* Stats Grid */}
      <StatsGrid
        total={totalCount}
        inProgress={inProgressCount}
        aiActive={aiActiveCount}
        done={doneCount}
      />

      {/* Main Content Grid */}
      <div style={mainGridStyles}>
        {/* Current Focus Section */}
        <CurrentFocusCard
          ticket={currentFocusTicket ?? null}
          session={currentFocusTicket ? sessions[currentFocusTicket.id] : null}
        />

        {/* Up Next Queue Section */}
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

// Main Grid Styles
const mainGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--spacing-6)",
  flex: 1,
  minHeight: 0,
};
