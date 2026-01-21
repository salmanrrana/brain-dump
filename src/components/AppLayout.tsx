import {
  ReactNode,
  useState,
  createContext,
  useContext,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { Search, LayoutGrid, List, X, Loader2, Settings, RefreshCw } from "lucide-react";
import ProjectTree from "./ProjectTree";
import ContainerStatusSection from "./ContainerStatusSection";
import ContainerLogsModal from "./ContainerLogsModal";
import NewTicketModal from "./NewTicketModal";
import ProjectModal from "./ProjectModal";
import EpicModal from "./EpicModal";
import { SettingsModal } from "./settings";
import DeleteConfirmationModal, { type DeletePreview } from "./DeleteConfirmationModal";
import { NewTicketDropdown } from "./navigation/NewTicketDropdown";
import { InceptionModal } from "./inception/InceptionModal";
import { useToast } from "./Toast";
import { getStatusColor, getPriorityStyle } from "../lib/constants";
import {
  useProjects,
  useSearch,
  useTags,
  useModal,
  useFilters,
  useSampleData,
  useClickOutside,
  useDeleteEpic,
  useInvalidateQueries,
  useDockerAvailable,
  useRalphContainers,
  type Epic,
  type ProjectBase,
  type SearchResult,
  type ModalState,
  type Filters,
} from "../lib/hooks";
import { deleteEpic as deleteEpicFn } from "../api/epics";
import {
  useKeyboardShortcuts,
  KEYBOARD_SHORTCUTS,
  SHORTCUT_CATEGORY_LABELS,
} from "../lib/keyboard-shortcuts";

// App context for managing global state
interface AppState {
  // Filters
  filters: Filters;
  setProjectId: (id: string | null) => void;
  setEpicId: (id: string | null, projectId?: string) => void;
  toggleTag: (tag: string) => void;
  clearTagFilters: () => void;
  clearAllFilters: () => void;

  // View
  viewMode: "kanban" | "list";
  setViewMode: (mode: "kanban" | "list") => void;

  // Modals
  modal: ModalState;
  openNewTicketModal: () => void;
  openProjectModal: (project?: ProjectBase) => void;
  openEpicModal: (projectId: string, epic?: Epic) => void;
  openSettingsModal: () => void;
  closeModal: () => void;

  // Refresh
  ticketRefreshKey: number;
  refreshAllData: () => void;
  isRefreshing: boolean;

  // Search navigation
  selectedTicketIdFromSearch: string | null;
  onSelectTicketFromSearch: (ticketId: string) => void;
  clearSelectedTicketFromSearch: () => void;

  // Sample data
  hasSampleData: boolean;
  isDeletingSampleData: boolean;
  deleteSampleData: () => void;

  // Epic deletion
  onDeleteEpic: (epic: Epic) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within AppLayout");
  }
  return context;
}

interface AppLayoutProps {
  children: ReactNode;
}

// Get initial view mode from localStorage
function getInitialViewMode(): "kanban" | "list" {
  if (typeof window === "undefined") return "kanban";
  const stored = localStorage.getItem("brain-dump-view-mode");
  if (stored === "list" || stored === "kanban") return stored;
  return "kanban";
}

/**
 * Sanitize search snippet HTML for safe rendering.
 *
 * Security approach (whitelist pattern):
 * 1. Escape ALL HTML entities first - neutralizes any malicious content
 * 2. Restore ONLY safe tags - mark and b without attributes
 *
 * This is secure because:
 * - Source: SQLite FTS5 highlight() function output (predictable, server-generated)
 * - Only 2 benign formatting tags allowed (mark, b) with no attributes
 * - Tags are reconstructed without attributes, preventing attribute injection
 * - Any other HTML (scripts, event handlers) remains escaped
 *
 * DOMPurify not needed - this narrow whitelist is sufficient and avoids dependency.
 */
function sanitizeSnippet(html: string): string {
  // Step 1: Escape ALL HTML entities
  const escaped = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Step 2: Restore only safe highlight markers (SQLite FTS5 uses mark tag by default)
  return escaped
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>")
    .replace(/&lt;b&gt;/g, "<b>")
    .replace(/&lt;\/b&gt;/g, "</b>");
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { projects, refetch: refetchProjects } = useProjects();

  // Use consolidated hooks
  const {
    modal,
    openNewTicket,
    openProject,
    openEpic,
    openSettings,
    openShortcuts,
    close: closeModal,
    isAnyOpen: isAnyModalOpen,
  } = useModal();

  const { filters, setProjectId, setEpicId, toggleTag, clearTags, clearAll } = useFilters();

  // Sample data hook with callback to clear filters on deletion
  // Note: Query invalidation is now handled by useSampleData internally
  const handleSampleDataDeleted = useCallback(() => {
    setProjectId(null);
  }, [setProjectId]);

  const {
    hasSampleData,
    isDeleting: isDeletingSampleData,
    deleteSampleData,
  } = useSampleData(handleSampleDataDeleted);

  // Remaining state that doesn't fit into hooks
  const [viewMode, setViewModeState] = useState<"kanban" | "list">(getInitialViewMode);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);
  const [selectedTicketIdFromSearch, setSelectedTicketIdFromSearch] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Get invalidate queries helper
  const { invalidateAll } = useInvalidateQueries();

  // Delete epic state
  const [epicToDelete, setEpicToDelete] = useState<Epic | null>(null);
  const [deleteEpicPreview, setDeleteEpicPreview] = useState<DeletePreview>({});
  const [deleteEpicError, setDeleteEpicError] = useState<string | null>(null);
  const deleteEpicMutation = useDeleteEpic();
  const { showToast } = useToast();

  // Get all epics from projects
  const allEpics = useMemo(() => {
    return projects.flatMap((p) => p.epics);
  }, [projects]);

  // Persist view mode to localStorage
  const setViewMode = useCallback((mode: "kanban" | "list") => {
    setViewModeState(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("brain-dump-view-mode", mode);
    }
  }, []);

  // Modal handlers that integrate with project refetch
  const handleTicketCreated = useCallback(() => {
    closeModal();
    setTicketRefreshKey((k) => k + 1);
  }, [closeModal]);

  const handleProjectSaved = useCallback(() => {
    const currentProject = modal.type === "project" ? modal.project : null;
    closeModal();
    refetchProjects();
    // If we deleted the selected project, clear selection
    if (currentProject && filters.projectId === currentProject.id) {
      setProjectId(null);
    }
  }, [closeModal, refetchProjects, modal, filters.projectId, setProjectId]);

  const handleEpicSaved = useCallback(() => {
    const currentEpic = modal.type === "epic" ? modal.epic : null;
    closeModal();
    refetchProjects();
    // If we deleted the selected epic, clear selection
    if (currentEpic && filters.epicId === currentEpic.id) {
      setEpicId(null);
    }
  }, [closeModal, refetchProjects, modal, filters.epicId, setEpicId]);

  // Delete epic handlers
  const handleDeleteEpicClick = useCallback(async (epic: Epic) => {
    setDeleteEpicError(null);
    setEpicToDelete(epic);

    // Fetch dry-run preview
    try {
      const preview = await deleteEpicFn({ data: { epicId: epic.id, confirm: false } });
      if ("ticketsToUnlink" in preview) {
        setDeleteEpicPreview({
          ticketCount: preview.ticketsToUnlink.length,
          tickets: preview.ticketsToUnlink.map((t) => ({ title: t.title, status: t.status })),
        });
      }
    } catch (error) {
      console.error("Failed to fetch delete preview:", error);
      setDeleteEpicPreview({});
    }
  }, []);

  const handleDeleteEpicConfirm = useCallback(() => {
    if (!epicToDelete) return;

    deleteEpicMutation.mutate(
      { epicId: epicToDelete.id, confirm: true },
      {
        onSuccess: () => {
          showToast("success", `Epic "${epicToDelete.title}" deleted`);
          // If we deleted the selected epic, clear selection
          if (filters.epicId === epicToDelete.id) {
            setEpicId(null);
          }
          setEpicToDelete(null);
          setDeleteEpicPreview({});
          refetchProjects();
        },
        onError: (error) => {
          setDeleteEpicError(error instanceof Error ? error.message : "Failed to delete epic");
        },
      }
    );
  }, [epicToDelete, deleteEpicMutation, showToast, filters.epicId, setEpicId, refetchProjects]);

  const handleDeleteEpicCancel = useCallback(() => {
    setEpicToDelete(null);
    setDeleteEpicPreview({});
    setDeleteEpicError(null);
  }, []);

  // Refresh all data handler
  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await invalidateAll();
      await refetchProjects();
    } finally {
      // Brief delay to show the animation
      setTimeout(() => setIsRefreshing(false), 300);
    }
  }, [invalidateAll, refetchProjects]);

  // Search navigation handlers
  const onSelectTicketFromSearch = useCallback((ticketId: string) => {
    setSelectedTicketIdFromSearch(ticketId);
  }, []);

  const clearSelectedTicketFromSearch = useCallback(() => {
    setSelectedTicketIdFromSearch(null);
  }, []);

  // Focus search input callback for keyboard shortcut
  const handleFocusSearch = useCallback(() => {
    const searchInput = document.querySelector(
      'input[placeholder="Search tickets..."]'
    ) as HTMLInputElement;
    searchInput?.focus();
  }, []);

  // Global keyboard shortcuts using the extracted hook
  useKeyboardShortcuts({
    onNewTicket: openNewTicket,
    onRefresh: refreshAllData,
    onFocusSearch: handleFocusSearch,
    onShowShortcuts: openShortcuts,
    onCloseModal: closeModal,
    disabled: isAnyModalOpen,
    isRefreshing,
  });

  const appState: AppState = {
    // Filters
    filters,
    setProjectId,
    setEpicId,
    toggleTag,
    clearTagFilters: clearTags,
    clearAllFilters: clearAll,

    // View
    viewMode,
    setViewMode,

    // Modals
    modal,
    openNewTicketModal: openNewTicket,
    openProjectModal: openProject,
    openEpicModal: openEpic,
    openSettingsModal: openSettings,
    closeModal,

    // Refresh
    ticketRefreshKey,
    refreshAllData,
    isRefreshing,

    // Search navigation
    selectedTicketIdFromSearch,
    onSelectTicketFromSearch,
    clearSelectedTicketFromSearch,

    // Sample data
    hasSampleData,
    isDeletingSampleData,
    deleteSampleData,

    // Epic deletion
    onDeleteEpic: handleDeleteEpicClick,
  };

  return (
    <AppContext.Provider value={appState}>
      <div className="h-screen grid grid-cols-[256px_1fr] text-gray-100">
        {/* Sidebar - 256px (w-64 equivalent) */}
        <Sidebar />

        {/* Main content area - takes remaining space */}
        <div className="flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <AppHeader />

          {/* Content */}
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>

        {/* New Ticket Modal */}
        {modal.type === "newTicket" && (
          <NewTicketModal
            projects={projects}
            epics={allEpics}
            defaultProjectId={filters.projectId}
            onClose={closeModal}
            onCreate={handleTicketCreated}
          />
        )}

        {/* Project Modal */}
        {modal.type === "project" && (
          <ProjectModal project={modal.project} onClose={closeModal} onSave={handleProjectSaved} />
        )}

        {/* Epic Modal */}
        {modal.type === "epic" && (
          <EpicModal
            epic={modal.epic}
            projectId={modal.projectId}
            onClose={closeModal}
            onSave={handleEpicSaved}
          />
        )}

        {/* Settings Modal */}
        {modal.type === "settings" && <SettingsModal onClose={closeModal} />}

        {/* Keyboard Shortcuts Help Modal */}
        {modal.type === "shortcuts" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60" onClick={closeModal} aria-hidden="true" />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-title"
              className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-md p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 id="shortcuts-title" className="text-lg font-semibold text-gray-100">
                  Keyboard Shortcuts
                </h2>
                <button
                  onClick={closeModal}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-gray-100"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              {/* Render shortcuts from the centralized constant */}
              {Object.entries(
                KEYBOARD_SHORTCUTS.reduce(
                  (acc, shortcut) => {
                    const category = shortcut.category;
                    if (!acc[category]) acc[category] = [];
                    acc[category].push(shortcut);
                    return acc;
                  },
                  {} as Record<string, typeof KEYBOARD_SHORTCUTS>
                )
              ).map(([category, shortcuts]) => (
                <div key={category} className="mb-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {SHORTCUT_CATEGORY_LABELS[category] ?? category}
                  </h3>
                  <div className="space-y-2">
                    {shortcuts.map((shortcut) => (
                      <div key={shortcut.key} className="flex items-center justify-between">
                        <span className="text-slate-300">{shortcut.description}</span>
                        <kbd className="px-2 py-1 bg-slate-800 rounded text-sm font-mono text-slate-300">
                          {shortcut.key === "Escape" ? "Esc" : shortcut.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="mt-2 text-xs text-slate-500">
                Shortcuts are disabled when typing in text fields.
              </p>
            </div>
          </div>
        )}

        {/* Delete Epic Confirmation Modal */}
        {epicToDelete && (
          <DeleteConfirmationModal
            isOpen={true}
            onClose={handleDeleteEpicCancel}
            onConfirm={handleDeleteEpicConfirm}
            isLoading={deleteEpicMutation.isPending}
            entityType="epic"
            entityName={epicToDelete.title}
            preview={deleteEpicPreview}
            error={deleteEpicError}
          />
        )}
      </div>
    </AppContext.Provider>
  );
}

function AppHeader() {
  const {
    viewMode,
    setViewMode,
    openNewTicketModal,
    openSettingsModal,
    filters,
    onSelectTicketFromSearch,
    refreshAllData,
    isRefreshing,
  } = useAppState();
  const { query, results, loading, search, clearSearch } = useSearch(filters.projectId);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inception modal state
  const [isInceptionModalOpen, setIsInceptionModalOpen] = useState(false);

  // Close search dropdown when clicking outside - uses the existing useClickOutside hook
  const closeSearchResults = useCallback(() => setShowResults(false), []);
  useClickOutside(searchRef, closeSearchResults, showResults);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    search(e.target.value);
    setShowResults(true);
  };

  const handleClear = () => {
    clearSearch();
    setShowResults(false);
    inputRef.current?.focus();
  };

  const handleSelectResult = (result: SearchResult) => {
    onSelectTicketFromSearch(result.id);
    clearSearch();
    setShowResults(false);
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4">
      {/* Search */}
      <div className="flex-1 max-w-md" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleSearchChange}
            onFocus={() => query && setShowResults(true)}
            placeholder="Search tickets..."
            className="w-full pl-10 pr-10 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {loading && (
            <Loader2
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"
              size={16}
            />
          )}
          {!loading && query && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-gray-100"
            >
              <X size={16} />
            </button>
          )}

          {/* Search Results Dropdown */}
          {showResults && query && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-80 overflow-y-auto z-50">
              {results.length === 0 && !loading && (
                <div className="px-4 py-3 text-sm text-slate-500 text-center">No results found</div>
              )}
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => handleSelectResult(result)}
                  className="w-full px-4 py-3 text-left hover:bg-slate-800 border-b border-slate-800 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${getStatusColor(result.status)}`}>
                      {result.status.replace("_", " ")}
                    </span>
                    {result.priority && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${getPriorityStyle(result.priority)}`}
                      >
                        {result.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-100 mt-1">{result.title}</div>
                  {result.snippet && result.snippet !== result.title && (
                    <div
                      className="text-xs text-slate-400 mt-1 line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
        <button
          onClick={() => setViewMode("kanban")}
          className={`p-2 rounded-md transition-colors ${
            viewMode === "kanban"
              ? "bg-slate-700 text-cyan-400"
              : "text-slate-400 hover:text-gray-100 hover:bg-slate-700"
          }`}
          title="Kanban view"
        >
          <LayoutGrid size={18} />
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`p-2 rounded-md transition-colors ${
            viewMode === "list"
              ? "bg-slate-700 text-cyan-400"
              : "text-slate-400 hover:text-gray-100 hover:bg-slate-700"
          }`}
          title="List view"
        >
          <List size={18} />
        </button>
      </div>

      {/* Refresh button */}
      <button
        onClick={() => void refreshAllData()}
        disabled={isRefreshing}
        className="p-2 text-slate-400 hover:text-gray-100 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
        title="Refresh data (r)"
      >
        <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
      </button>

      {/* Settings button */}
      <button
        onClick={openSettingsModal}
        className="p-2 text-slate-400 hover:text-gray-100 hover:bg-slate-800 rounded-lg transition-colors"
        title="Settings"
      >
        <Settings size={18} />
      </button>

      {/* New ticket dropdown */}
      <NewTicketDropdown
        onNewTicket={openNewTicketModal}
        onStartFromScratch={() => setIsInceptionModalOpen(true)}
      />

      {/* Inception Modal */}
      <InceptionModal
        isOpen={isInceptionModalOpen}
        onClose={() => setIsInceptionModalOpen(false)}
        onSkipAI={openNewTicketModal}
      />
    </header>
  );
}

function Sidebar() {
  const { projects, loading, error } = useProjects();
  const {
    filters,
    setProjectId,
    setEpicId,
    openProjectModal,
    openEpicModal,
    toggleTag,
    clearTagFilters,
    hasSampleData,
    isDeletingSampleData,
    deleteSampleData,
    onDeleteEpic,
  } = useAppState();

  // Check Docker availability first (cached, re-checks every 60s)
  const { available: dockerAvailable } = useDockerAvailable();

  // Only poll for Ralph containers if Docker is available
  const { containers: ralphContainers } = useRalphContainers({
    enabled: dockerAvailable,
    pollingInterval: 5000,
  });

  // Build set of project IDs with running Docker containers
  const projectsWithDockerContainers = useMemo(() => {
    const projectIds = new Set<string>();
    for (const container of ralphContainers) {
      if (container.isRunning && container.projectId) {
        projectIds.add(container.projectId);
      }
    }
    return projectIds;
  }, [ralphContainers]);

  // State for container logs modal from Docker indicator click
  const [dockerLogsProjectId, setDockerLogsProjectId] = useState<string | null>(null);

  // Find the container name for the logs modal
  const dockerLogsContainerName = useMemo(() => {
    if (!dockerLogsProjectId) return null;
    const container = ralphContainers.find(
      (c) => c.isRunning && c.projectId === dockerLogsProjectId
    );
    return container?.name ?? null;
  }, [dockerLogsProjectId, ralphContainers]);

  // Fetch tags based on current project/epic filter
  const tagFilters = useMemo(() => {
    const f: { projectId?: string; epicId?: string } = {};
    if (filters.projectId) f.projectId = filters.projectId;
    if (filters.epicId) f.epicId = filters.epicId;
    return f;
  }, [filters.projectId, filters.epicId]);

  const { tags: availableTags } = useTags(tagFilters);

  // Get the selected project's path for container status section
  const selectedProjectPath = useMemo(() => {
    if (!filters.projectId) return null;
    const selectedProject = projects.find((p) => p.id === filters.projectId);
    return selectedProject?.path ?? null;
  }, [filters.projectId, projects]);

  const handleSelectProject = (projectId: string | null) => {
    setProjectId(projectId);
  };

  const handleSelectEpic = (epicId: string | null, projectId: string) => {
    // When selecting an epic, also set the project context
    setEpicId(epicId, projectId);
  };

  const handleAddProject = () => {
    openProjectModal();
  };

  const handleAddEpic = (projectId: string) => {
    openEpicModal(projectId);
  };

  const handleEditProject = (project: ProjectBase) => {
    openProjectModal(project);
  };

  const handleEditEpic = (projectId: string, epic: Epic) => {
    openEpicModal(projectId, epic);
  };

  return (
    <aside
      className="flex flex-col"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-primary)",
      }}
    >
      {/* Logo/Title */}
      <div className="h-14 flex items-center px-4 border-b border-slate-800">
        <h1 className="text-3xl">🧠 💩</h1>
      </div>

      {/* Project tree */}
      <nav className="flex-1 p-4 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-400 py-4 text-center">{error}</div>
        ) : (
          <ProjectTree
            projects={projects}
            selectedProjectId={filters.projectId}
            selectedEpicId={filters.epicId}
            projectsWithDockerContainers={projectsWithDockerContainers}
            onDockerIndicatorClick={setDockerLogsProjectId}
            onSelectProject={handleSelectProject}
            onSelectEpic={handleSelectEpic}
            onAddProject={handleAddProject}
            onAddEpic={handleAddEpic}
            onEditProject={handleEditProject}
            onEditEpic={handleEditEpic}
            onDeleteEpic={onDeleteEpic}
          />
        )}

        {/* Tag filters */}
        {availableTags.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Tags
              </h2>
              {filters.tags.length > 0 && (
                <button
                  onClick={clearTagFilters}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((tag) => {
                const isSelected = filters.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2 py-1 rounded-full transition-colors ${
                      isSelected
                        ? "bg-cyan-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Container status - shows running Docker services for selected project */}
        <ContainerStatusSection projectPath={selectedProjectPath} />
      </nav>

      {/* Sample data banner */}
      {hasSampleData && (
        <div className="px-4 py-3 border-t border-slate-800 bg-amber-900/20">
          <p className="text-xs text-amber-400 mb-2">
            Sample data is loaded. Delete it to start fresh.
          </p>
          <button
            onClick={() => void deleteSampleData()}
            disabled={isDeletingSampleData}
            className="w-full text-xs px-3 py-1.5 bg-red-900/50 hover:bg-red-900/70 disabled:bg-slate-700 text-red-300 rounded transition-colors"
          >
            {isDeletingSampleData ? "Deleting..." : "Delete Sample Data"}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 text-center">Brain Dump v0.1.0</p>
      </div>

      {/* Container Logs Modal for Docker indicator click */}
      <ContainerLogsModal
        isOpen={dockerLogsProjectId !== null}
        onClose={() => setDockerLogsProjectId(null)}
        containerName={dockerLogsContainerName}
      />
    </aside>
  );
}
