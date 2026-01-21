import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { getTicket } from "../api/tickets";
import { getTicketContext } from "../api/context";
import { launchClaudeInTerminal, launchOpenCodeInTerminal } from "../api/terminal";
import { ActivitySection } from "../components/tickets/ActivitySection";
import { TicketDetailHeader } from "../components/tickets/TicketDetailHeader";
import { EditTicketModal } from "../components/tickets/EditTicketModal";
import { SubtasksProgress } from "../components/tickets";
import type { Subtask } from "../components/tickets/SubtasksProgress";
import { type LaunchType } from "../components/tickets/LaunchActions";
import { POLLING_INTERVALS } from "../lib/constants";
import {
  useProjects,
  useSettings,
  useLaunchRalphForTicket,
  type Ticket,
  type Epic,
} from "../lib/hooks";
import { useToast } from "../components/Toast";

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
  const { showToast } = useToast();
  const { projects } = useProjects();
  const { settings } = useSettings();
  const launchRalphMutation = useLaunchRalphForTicket();
  const queryClient = useQueryClient();

  // Modal and launch state
  const [showEditModal, setShowEditModal] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingType, setLaunchingType] = useState<LaunchType | null>(null);

  // Fetch ticket data
  const {
    data: ticket,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["ticket", id],
    queryFn: () => getTicket({ data: id }),
    // Ticket could be updated externally via MCP
    staleTime: 0,
  });

  // Subtask state - parse from ticket when available
  const [localSubtasks, setLocalSubtasks] = useState<Subtask[]>([]);

  // Sync localSubtasks with ticket data when it changes
  // Using useEffect to avoid stale closure issues
  const ticketSubtasks = ticket?.subtasks;
  const prevTicketSubtasks = useRef(ticketSubtasks);
  if (ticketSubtasks !== prevTicketSubtasks.current) {
    prevTicketSubtasks.current = ticketSubtasks;
    const parsed = ticketSubtasks ? (JSON.parse(ticketSubtasks) as Subtask[]) : [];
    if (JSON.stringify(parsed) !== JSON.stringify(localSubtasks)) {
      setLocalSubtasks(parsed);
    }
  }

  // Handle subtask updates - optimistic update + invalidate query
  const handleSubtaskUpdate = useCallback(
    (updatedSubtasks: Subtask[]) => {
      setLocalSubtasks(updatedSubtasks);
      // Invalidate the ticket query to refresh data after mutation completes
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
    },
    [queryClient, id]
  );

  // Find the epic for this ticket
  const epic: Epic | null = ticket
    ? (projects.flatMap((p) => p.epics).find((e) => e.id === ticket.epicId) ?? null)
    : null;

  // Handle edit button click
  const handleEdit = useCallback(() => {
    setShowEditModal(true);
  }, []);

  // Handle edit modal close
  const handleEditClose = useCallback(() => {
    setShowEditModal(false);
  }, []);

  // Handle edit success - refetch ticket data
  const handleEditSuccess = useCallback(() => {
    void refetch();
    setShowEditModal(false);
  }, [refetch]);

  // Handle launch action - launches Claude, OpenCode, or Ralph
  const handleLaunch = useCallback(
    async (type: LaunchType) => {
      if (!ticket) return;

      setIsLaunching(true);
      setLaunchingType(type);

      try {
        // Get ticket context for all launch types
        const contextResult = await getTicketContext({ data: ticket.id });

        if (type === "claude") {
          // Launch Claude in terminal
          const launchResult = await launchClaudeInTerminal({
            data: {
              ticketId: ticket.id,
              context: contextResult.context,
              projectPath: contextResult.projectPath,
              preferredTerminal: settings?.terminalEmulator ?? null,
              projectName: contextResult.projectName,
              epicName: contextResult.epicName,
              ticketTitle: contextResult.ticketTitle,
            },
          });

          // Show warnings if any
          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", `Claude launched in ${launchResult.terminalUsed}`);
            void refetch(); // Refetch to show updated status
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "opencode") {
          // Launch OpenCode in terminal
          const launchResult = await launchOpenCodeInTerminal({
            data: {
              ticketId: ticket.id,
              context: contextResult.context,
              projectPath: contextResult.projectPath,
              preferredTerminal: settings?.terminalEmulator ?? null,
              projectName: contextResult.projectName,
              epicName: contextResult.epicName,
              ticketTitle: contextResult.ticketTitle,
            },
          });

          // Show warnings if any
          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", `OpenCode launched in ${launchResult.terminalUsed}`);
            void refetch();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "ralph-native") {
          // Launch Ralph in native mode
          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "claude",
          });

          // Show warnings if any
          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            void refetch();
          } else {
            showToast("error", result.message);
          }
        }
        // ralph-docker is disabled in LaunchActions, so no handler needed
      } catch (err) {
        console.error("Failed to launch:", err);
        const message = err instanceof Error ? err.message : "An unexpected error occurred";
        showToast("error", `Failed to launch: ${message}`);
      } finally {
        setIsLaunching(false);
        setLaunchingType(null);
      }
    },
    [ticket, settings?.terminalEmulator, showToast, launchRalphMutation, refetch]
  );

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

  return (
    <div style={containerStyles}>
      {/* Back Navigation */}
      <Link to="/" style={backNavLinkStyles}>
        <ArrowLeft size={16} />
        Back to Board
      </Link>

      {/* Header Section - using TicketDetailHeader component */}
      <TicketDetailHeader
        ticket={ticket as Ticket}
        epic={epic}
        onEdit={handleEdit}
        onLaunch={handleLaunch}
        isLaunching={isLaunching}
        launchingType={launchingType}
      />

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

        {/* Subtasks Section - using SubtasksProgress component */}
        <section style={sectionStyles}>
          <SubtasksProgress
            ticketId={ticket.id}
            subtasks={localSubtasks}
            onUpdate={handleSubtaskUpdate}
            disabled={ticket.status === "done"}
            testId="ticket-detail-subtasks"
          />
        </section>
      </div>

      {/* Activity Section - Full height, no max-height constraint */}
      <section style={activitySectionStyles}>
        <ActivitySection
          ticketId={ticket.id}
          pollingInterval={ticket.status === "in_progress" ? POLLING_INTERVALS.COMMENTS_ACTIVE : 0}
          maxHeight="none"
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

      {/* Edit Modal */}
      <EditTicketModal
        key={ticket.id}
        isOpen={showEditModal}
        onClose={handleEditClose}
        ticket={ticket as Ticket}
        onSuccess={handleEditSuccess}
      />
    </div>
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
