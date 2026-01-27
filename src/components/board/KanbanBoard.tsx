import type { FC } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  useTickets,
  useUpdateTicketStatus,
  useUpdateTicketPosition,
  useProjects,
  useAllEpicWorktreeStates,
  type ActiveRalphSession,
  type Epic,
} from "../../lib/hooks";
import { TicketCard, type TicketEpicWorktreeInfo } from "./TicketCard";
import { KanbanColumn } from "./KanbanColumn";
import { SortableTicketCard } from "./SortableTicketCard";
import type { TicketStatus } from "../../api/tickets";
import type { Ticket } from "../../lib/schema";
import { useToast } from "../Toast";
import { useBoardKeyboardNavigation } from "../../lib/use-board-keyboard-navigation";
import { COLUMN_STATUSES } from "../../lib/constants";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

export interface KanbanBoardProps {
  /** Optional project ID to filter tickets */
  projectId?: string | null;
  /** Optional epic ID to filter tickets */
  epicId?: string | null;
  /** Optional tags to filter tickets */
  tags?: string[];
  /** Handler when a ticket card is clicked */
  onTicketClick?: (ticket: Ticket) => void;
  /** Function to get active Ralph session for a ticket */
  getRalphSession?: (ticketId: string) => ActiveRalphSession | null;
  /** Handler to refresh data */
  onRefresh?: () => void;
  /** Pre-loaded tickets (optional, will fetch if not provided) */
  tickets?: Ticket[];
  /** Loading state (optional) */
  loading?: boolean;
  /** Error state (optional) */
  error?: string | null;
}

// Use shared constant from constants.ts
const COLUMNS = COLUMN_STATUSES as unknown as TicketStatus[];

/**
 * Human-readable labels for each status.
 */
const COLUMN_LABELS: Record<TicketStatus, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  ai_review: "AI Review",
  human_review: "Human Review",
  done: "Done",
};

/**
 * Accent colors for column headers.
 */
const COLUMN_COLORS: Record<TicketStatus, string> = {
  backlog: "var(--status-backlog)",
  ready: "var(--status-ready)",
  in_progress: "var(--status-in-progress)",
  ai_review: "var(--accent-warning)",
  human_review: "var(--accent-primary)",
  done: "var(--status-done)",
};

/** Screen reader announcements for drag-and-drop operations */
const announcements: Announcements = {
  onDragStart() {
    return "Picked up ticket. Press space to drop, or escape to cancel.";
  },
  onDragOver({ over }) {
    if (over) {
      const overStatus = over.data.current?.status as string | undefined;
      if (overStatus) {
        return `Ticket is now over the ${overStatus.replace("_", " ")} column.`;
      }
      return "Ticket is over a drop zone.";
    }
    return "Ticket is no longer over a drop zone.";
  },
  onDragEnd({ over }) {
    if (over) {
      const overStatus = over.data.current?.status as string | undefined;
      if (overStatus) {
        return `Ticket dropped in ${overStatus.replace("_", " ")} column.`;
      }
      return "Ticket was dropped.";
    }
    return "Ticket was dropped outside of a drop zone. No changes made.";
  },
  onDragCancel() {
    return "Drag cancelled. Ticket returned to original position.";
  },
};

export const KanbanBoard: FC<KanbanBoardProps> = ({
  projectId,
  epicId,
  tags = [],
  onTicketClick,
  getRalphSession,
  onRefresh,
  tickets: providedTickets,
  loading: providedLoading,
  error: providedError,
}) => {
  // Use provided data or fetch internally
  const internalFilters = useMemo(() => {
    const f: { projectId?: string; epicId?: string; tags?: string[] } = {};
    if (projectId) f.projectId = projectId;
    if (epicId) f.epicId = epicId;
    if (tags.length > 0) f.tags = tags;
    return f;
  }, [projectId, epicId, tags]);

  const {
    tickets: fetchedTickets,
    loading: internalLoading,
    error: internalError,
    refetch,
  } = useTickets(internalFilters, {
    enabled: !providedTickets, // Only fetch if tickets not provided
  });

  const tickets = providedTickets ?? fetchedTickets;
  const loading = providedLoading ?? internalLoading;
  const error = providedError ?? internalError;
  const handleRefresh = onRefresh ?? refetch;

  // Fetch epic data (for isolationMode) and worktree states (for worktree status/path)
  const { projects } = useProjects();
  const { worktreeStates } = useAllEpicWorktreeStates();

  // Build lookup map for ticket epic worktree info
  const { epicWorktreeInfoMap } = useMemo(() => {
    // Build epicById map from all projects' epics
    const epicMap = new Map<string, Epic>();
    for (const project of projects) {
      for (const epic of project.epics) {
        epicMap.set(epic.id, epic);
      }
    }

    // Build epicWorktreeInfoMap: epicId -> TicketEpicWorktreeInfo
    const infoMap = new Map<string, TicketEpicWorktreeInfo>();
    for (const [epicId, epic] of epicMap) {
      // Only include if isolation mode is set (otherwise no indicator needed)
      if (epic.isolationMode) {
        const worktreeState = worktreeStates.get(epicId);
        infoMap.set(epicId, {
          isolationMode: epic.isolationMode,
          worktreeStatus: worktreeState?.worktreeStatus ?? undefined,
          worktreePath: worktreeState?.worktreePath ?? undefined,
        });
      }
    }

    return { epicWorktreeInfoMap: infoMap };
  }, [projects, worktreeStates]);

  // Helper function to get worktree info for a ticket
  const getEpicWorktreeInfo = useCallback(
    (ticketEpicId: string | null): TicketEpicWorktreeInfo | null => {
      if (!ticketEpicId) return null;
      return epicWorktreeInfoMap.get(ticketEpicId) ?? null;
    },
    [epicWorktreeInfoMap]
  );

  // Mutation hooks - these handle query invalidation automatically
  const updateStatusMutation = useUpdateTicketStatus();
  const updatePositionMutation = useUpdateTicketPosition();
  const { showToast } = useToast();

  // DnD State
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group tickets by status
  const ticketsByStatus = useMemo(() => {
    const grouped: Record<TicketStatus, Ticket[]> = {
      backlog: [],
      ready: [],
      in_progress: [],
      ai_review: [],
      human_review: [],
      done: [],
    };

    if (!tickets) return grouped;

    for (const ticket of tickets) {
      const status = ticket.status as TicketStatus;
      if (grouped[status]) {
        grouped[status].push(ticket);
      }
    }

    // Sort by position within each column
    for (const status of Object.keys(grouped)) {
      const s = status as TicketStatus;
      grouped[s].sort((a, b) => a.position - b.position);
    }

    return grouped;
  }, [tickets]);

  // Keyboard navigation hook (after ticketsByStatus is defined)
  const {
    focusedTicketId,
    handleKeyDown: handleBoardKeyDown,
    getTabIndex,
    registerCardRef,
    handleCardFocus,
  } = useBoardKeyboardNavigation({
    ticketsByStatus,
    onTicketSelect: onTicketClick,
    disabled: !!activeTicket, // Disable keyboard nav while dragging
  });

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const ticket = tickets.find((t) => t.id === event.active.id);
      if (ticket) {
        setActiveTicket(ticket);
      }
    },
    [tickets]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTicket(null);

      if (!over) return;

      const draggedTicket = tickets.find((t) => t.id === active.id);
      if (!draggedTicket) return;

      // Determine the target column
      const overId = over.id as string;
      let targetStatus: string;
      let targetPosition: number;

      // Check if dropping on a column or a ticket
      // COLUMNS contains the status IDs which are used as droppable IDs for empty columns
      const isColumn = COLUMNS.includes(overId as TicketStatus);

      if (isColumn) {
        // Dropping on a column - add to end
        targetStatus = overId;
        const columnTickets = ticketsByStatus[targetStatus as TicketStatus] ?? [];
        targetPosition =
          columnTickets.length > 0
            ? (columnTickets[columnTickets.length - 1]?.position ?? 0) + 1
            : 1;
      } else {
        // Dropping on a ticket - get that ticket's column and position
        const targetTicket = tickets.find((t) => t.id === overId);
        if (!targetTicket) return;

        targetStatus = targetTicket.status;
        const columnTickets = ticketsByStatus[targetStatus as TicketStatus] ?? [];
        const targetIndex = columnTickets.findIndex((t) => t.id === overId);

        // Calculate new position between tickets
        if (targetIndex === 0) {
          targetPosition = (targetTicket.position ?? 1) / 2;
        } else {
          const prevTicket = columnTickets[targetIndex - 1];
          targetPosition = ((prevTicket?.position ?? 0) + (targetTicket.position ?? 0)) / 2;
        }
      }

      // Track if status changed for toast message
      const statusChanged = draggedTicket.status !== targetStatus;

      try {
        // Update status if it changed
        if (statusChanged) {
          await updateStatusMutation.mutateAsync({
            id: draggedTicket.id,
            status: targetStatus as TicketStatus,
          });
        }

        // Update position
        await updatePositionMutation.mutateAsync({
          id: draggedTicket.id,
          position: targetPosition,
        });

        // Show success toast only for status changes (position-only changes are silent)
        if (statusChanged) {
          const toLabel = COLUMN_LABELS[targetStatus as TicketStatus] ?? targetStatus;
          showToast("success", `Moved "${truncateTitle(draggedTicket.title)}" to ${toLabel}`);
        }
      } catch (error) {
        console.error("Failed to update ticket during drag:", error);
        showToast(
          "error",
          `Failed to move ticket: ${error instanceof Error ? error.message : "Unknown error"}`
        );
        // Query invalidation from mutations will handle rollback, but also trigger manual refresh
        handleRefresh();
      }
    },
    [
      tickets,
      ticketsByStatus,
      updateStatusMutation,
      updatePositionMutation,
      showToast,
      handleRefresh,
    ]
  );

  // Loading skeleton
  if (loading) {
    return (
      <div style={boardContainerStyles} role="region" aria-label="Kanban board loading">
        <div style={columnsContainerStyles}>
          {COLUMNS.map((status) => (
            <div key={status} style={skeletonColumnStyles}>
              <div style={skeletonHeaderStyles} />
              <div style={skeletonColumnContentStyles}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={skeletonCardStyles} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={errorContainerStyles} role="alert">
        <span style={errorTextStyles}>Failed to load tickets: {error}</span>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <div
        style={boardContainerStyles}
        role="region"
        aria-label="Kanban board"
        data-testid="kanban-board"
        onKeyDown={handleBoardKeyDown}
      >
        <div style={columnsContainerStyles}>
          {COLUMNS.map((status) => {
            const columnTickets = ticketsByStatus[status];
            const count = columnTickets.length;
            const accentColor = COLUMN_COLORS[status];

            return (
              <KanbanColumn
                key={status}
                status={status}
                label={COLUMN_LABELS[status]}
                count={count}
                accentColor={accentColor}
              >
                <SortableContext
                  items={columnTickets.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnTickets.map((ticket) => (
                    <SortableTicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onClick={onTicketClick && (() => onTicketClick(ticket))}
                      ralphSession={getRalphSession?.(ticket.id) ?? null}
                      tabIndex={getTabIndex(ticket.id)}
                      isFocused={focusedTicketId === ticket.id}
                      registerRef={registerCardRef(ticket.id)}
                      onFocus={() => handleCardFocus(ticket.id)}
                      epicWorktreeInfo={getEpicWorktreeInfo(ticket.epicId)}
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
            );
          })}
        </div>
        <DragOverlay>
          {activeTicket ? (
            <TicketCard
              ticket={activeTicket}
              isOverlay
              isAiActive={!!getRalphSession?.(activeTicket.id)}
              epicWorktreeInfo={getEpicWorktreeInfo(activeTicket.epicId)}
            />
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
};

function truncateTitle(title: string, maxLength = 30): string {
  if (title.length <= maxLength) return title;
  return `${title.slice(0, maxLength - 3)}...`;
}

const boardContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
};

const columnsContainerStyles: React.CSSProperties = {
  display: "flex",
  gap: "var(--spacing-4)",
  height: "100%",
  overflowX: "auto",
  overflowY: "hidden",
  padding: "var(--spacing-4)",
  scrollBehavior: "smooth",
  WebkitOverflowScrolling: "touch",
  // Scroll snap for touch devices - snaps to column edges
  scrollSnapType: "x proximity",
};

// Skeleton styles
const skeletonColumnStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: "280px",
  maxWidth: "320px",
  flexShrink: 0,
  height: "100%",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--border-primary)",
  padding: "var(--spacing-3)",
};

const skeletonColumnContentStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
  marginTop: "var(--spacing-3)",
  flex: 1,
};

const skeletonHeaderStyles: React.CSSProperties = {
  width: "100px",
  height: "20px",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-sm)",
  animation: "pulse 1.5s ease-in-out infinite",
};

const skeletonCardStyles: React.CSSProperties = {
  height: "80px",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-md)",
  animation: "pulse 1.5s ease-in-out infinite",
};

const errorContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "200px",
  padding: "var(--spacing-4)",
};

const errorTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--accent-error)",
};

export default KanbanBoard;
