import { createFileRoute } from "@tanstack/react-router";
import { type FC } from "react";
import { Target, ListOrdered, Zap } from "lucide-react";
import { useTickets, useActiveRalphSessions } from "../lib/hooks";
import { StatsGrid } from "../components/dashboard";

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
        <CurrentFocusCard ticket={currentFocusTicket ?? null} />

        {/* Up Next Queue Section */}
        <UpNextQueue tickets={upNextTickets} />
      </div>
    </div>
  );
}

// ============================================================================
// Current Focus Card Component (placeholder - will be extracted to ticket 39)
// ============================================================================

interface CurrentFocusCardProps {
  ticket: {
    id: string;
    title: string;
    description: string | null;
    status: string;
  } | null;
}

const CurrentFocusCard: FC<CurrentFocusCardProps> = ({ ticket }) => {
  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <Target size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h2 style={sectionTitleStyles}>Current Focus</h2>
      </div>

      <div style={sectionContentStyles}>
        {ticket ? (
          <div style={focusTicketStyles}>
            <div style={focusTicketHeaderStyles}>
              <span style={focusTicketTitleStyles}>{ticket.title}</span>
              <span style={aiIndicatorStyles} title="AI Active">
                <Zap size={14} />
              </span>
            </div>
            {ticket.description && (
              <p style={focusTicketDescStyles}>
                {ticket.description.slice(0, 100)}
                {ticket.description.length > 100 ? "..." : ""}
              </p>
            )}
          </div>
        ) : (
          <div style={emptyStateStyles}>
            <Target size={32} style={{ opacity: 0.3 }} aria-hidden="true" />
            <p style={emptyTextStyles}>No active focus</p>
            <p style={emptySubtextStyles}>Start working on a ticket to see it here</p>
          </div>
        )}
      </div>
    </section>
  );
};

// ============================================================================
// Up Next Queue Component (placeholder - will be extracted to ticket 40)
// ============================================================================

interface UpNextQueueProps {
  tickets: Array<{
    id: string;
    title: string;
    priority: string | null;
    projectName?: string;
  }>;
}

const UpNextQueue: FC<UpNextQueueProps> = ({ tickets }) => {
  const getPriorityIndicator = (priority: string | null) => {
    switch (priority) {
      case "high":
        return "🔴";
      case "medium":
        return "🟠";
      case "low":
        return "⚪";
      default:
        return "⚪";
    }
  };

  return (
    <section style={sectionStyles}>
      <div style={sectionHeaderStyles}>
        <ListOrdered size={18} style={{ color: "var(--accent-primary)" }} aria-hidden="true" />
        <h2 style={sectionTitleStyles}>Up Next</h2>
      </div>

      <div style={sectionContentStyles}>
        {tickets.length > 0 ? (
          <ol style={queueListStyles}>
            {tickets.map((ticket, index) => (
              <li key={ticket.id} style={queueItemStyles}>
                <span style={queueIndexStyles}>{index + 1}.</span>
                <span style={queuePriorityStyles} title={ticket.priority ?? "No priority"}>
                  {getPriorityIndicator(ticket.priority)}
                </span>
                <span style={queueTitleStyles}>{ticket.title}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div style={emptyStateStyles}>
            <ListOrdered size={32} style={{ opacity: 0.3 }} aria-hidden="true" />
            <p style={emptyTextStyles}>Queue empty</p>
            <p style={emptySubtextStyles}>All tickets are either done or in progress</p>
          </div>
        )}
      </div>
    </section>
  );
};

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

// Section Styles
const sectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  overflow: "hidden",
};

const sectionHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const sectionTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const sectionContentStyles: React.CSSProperties = {
  flex: 1,
  padding: "var(--spacing-4)",
  overflowY: "auto",
};

// Current Focus Styles
const focusTicketStyles: React.CSSProperties = {
  padding: "var(--spacing-4)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-secondary)",
};

const focusTicketHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
};

const focusTicketTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const aiIndicatorStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--accent-warning)",
  animation: "pulse 2s infinite",
};

const focusTicketDescStyles: React.CSSProperties = {
  marginTop: "var(--spacing-2)",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

// Up Next Queue Styles
const queueListStyles: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const queueItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "background var(--transition-fast)",
};

const queueIndexStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-tertiary)",
  width: "20px",
};

const queuePriorityStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
};

const queueTitleStyles: React.CSSProperties = {
  flex: 1,
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// Empty State Styles
const emptyStateStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "var(--spacing-8)",
  textAlign: "center",
  color: "var(--text-tertiary)",
};

const emptyTextStyles: React.CSSProperties = {
  marginTop: "var(--spacing-2)",
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const emptySubtextStyles: React.CSSProperties = {
  marginTop: "var(--spacing-1)",
  fontSize: "var(--font-size-sm)",
};
