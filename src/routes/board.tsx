import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "../components/AppLayout";
import {
  useTickets,
  useProjects,
  useActiveRalphSessions,
  type Ticket,
  type StatusChange,
} from "../lib/hooks";
import { useToast } from "../components/Toast";
import TicketListView from "../components/TicketListView";
import TicketModal from "../components/TicketModal";
import { BoardHeader } from "../components/board";
import { getStatusLabel } from "../lib/constants";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { getTicket } from "../api/tickets";

export const Route = createFileRoute("/board")({
  component: Board,
});

function Board() {
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
      const fromLabel = getStatusLabel(change.fromStatus);
      const toLabel = getStatusLabel(change.toStatus);

      // Special message for auto-completion to AI review
      if (change.toStatus === "ai_review") {
        showToast("success", `"${change.ticketTitle}" is ready for AI review!`);
      } else if (change.toStatus === "human_review") {
        showToast("success", `"${change.ticketTitle}" is ready for human review!`);
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

  // Fetch active Ralph sessions for status display on cards
  const { getSession: getRalphSession } = useActiveRalphSessions();

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
        showToast(
          "error",
          `Failed to open ticket: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      } finally {
        clearSelectedTicketFromSearch();
      }
    };

    void fetchAndSelectTicket();
  }, [selectedTicketIdFromSearch, clearSelectedTicketFromSearch, showToast]);

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

  // Get clearAllFilters from app state (which uses the URL-synced useFilters hook)
  const { clearAllFilters } = useAppState();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--text-secondary)]">Loading tickets...</p>
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

  return (
    <div style={boardContainerStyles}>
      {/* Board Header with filters */}
      {viewMode === "kanban" && (
        <BoardHeader
          projectId={appFilters.projectId}
          epicId={appFilters.epicId}
          tags={appFilters.tags}
          onClearFilters={clearAllFilters}
        />
      )}

      {/* Main content area */}
      <div style={contentAreaStyles}>
        {viewMode === "list" ? (
          <TicketListView tickets={tickets} epics={allEpics} onTicketClick={handleTicketClick} />
        ) : (
          <KanbanBoard
            tickets={tickets}
            onTicketClick={handleTicketClick}
            onRefresh={refetch}
            getRalphSession={getRalphSession}
          />
        )}
      </div>

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

// ============================================================================
// Container Styles
// ============================================================================

const boardContainerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  minHeight: 0,
  overflow: "hidden",
};

const contentAreaStyles: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};
