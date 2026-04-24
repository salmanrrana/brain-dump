import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Profiler, useCallback, useEffect, useMemo, useState } from "react";
import { onRenderCallback } from "../lib/profiler";
import { useAppState } from "../components/AppLayout";
import {
  useTicketSummaries,
  useProjects,
  useActiveRalphSessions,
  type Ticket,
  type StatusChange,
} from "../lib/hooks";
import type { TicketSummary } from "../api/tickets";
import { useToast } from "../components/Toast";
import TicketModal from "../components/TicketModal";
import { BoardHeader } from "../components/board";
import { getStatusLabel } from "../lib/constants";
import { KanbanBoard } from "../components/board/KanbanBoard";
import { getTicket, getTicketSummaries } from "../api/tickets";
import { getProjectsWithEpics } from "../api/projects";
import { queryKeys } from "../lib/query-keys";
import { createBrowserLogger } from "../lib/browser-logger";
import { markLoaderStart, markLoaderEnd, timedFetch } from "../lib/navigation-timing";
import { BoardSkeleton } from "../components/route-skeletons";
export const Route = createFileRoute("/board")({
  pendingComponent: BoardSkeleton,
  loader: async ({ context }) => {
    markLoaderStart("board");
    // Pre-warm cache with default (unfiltered) tickets and projects
    await Promise.all([
      timedFetch("board:tickets", () =>
        context.queryClient.ensureQueryData({
          queryKey: queryKeys.ticketSummaries({}),
          queryFn: () => getTicketSummaries({ data: {} }),
          staleTime: 30_000,
        })
      ),
      timedFetch("board:projects", () =>
        context.queryClient.ensureQueryData({
          queryKey: queryKeys.projectsWithEpics,
          queryFn: () => getProjectsWithEpics(),
          staleTime: 30_000,
        })
      ),
    ]);
    markLoaderEnd("board");
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
  const queryClient = useQueryClient();

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

  const { tickets, loading, error, refetch } = useTicketSummaries(filters, {
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
        const response = await queryClient.ensureQueryData({
          queryKey: queryKeys.ticket(selectedTicketIdFromSearch),
          queryFn: () => getTicket({ data: selectedTicketIdFromSearch }),
          staleTime: 30_000,
        });

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
  }, [selectedTicketIdFromSearch, clearSelectedTicketFromSearch, queryClient, showToast]);

  const allEpics = projects.flatMap((p) => p.epics);

  const handleTicketClick = async (ticket: TicketSummary) => {
    try {
      const fullTicket = await queryClient.ensureQueryData({
        queryKey: queryKeys.ticket(ticket.id),
        queryFn: () => getTicket({ data: ticket.id }),
        staleTime: 30_000,
      });
      setSelectedTicket(fullTicket as Ticket);
    } catch (err) {
      logger.error(
        `Failed to fetch ticket detail: ticketId=${ticket.id}`,
        err instanceof Error ? err : new Error(String(err))
      );
      showToast("error", "Failed to open ticket details");
    }
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
    <Profiler id="Board" onRender={onRenderCallback}>
      <div style={boardContainerStyles} className="route-fade-in">
        {/* Board Header with filters */}
        <Profiler id="Board.Header" onRender={onRenderCallback}>
          <BoardHeader
            projectId={appFilters.projectId}
            epicId={appFilters.epicId}
            tags={appFilters.tags}
            onClearFilters={clearAllFilters}
          />
        </Profiler>

        {/* Main content area */}
        <div style={contentAreaStyles}>
          <Profiler id="Board.Kanban" onRender={onRenderCallback}>
            <KanbanBoard
              tickets={tickets}
              onTicketClick={handleTicketClick}
              onRefresh={refetch}
              getRalphSession={getRalphSession}
            />
          </Profiler>
        </div>

        {/* Ticket Detail Modal */}
        {selectedTicket && (
          <Profiler id="Board.TicketModal" onRender={onRenderCallback}>
            <TicketModal
              ticket={selectedTicket}
              epics={allEpics}
              onClose={handleModalClose}
              onUpdate={handleTicketUpdate}
            />
          </Profiler>
        )}
      </div>
    </Profiler>
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
