import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { getTicket } from "../api/tickets";
import { ActivitySection } from "../components/tickets/ActivitySection";
import { POLLING_INTERVALS } from "../lib/constants";

export const Route = createFileRoute("/ticket/$id")({
  component: TicketDetailPage,
  errorComponent: TicketDetailError,
});

// =============================================================================
// Error Component
// =============================================================================

/**
 * Error component for ticket detail route - shows user-friendly error with navigation.
 */
function TicketDetailError({ error }: { error: Error }) {
  console.error("Ticket detail error:", error);

  return (
    <div style={errorContainerStyles}>
      <div style={errorCardStyles}>
        <AlertCircle size={48} style={{ color: "var(--color-red-400)" }} />
        <h2 style={errorTitleStyles}>Ticket Not Found</h2>
        <p style={errorMessageStyles}>{error.message}</p>
        <Link to="/" style={backLinkStyles}>
          <ArrowLeft size={16} />
          Back to Board
        </Link>
      </div>
    </div>
  );
}

// =============================================================================
// Loading Skeleton
// =============================================================================

function TicketDetailSkeleton() {
  return (
    <div style={containerStyles}>
      {/* Back navigation skeleton */}
      <div style={backNavStyles}>
        <div style={{ ...skeletonStyles, width: "120px", height: "20px" }} />
      </div>

      {/* Header skeleton */}
      <div style={headerSectionStyles}>
        <div
          style={{
            ...skeletonStyles,
            width: "60%",
            height: "32px",
            marginBottom: "var(--spacing-3)",
          }}
        />
        <div style={{ display: "flex", gap: "var(--spacing-2)" }}>
          <div
            style={{
              ...skeletonStyles,
              width: "80px",
              height: "24px",
              borderRadius: "var(--radius-full)",
            }}
          />
          <div
            style={{
              ...skeletonStyles,
              width: "80px",
              height: "24px",
              borderRadius: "var(--radius-full)",
            }}
          />
          <div
            style={{
              ...skeletonStyles,
              width: "100px",
              height: "24px",
              borderRadius: "var(--radius-full)",
            }}
          />
        </div>
      </div>

      {/* Content skeleton */}
      <div style={contentGridStyles}>
        {/* Description section */}
        <div style={sectionStyles}>
          <div
            style={{
              ...skeletonStyles,
              width: "100px",
              height: "20px",
              marginBottom: "var(--spacing-3)",
            }}
          />
          <div style={{ ...skeletonStyles, width: "100%", height: "120px" }} />
        </div>

        {/* Subtasks section */}
        <div style={sectionStyles}>
          <div
            style={{
              ...skeletonStyles,
              width: "140px",
              height: "20px",
              marginBottom: "var(--spacing-3)",
            }}
          />
          <div
            style={{
              ...skeletonStyles,
              width: "100%",
              height: "24px",
              marginBottom: "var(--spacing-2)",
            }}
          />
          <div
            style={{
              ...skeletonStyles,
              width: "80%",
              height: "20px",
              marginBottom: "var(--spacing-2)",
            }}
          />
          <div
            style={{
              ...skeletonStyles,
              width: "90%",
              height: "20px",
              marginBottom: "var(--spacing-2)",
            }}
          />
          <div style={{ ...skeletonStyles, width: "70%", height: "20px" }} />
        </div>
      </div>

      {/* Activity section skeleton */}
      <div style={sectionStyles}>
        <div
          style={{
            ...skeletonStyles,
            width: "80px",
            height: "20px",
            marginBottom: "var(--spacing-3)",
          }}
        />
        <div style={{ ...skeletonStyles, width: "100%", height: "200px" }} />
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * TicketDetailPage - Full page view for a single ticket.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────┐
 * │ ← Back to Board                                             │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Ticket Title                                [Edit] [Start]  │
 * │ Status: In Progress  Priority: High  Epic: Auth            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Description                     │ Subtasks (2/4)           │
 * │ Add login/logout...             │ ☑ Database schema        │
 * │                                 │ ☑ API endpoints          │
 * │                                 │ ☐ UI components          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Activity (full timeline)                                    │
 * └─────────────────────────────────────────────────────────────┘
 */
function TicketDetailPage() {
  const { id } = useParams({ from: "/ticket/$id" });

  // Fetch ticket data
  const {
    data: ticket,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => getTicket({ data: id }),
    // Ticket could be updated externally via MCP
    staleTime: 0,
  });

  // Show loading skeleton
  if (isLoading) {
    return <TicketDetailSkeleton />;
  }

  // Show error state
  if (error || !ticket) {
    return (
      <div style={errorContainerStyles}>
        <div style={errorCardStyles}>
          <AlertCircle size={48} style={{ color: "var(--color-red-400)" }} />
          <h2 style={errorTitleStyles}>Ticket Not Found</h2>
          <p style={errorMessageStyles}>
            {error instanceof Error ? error.message : `Could not find ticket with ID: ${id}`}
          </p>
          <Link to="/" style={backLinkStyles}>
            <ArrowLeft size={16} />
            Back to Board
          </Link>
        </div>
      </div>
    );
  }

  // Parse subtasks if present
  const subtasks = ticket.subtasks
    ? (JSON.parse(ticket.subtasks) as { id: string; text: string; completed: boolean }[])
    : [];
  const completedCount = subtasks.filter((s) => s.completed).length;

  // Parse tags if present
  const tags = ticket.tags ? (JSON.parse(ticket.tags) as string[]) : [];

  return (
    <div style={containerStyles}>
      {/* Back Navigation */}
      <Link to="/" style={backNavLinkStyles}>
        <ArrowLeft size={16} />
        Back to Board
      </Link>

      {/* Header Section */}
      <header style={headerSectionStyles}>
        <h1 style={titleStyles}>{ticket.title}</h1>
        <div style={badgesContainerStyles}>
          {/* Status Badge */}
          <span style={{ ...badgeStyles, ...getStatusBadgeStyle(ticket.status) }}>
            {formatStatus(ticket.status)}
          </span>

          {/* Priority Badge */}
          {ticket.priority && (
            <span style={{ ...badgeStyles, ...getPriorityBadgeStyle(ticket.priority) }}>
              {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
            </span>
          )}

          {/* Tags */}
          {tags.map((tag) => (
            <span key={tag} style={tagBadgeStyles}>
              {tag}
            </span>
          ))}
        </div>

        {/* Action buttons placeholder - will be implemented by TicketDetailHeader component */}
        <div style={actionsContainerStyles}>
          <Link to="/" style={actionButtonStyles} search={{ ticketId: id }}>
            Edit
          </Link>
        </div>
      </header>

      {/* Content Grid */}
      <div style={contentGridStyles}>
        {/* Description Section */}
        <section style={sectionStyles}>
          <h2 style={sectionTitleStyles}>Description</h2>
          {ticket.description ? (
            <div style={descriptionStyles}>{ticket.description}</div>
          ) : (
            <p style={emptyStateStyles}>No description</p>
          )}
        </section>

        {/* Subtasks Section */}
        <section style={sectionStyles}>
          <h2 style={sectionTitleStyles}>
            Subtasks
            {subtasks.length > 0 && (
              <span style={subtaskCountStyles}>
                ({completedCount}/{subtasks.length})
              </span>
            )}
          </h2>
          {subtasks.length > 0 ? (
            <div style={subtaskListStyles}>
              {/* Progress bar */}
              <div style={progressBarContainerStyles}>
                <div
                  style={{
                    ...progressBarFillStyles,
                    width: `${subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0}%`,
                  }}
                />
              </div>
              {/* Subtask items */}
              {subtasks.map((subtask) => (
                <div key={subtask.id} style={subtaskItemStyles}>
                  <span style={subtask.completed ? checkboxCheckedStyles : checkboxStyles}>
                    {subtask.completed ? "☑" : "☐"}
                  </span>
                  <span style={subtask.completed ? subtaskTextCompletedStyles : subtaskTextStyles}>
                    {subtask.text}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={emptyStateStyles}>No subtasks</p>
          )}
        </section>
      </div>

      {/* Activity Section - Full height, no max-height constraint */}
      <section style={activitySectionStyles}>
        <ActivitySection
          ticketId={ticket.id}
          pollingInterval={ticket.status === "in_progress" ? POLLING_INTERVALS.COMMENTS_ACTIVE : 0}
          maxHeight={600}
          testId="ticket-detail-activity"
        />
      </section>

      {/* Metadata */}
      <footer style={metadataStyles}>
        <span>Created: {new Date(ticket.createdAt).toLocaleString()}</span>
        <span>Updated: {new Date(ticket.updatedAt).toLocaleString()}</span>
        {ticket.completedAt && (
          <span>Completed: {new Date(ticket.completedAt).toLocaleString()}</span>
        )}
      </footer>
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatStatus(status: string): string {
  const statusLabels: Record<string, string> = {
    backlog: "Backlog",
    ready: "Ready",
    in_progress: "In Progress",
    review: "Review",
    ai_review: "AI Review",
    human_review: "Human Review",
    done: "Done",
  };
  return statusLabels[status] ?? status;
}

function getStatusBadgeStyle(status: string): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    backlog: { background: "var(--color-slate-700)", color: "var(--color-slate-200)" },
    ready: { background: "var(--color-blue-900)", color: "var(--color-blue-200)" },
    in_progress: { background: "var(--color-yellow-900)", color: "var(--color-yellow-200)" },
    review: { background: "var(--color-purple-900)", color: "var(--color-purple-200)" },
    ai_review: { background: "var(--color-cyan-900)", color: "var(--color-cyan-200)" },
    human_review: { background: "var(--color-orange-900)", color: "var(--color-orange-200)" },
    done: { background: "var(--color-green-900)", color: "var(--color-green-200)" },
  };
  return (
    styles[status] ?? { background: "var(--color-slate-700)", color: "var(--color-slate-200)" }
  );
}

function getPriorityBadgeStyle(priority: string): React.CSSProperties {
  const styles: Record<string, React.CSSProperties> = {
    high: { background: "var(--color-red-900)", color: "var(--color-red-200)" },
    medium: { background: "var(--color-yellow-900)", color: "var(--color-yellow-200)" },
    low: { background: "var(--color-green-900)", color: "var(--color-green-200)" },
  };
  return (
    styles[priority] ?? { background: "var(--color-slate-700)", color: "var(--color-slate-200)" }
  );
}

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-6)",
  padding: "var(--spacing-6)",
  maxWidth: "1200px",
  margin: "0 auto",
  height: "100%",
  overflowY: "auto",
};

const backNavStyles: React.CSSProperties = {
  marginBottom: "var(--spacing-2)",
};

const backNavLinkStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  color: "var(--text-secondary)",
  textDecoration: "none",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  padding: "var(--spacing-2) var(--spacing-3)",
  borderRadius: "var(--radius-md)",
  transition: "background-color 0.15s, color 0.15s",
};

const headerSectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
  paddingBottom: "var(--spacing-4)",
  borderBottom: "1px solid var(--border-primary)",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-2xl)",
  fontWeight: "var(--font-weight-bold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
  lineHeight: 1.3,
};

const badgesContainerStyles: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--spacing-2)",
  alignItems: "center",
};

const badgeStyles: React.CSSProperties = {
  padding: "var(--spacing-1) var(--spacing-3)",
  borderRadius: "var(--radius-full)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const tagBadgeStyles: React.CSSProperties = {
  padding: "var(--spacing-1) var(--spacing-2)",
  borderRadius: "var(--radius-sm)",
  fontSize: "var(--font-size-xs)",
  background: "var(--bg-tertiary)",
  color: "var(--text-secondary)",
};

const actionsContainerStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-2)",
  marginTop: "var(--spacing-2)",
};

const actionButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border-primary)",
  textDecoration: "none",
  cursor: "pointer",
  transition: "background-color 0.15s",
};

const contentGridStyles: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--spacing-6)",
};

const sectionStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const sectionTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const subtaskCountStyles: React.CSSProperties = {
  fontWeight: "var(--font-weight-normal)" as React.CSSProperties["fontWeight"],
  color: "var(--text-muted)",
  textTransform: "none",
  letterSpacing: "normal",
};

const descriptionStyles: React.CSSProperties = {
  color: "var(--text-primary)",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
};

const emptyStateStyles: React.CSSProperties = {
  color: "var(--text-muted)",
  fontStyle: "italic",
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  textAlign: "center",
};

const subtaskListStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const progressBarContainerStyles: React.CSSProperties = {
  height: "8px",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-full)",
  overflow: "hidden",
  marginBottom: "var(--spacing-2)",
};

const progressBarFillStyles: React.CSSProperties = {
  height: "100%",
  background: "var(--accent-primary)",
  borderRadius: "var(--radius-full)",
  transition: "width 0.3s ease",
};

const subtaskItemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
};

const checkboxStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  color: "var(--text-muted)",
};

const checkboxCheckedStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  color: "var(--accent-primary)",
};

const subtaskTextStyles: React.CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
};

const subtaskTextCompletedStyles: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
  textDecoration: "line-through",
};

const activitySectionStyles: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

const metadataStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-4)",
  flexWrap: "wrap",
  padding: "var(--spacing-4)",
  borderTop: "1px solid var(--border-primary)",
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
};

// Error styles
const errorContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  padding: "var(--spacing-6)",
};

const errorCardStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--spacing-4)",
  padding: "var(--spacing-8)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  textAlign: "center",
  maxWidth: "400px",
};

const errorTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xl)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  margin: 0,
};

const errorMessageStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  margin: 0,
};

const backLinkStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--accent-primary)",
  color: "white",
  borderRadius: "var(--radius-md)",
  textDecoration: "none",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  marginTop: "var(--spacing-2)",
};

// Skeleton styles
const skeletonStyles: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  animation: "pulse 1.5s ease-in-out infinite",
};
