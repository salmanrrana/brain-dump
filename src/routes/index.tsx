import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, GitPullRequest } from "lucide-react";
import { useAppState } from "../components/AppLayout";
import { useTickets, useProjects, type Ticket, type StatusChange } from "../lib/hooks";
import { useToast } from "../components/Toast";
import TicketListView from "../components/TicketListView";
import TicketModal from "../components/TicketModal";
import type { Subtask } from "../api/tickets";
import { safeJsonParse } from "../lib/utils";
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
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { updateTicketStatus, updateTicketPosition, getTicket } from "../api/tickets";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const {
    viewMode,
    filters: appFilters,
    ticketRefreshKey,
    selectedTicketIdFromSearch,
    clearSelectedTicketFromSearch,
  } = useAppState();
  const { projects } = useProjects();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const { showToast } = useToast();

  // Build filters based on selection
  const filters = useMemo(() => {
    const f: { projectId?: string; epicId?: string; tags?: string[] } = {};
    if (appFilters.projectId) f.projectId = appFilters.projectId;
    if (appFilters.epicId) f.epicId = appFilters.epicId;
    if (appFilters.tags.length > 0) f.tags = appFilters.tags;
    return f;
  }, [appFilters.projectId, appFilters.epicId, appFilters.tags]);

  // Handle status changes from external sources (CLI, hooks)
  const handleStatusChange = useCallback(
    (change: StatusChange) => {
      const statusLabels: Record<string, string> = {
        backlog: "Backlog",
        ready: "Ready",
        in_progress: "In Progress",
        review: "Review",
        ai_review: "AI Review",
        human_review: "Human Review",
        done: "Done",
      };

      const fromLabel = statusLabels[change.fromStatus] ?? change.fromStatus;
      const toLabel = statusLabels[change.toStatus] ?? change.toStatus;

      // Special message for auto-completion to review
      if (change.toStatus === "review") {
        showToast("success", `"${change.ticketTitle}" is ready for review!`);
      } else if (change.toStatus === "done") {
        showToast("success", `"${change.ticketTitle}" has been completed!`);
      } else {
        showToast("info", `"${change.ticketTitle}" moved from ${fromLabel} to ${toLabel}`);
      }
    },
    [showToast]
  );

  const { tickets, loading, error, refetch } = useTickets(filters, {
    onStatusChange: handleStatusChange,
  });

  // Refetch when ticketRefreshKey changes (e.g., after creating a new ticket)
  useEffect(() => {
    if (ticketRefreshKey > 0) {
      refetch();
    }
  }, [ticketRefreshKey, refetch]);

  // Handle ticket selection from search
  useEffect(() => {
    if (!selectedTicketIdFromSearch) return;

    const fetchAndSelectTicket = async () => {
      try {
        const ticket = await getTicket({ data: selectedTicketIdFromSearch });
        setSelectedTicket(ticket as Ticket);
      } catch (error) {
        console.error("Failed to fetch ticket from search:", error);
      } finally {
        clearSelectedTicketFromSearch();
      }
    };

    void fetchAndSelectTicket();
  }, [selectedTicketIdFromSearch, clearSelectedTicketFromSearch]);

  // Get all epics from projects for the list view
  const allEpics = useMemo(() => {
    return projects.flatMap((p) => p.epics);
  }, [projects]);

  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicket(ticket);
  };

  const handleModalClose = () => {
    setSelectedTicket(null);
  };

  const handleTicketUpdate = () => {
    refetch();
    setSelectedTicket(null);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-slate-500">Loading tickets...</p>
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

  return (
    <div className="h-full">
      {viewMode === "list" ? (
        <TicketListView tickets={tickets} epics={allEpics} onTicketClick={handleTicketClick} />
      ) : (
        <KanbanBoard tickets={tickets} onTicketClick={handleTicketClick} onRefresh={refetch} />
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          epics={allEpics}
          onClose={handleModalClose}
          onUpdate={handleTicketUpdate}
        />
      )}
    </div>
  );
}

// Kanban column configuration
const KANBAN_COLUMNS = [
  { id: "backlog", title: "Backlog", color: "slate" },
  { id: "ready", title: "Ready", color: "slate" },
  { id: "in_progress", title: "In Progress", color: "slate" },
  { id: "review", title: "Review", color: "slate" },
  { id: "ai_review", title: "AI Review", color: "amber" },
  { id: "human_review", title: "Human Review", color: "rose" },
  { id: "done", title: "Done", color: "slate" },
] as const;

// Kanban board component with drag and drop
function KanbanBoard({
  tickets,
  onTicketClick,
  onRefresh,
}: {
  tickets: Ticket[];
  onTicketClick: (ticket: Ticket) => void;
  onRefresh: () => void;
}) {
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

  const ticketsByStatus = useMemo(() => {
    const grouped: Record<string, Ticket[]> = {};
    for (const col of KANBAN_COLUMNS) {
      grouped[col.id] = [];
    }
    for (const ticket of tickets) {
      const statusGroup = grouped[ticket.status];
      if (statusGroup) {
        statusGroup.push(ticket);
      }
    }
    // Sort by position within each column
    for (const status of Object.keys(grouped)) {
      const statusGroup = grouped[status];
      if (statusGroup) {
        statusGroup.sort((a, b) => a.position - b.position);
      }
    }
    return grouped;
  }, [tickets]);

  const handleDragStart = (event: DragStartEvent) => {
    const ticket = tickets.find((t) => t.id === event.active.id);
    if (ticket) {
      setActiveTicket(ticket);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTicket(null);

    if (!over) return;

    const activeTicket = tickets.find((t) => t.id === active.id);
    if (!activeTicket) return;

    // Determine the target column
    const overId = over.id as string;
    let targetStatus: string;
    let targetPosition: number;

    // Check if dropping on a column or a ticket
    const isColumn = KANBAN_COLUMNS.some((col) => col.id === overId);

    if (isColumn) {
      // Dropping on a column - add to end
      targetStatus = overId;
      const columnTickets = ticketsByStatus[targetStatus] ?? [];
      targetPosition =
        columnTickets.length > 0 ? (columnTickets[columnTickets.length - 1]?.position ?? 0) + 1 : 1;
    } else {
      // Dropping on a ticket - get that ticket's column and position
      const targetTicket = tickets.find((t) => t.id === overId);
      if (!targetTicket) return;

      targetStatus = targetTicket.status;
      const columnTickets = ticketsByStatus[targetStatus] ?? [];
      const targetIndex = columnTickets.findIndex((t) => t.id === overId);

      // Calculate new position between tickets
      if (targetIndex === 0) {
        targetPosition = (targetTicket.position ?? 1) / 2;
      } else {
        const prevTicket = columnTickets[targetIndex - 1];
        targetPosition = ((prevTicket?.position ?? 0) + (targetTicket.position ?? 0)) / 2;
      }
    }

    // Update status if changed
    if (activeTicket.status !== targetStatus) {
      await updateTicketStatus({
        data: {
          id: activeTicket.id,
          status: targetStatus as
            | "backlog"
            | "ready"
            | "in_progress"
            | "review"
            | "ai_review"
            | "human_review"
            | "done",
        },
      });
    }

    // Update position
    await updateTicketPosition({ data: { id: activeTicket.id, position: targetPosition } });

    // Refresh tickets
    onRefresh();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-7 gap-4 h-full">
        {KANBAN_COLUMNS.map((column) => (
          <BoardColumn
            key={column.id}
            columnId={column.id}
            title={column.title}
            color={column.color}
            tickets={ticketsByStatus[column.id] ?? []}
            onTicketClick={onTicketClick}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTicket ? (
          <div className="opacity-80">
            <TicketCard ticket={activeTicket} onClick={() => {}} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumn({
  columnId,
  title,
  color,
  tickets,
  onTicketClick,
}: {
  columnId: string;
  title: string;
  color: string;
  tickets: Ticket[];
  onTicketClick: (ticket: Ticket) => void;
}) {
  const { setNodeRef } = useSortable({
    id: columnId,
    data: { type: "column" },
  });

  // Color configurations for review columns
  const colorStyles = {
    slate: {
      bg: "bg-slate-900",
      header: "border-slate-800",
      border: "",
    },
    amber: {
      bg: "bg-amber-950/30",
      header: "border-amber-800/50",
      border: "ring-1 ring-amber-700/30",
    },
    rose: {
      bg: "bg-rose-950/30",
      header: "border-rose-800/50",
      border: "ring-1 ring-rose-700/30",
    },
  } as const;

  type ColorKey = keyof typeof colorStyles;
  const isValidColor = (c: string): c is ColorKey => c in colorStyles;
  const styles = isValidColor(color) ? colorStyles[color] : colorStyles.slate;

  return (
    <div className={`flex flex-col ${styles.bg} ${styles.border} rounded-lg`}>
      {/* Column header */}
      <div className={`p-3 border-b ${styles.header}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-slate-200">{title}</h3>
          <span className="text-xs bg-slate-800 px-2 py-1 rounded-full text-slate-400">
            {tickets.length}
          </span>
        </div>
      </div>

      {/* Column content */}
      <div ref={setNodeRef} className="flex-1 p-2 overflow-y-auto space-y-2 min-h-[200px]">
        <SortableContext items={tickets.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">Drop tickets here</div>
          ) : (
            tickets.map((ticket) => (
              <SortableTicketCard
                key={ticket.id}
                ticket={ticket}
                onClick={() => onTicketClick(ticket)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableTicketCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TicketCard ticket={ticket} onClick={onClick} isDragging={isDragging} />
    </div>
  );
}

function TicketCard({
  ticket,
  onClick,
  isDragging = false,
}: {
  ticket: Ticket;
  onClick: () => void;
  isDragging?: boolean;
}) {
  const tags = safeJsonParse<string[]>(ticket.tags, []);
  const subtasks = safeJsonParse<Subtask[]>(ticket.subtasks, []);
  const completedSubtasks = subtasks.filter((s) => s.completed).length;

  return (
    <div
      onClick={onClick}
      className={`p-3 bg-slate-800 rounded-lg cursor-pointer transition-colors ${
        isDragging ? "ring-2 ring-cyan-500 shadow-lg" : "hover:bg-slate-700"
      }`}
    >
      {/* Title with blocked indicator */}
      <div className="flex items-start gap-2">
        {ticket.isBlocked && (
          <span
            className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0"
            title={ticket.blockedReason ?? "Blocked"}
          />
        )}
        <h4 className="text-sm font-medium text-gray-100 line-clamp-2">{ticket.title}</h4>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2">
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Git/PR indicators */}
      {(ticket.branchName || ticket.prNumber) && (
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
          {ticket.branchName && (
            <span className="flex items-center gap-1" title={ticket.branchName}>
              <GitBranch size={12} className="text-cyan-400" />
              <span className="truncate max-w-[100px]">
                {ticket.branchName.replace(/^feature\//, "")}
              </span>
            </span>
          )}
          {ticket.prNumber && (
            <span
              className={`flex items-center gap-1 ${
                ticket.prStatus === "merged"
                  ? "text-purple-400"
                  : ticket.prStatus === "closed"
                    ? "text-red-400"
                    : ticket.prStatus === "draft"
                      ? "text-slate-500"
                      : "text-green-400"
              }`}
              title={`PR #${ticket.prNumber} - ${ticket.prStatus ?? "open"}`}
            >
              <GitPullRequest size={12} />#{ticket.prNumber}
            </span>
          )}
        </div>
      )}

      {/* Bottom row: priority badge and subtask progress */}
      <div className="flex items-center justify-between mt-2">
        {ticket.priority ? <PriorityBadge priority={ticket.priority} /> : <span />}
        {subtasks.length > 0 && (
          <span className="text-xs text-slate-400">
            {completedSubtasks}/{subtasks.length}
          </span>
        )}
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const priorityConfig: Record<string, { label: string; className: string }> = {
    high: {
      label: "High",
      className: "bg-red-900/50 text-red-300",
    },
    medium: {
      label: "Medium",
      className: "bg-yellow-900/50 text-yellow-300",
    },
    low: {
      label: "Low",
      className: "bg-green-900/50 text-green-300",
    },
  };

  const config = priorityConfig[priority] ?? {
    label: priority,
    className: "bg-slate-700 text-slate-300",
  };

  return <span className={`text-xs px-2 py-0.5 rounded ${config.className}`}>{config.label}</span>;
}
