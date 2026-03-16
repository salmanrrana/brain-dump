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
import TicketModal from "../components/TicketModal";
import { BoardHeader } from "../components/board";
import { getStatusLabel } from "../lib/constants";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { getTicket, getTickets } from "../api/tickets";
import { getProjectsWithEpics } from "../api/projects";
import { queryKeys } from "../lib/query-keys";
import { createBrowserLogger } from "../lib/browser-logger";
import { BoardSkeleton } from "../components/route-skeletons";
export const Route = createFileRoute("/board")({
  pendingComponent: BoardSkeleton,
  loader: ({ context }) => {
    // Pre-warm cache with default (unfiltered) tickets and projects
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.tickets({}),
      queryFn: () => getTickets({ data: {} }),
      staleTime: 30_000,
    });
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.projectsWithEpics,
      queryFn: () => getProjectsWithEpics(),
      staleTime: 30_000,
    });
  },
  component: Board,
});

function Board() {
  const logger = createBrowserLogger("routes:board");
  const {
    filters: appFilters,
    ticketRefreshKey,
    selectedTicketIdFromSearch,
    clearSelectedTicketFromSearch,
    clearAllFilters,
  } = useAppState();
  const { projects } = useProjects();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const { showToast } = useToast();

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
        const response = await getTicket({ data: selectedTicketIdFromSearch });

        // Validate response has required fields
        if (
          !response ||
          typeof response !== "object" ||
          !("id" in response) ||
          !("title" in response)
        ) {
          throw new Error("Invalid ticket response: missing required fields");
        }

        setSelectedTicket(response as Ticket);
      } catch (error) {
        logger.error(
          `Failed to fetch ticket from search: ticketId=${selectedTicketIdFromSearch}`,
          error instanceof Error ? error : new Error(String(error))
        );
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

  const allEpics = projects.flatMap((p) => p.epics);

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
    return <div className="h-full" />;
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[var(--accent-danger)]">{error}</p>
      </div>
    );
  }

  return (
    <div style={boardContainerStyles} className="route-fade-in">
      {/* Board Header with filters */}
      <BoardHeader
        projectId={appFilters.projectId}
        epicId={appFilters.epicId}
        tags={appFilters.tags}
        onClearFilters={clearAllFilters}
      />

      {/* Main content area */}
      <div style={contentAreaStyles}>
        <KanbanBoard
          tickets={tickets}
          onTicketClick={handleTicketClick}
          onRefresh={refetch}
          getRalphSession={getRalphSession}
        />
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
