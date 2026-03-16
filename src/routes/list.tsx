import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppState } from "../components/AppLayout";
import {
  useTickets,
  useProjects,
  useTagsWithMetadata,
  type Ticket,
  type StatusChange,
} from "../lib/hooks";
import { useToast } from "../components/Toast";
import TicketListView from "../components/TicketListView";
import TagListView from "../components/TagListView";
import TicketModal from "../components/TicketModal";
import { getStatusLabel } from "../lib/constants";
import { getTicket, getTickets } from "../api/tickets";
import { getProjects } from "../api/projects";
import { getEpicsByProject } from "../api/epics";
import { queryKeys } from "../lib/query-keys";
import { createBrowserLogger } from "../lib/browser-logger";

interface ListSearch {
  view?: "tags";
}

export const Route = createFileRoute("/list")({
  loader: ({ context }) => {
    // Pre-warm cache with default (unfiltered) tickets and projects
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.tickets({}),
      queryFn: () => getTickets({ data: {} }),
      staleTime: 30_000,
    });
    void context.queryClient.ensureQueryData({
      queryKey: queryKeys.projectsWithEpics,
      queryFn: async () => {
        const projectList = await getProjects();
        return Promise.all(
          projectList.map(async (project: (typeof projectList)[0]) => {
            const epics = await getEpicsByProject({ data: project.id });
            return { ...project, epics };
          })
        );
      },
      staleTime: 30_000,
    });
  },
  component: ListView,
  validateSearch: (search: Record<string, unknown>): ListSearch => ({
    ...(search.view === "tags" ? { view: "tags" as const } : {}),
  }),
});

type ListSubMode = "tickets" | "tags";

function ListView() {
  const logger = createBrowserLogger("routes:list");
  const {
    filters: appFilters,
    ticketRefreshKey,
    selectedTicketIdFromSearch,
    clearSelectedTicketFromSearch,
  } = useAppState();
  const navigate = useNavigate();
  const { projects } = useProjects();
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const { showToast } = useToast();

  // Sub-mode from URL param ?view=tags (default: tickets)
  const search = Route.useSearch();
  const listSubMode: ListSubMode = search.view === "tags" ? "tags" : "tickets";

  const setListSubMode = useCallback(
    (mode: ListSubMode) => {
      void navigate({
        to: ".",
        search: mode === "tags" ? { view: "tags" as const } : {},
        replace: true,
      });
    },
    [navigate]
  );

  const filters = useMemo(() => {
    const f: { projectId?: string; epicId?: string; tags?: string[] } = {};
    if (appFilters.projectId) f.projectId = appFilters.projectId;
    if (appFilters.epicId) f.epicId = appFilters.epicId;
    if (appFilters.tags.length > 0) f.tags = appFilters.tags;
    return f;
  }, [appFilters.projectId, appFilters.epicId, appFilters.tags]);

  // Tag metadata: show ALL tags (unfiltered) so the Tags tab works without selecting a project/epic
  const tagFilters = useMemo(() => ({}), []);

  // Handle status changes from external sources (CLI, hooks)
  const handleStatusChange = useCallback(
    (change: StatusChange) => {
      const fromLabel = getStatusLabel(change.fromStatus);
      const toLabel = getStatusLabel(change.toStatus);

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

  // Fetch tag metadata only when in tags sub-mode
  const { tagsWithMetadata } = useTagsWithMetadata(tagFilters, {
    enabled: listSubMode === "tags",
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
        const response = await getTicket({ data: selectedTicketIdFromSearch });

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

  // Tag drill-down: click tag row -> navigate to /board with tag filter, pushing history
  const handleTagClick = useCallback(
    (tagName: string) => {
      const newTags = appFilters.tags.includes(tagName)
        ? appFilters.tags.filter((t) => t !== tagName)
        : [...appFilters.tags, tagName];

      const search: Record<string, string | undefined> = {};
      if (appFilters.projectId) search.project = appFilters.projectId;
      if (appFilters.epicId) search.epic = appFilters.epicId;
      if (newTags.length > 0) search.tags = newTags.join(",");

      void navigate({ to: "/board", search, replace: false });
    },
    [appFilters, navigate]
  );

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
    <div style={listContainerStyles} className="route-fade-in">
      {/* List sub-mode toggle */}
      <div className="flex items-center gap-1 px-1 pb-3">
        <div
          className="flex items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg p-1"
          role="group"
          aria-label="List sub-view"
        >
          <button
            onClick={() => setListSubMode("tickets")}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              listSubMode === "tickets"
                ? "bg-[var(--bg-hover)] text-[var(--accent-primary)] font-medium"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            }`}
            aria-pressed={listSubMode === "tickets"}
          >
            Tickets
          </button>
          <button
            onClick={() => setListSubMode("tags")}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              listSubMode === "tags"
                ? "bg-[var(--bg-hover)] text-[var(--accent-primary)] font-medium"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            }`}
            aria-pressed={listSubMode === "tags"}
          >
            Tags
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div style={contentAreaStyles}>
        {listSubMode === "tags" ? (
          <TagListView tagsWithMetadata={tagsWithMetadata} onTagClick={handleTagClick} />
        ) : (
          <TicketListView tickets={tickets} epics={allEpics} onTicketClick={handleTicketClick} />
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

const listContainerStyles: React.CSSProperties = {
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
