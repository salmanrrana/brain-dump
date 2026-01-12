import {
  ReactNode,
  useState,
  createContext,
  useContext,
  useMemo,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { Search, LayoutGrid, List, Plus, X, Loader2, Settings, ChevronDown, Rocket } from "lucide-react";
import ProjectTree from "./ProjectTree";
import NewTicketModal from "./NewTicketModal";
import ProjectModal from "./ProjectModal";
import EpicModal from "./EpicModal";
import SettingsModal from "./SettingsModal";
import {
  useProjects,
  useSearch,
  useTags,
  useModal,
  useFilters,
  useSampleData,
  useClickOutside,
  useLaunchProjectInception,
  useSettings,
  type Epic,
  type ProjectBase,
  type SearchResult,
  type ModalState,
  type Filters,
} from "../lib/hooks";

// App context for managing global state
interface AppState {
  // Filters
  filters: Filters;
  setProjectId: (id: string | null) => void;
  setEpicId: (id: string | null, projectId?: string) => void;
  toggleTag: (tag: string) => void;
  clearTagFilters: () => void;

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

  // Search navigation
  selectedTicketIdFromSearch: string | null;
  onSelectTicketFromSearch: (ticketId: string) => void;
  clearSelectedTicketFromSearch: () => void;

  // Sample data
  hasSampleData: boolean;
  isDeletingSampleData: boolean;
  deleteSampleData: () => void;
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

// Sanitize search snippet HTML - only allow safe highlight markers
function sanitizeSnippet(html: string): string {
  // First escape all HTML
  const escaped = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  // Then restore only our safe highlight markers (from SQLite FTS5)
  // FTS5 uses <mark> tags by default for highlighting
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

  const {
    filters,
    setProjectId,
    setEpicId,
    toggleTag,
    clearTags,
  } = useFilters();

  // Sample data hook with callback to clear filters and refetch on deletion
  const handleSampleDataDeleted = useCallback(() => {
    setProjectId(null);
    refetchProjects();
  }, [setProjectId, refetchProjects]);

  const {
    hasSampleData,
    isDeleting: isDeletingSampleData,
    deleteSampleData,
  } = useSampleData(handleSampleDataDeleted);

  // Remaining state that doesn't fit into hooks
  const [viewMode, setViewModeState] = useState<"kanban" | "list">(getInitialViewMode);
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);
  const [selectedTicketIdFromSearch, setSelectedTicketIdFromSearch] = useState<string | null>(null);

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

  // Search navigation handlers
  const onSelectTicketFromSearch = useCallback((ticketId: string) => {
    setSelectedTicketIdFromSearch(ticketId);
  }, []);

  const clearSelectedTicketFromSearch = useCallback(() => {
    setSelectedTicketIdFromSearch(null);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case "n":
          if (!isAnyModalOpen) {
            e.preventDefault();
            openNewTicket();
          }
          break;
        case "/":
          if (!isAnyModalOpen) {
            e.preventDefault();
            // Focus search input
            const searchInput = document.querySelector(
              'input[placeholder="Search tickets..."]'
            ) as HTMLInputElement;
            searchInput?.focus();
          }
          break;
        case "?":
          if (!isAnyModalOpen) {
            e.preventDefault();
            openShortcuts();
          }
          break;
        case "Escape":
          if (isAnyModalOpen) {
            closeModal();
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isAnyModalOpen, openNewTicket, openShortcuts, closeModal]);

  const appState: AppState = {
    // Filters
    filters,
    setProjectId,
    setEpicId,
    toggleTag,
    clearTagFilters: clearTags,

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

    // Search navigation
    selectedTicketIdFromSearch,
    onSelectTicketFromSearch,
    clearSelectedTicketFromSearch,

    // Sample data
    hasSampleData,
    isDeletingSampleData,
    deleteSampleData,
  };

  return (
    <AppContext.Provider value={appState}>
      <div className="min-h-screen bg-slate-950 text-gray-100 flex">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0">
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
          <ProjectModal
            project={modal.project}
            onClose={closeModal}
            onSave={handleProjectSaved}
          />
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
        {modal.type === "settings" && (
          <SettingsModal onClose={closeModal} />
        )}

        {/* Keyboard Shortcuts Help Modal */}
        {modal.type === "shortcuts" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closeModal}
              aria-hidden="true"
            />
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
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">New ticket</span>
                  <kbd className="px-2 py-1 bg-slate-800 rounded text-sm font-mono text-slate-300">n</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Focus search</span>
                  <kbd className="px-2 py-1 bg-slate-800 rounded text-sm font-mono text-slate-300">/</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Show shortcuts</span>
                  <kbd className="px-2 py-1 bg-slate-800 rounded text-sm font-mono text-slate-300">?</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Close modal</span>
                  <kbd className="px-2 py-1 bg-slate-800 rounded text-sm font-mono text-slate-300">Esc</kbd>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Shortcuts are disabled when typing in text fields.
              </p>
            </div>
          </div>
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
  } = useAppState();
  const { query, results, loading, search, clearSearch } =
    useSearch(filters.projectId);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // New ticket dropdown state
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const launchInceptionMutation = useLaunchProjectInception();
  const { settings } = useSettings();

  // Close new menu when clicking outside
  useClickOutside(newMenuRef, () => setShowNewMenu(false), showNewMenu);

  const handleStartFromScratch = async () => {
    setShowNewMenu(false);
    const result = await launchInceptionMutation.mutateAsync({
      preferredTerminal: settings?.terminalEmulator ?? null,
    });
    if (!result.success) {
      // TODO: Show error toast
      console.error(result.message);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "text-green-400";
      case "in_progress":
        return "text-amber-400";
      case "review":
        return "text-purple-400";
      case "ready":
        return "text-blue-400";
      default:
        return "text-slate-400";
    }
  };

  return (
    <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4">
      {/* Search */}
      <div className="flex-1 max-w-md" ref={searchRef}>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
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
                <div className="px-4 py-3 text-sm text-slate-500 text-center">
                  No results found
                </div>
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
                        className={`text-xs px-1.5 py-0.5 rounded ${
                          result.priority === "high"
                            ? "bg-red-900/50 text-red-300"
                            : result.priority === "medium"
                              ? "bg-yellow-900/50 text-yellow-300"
                              : "bg-green-900/50 text-green-300"
                        }`}
                      >
                        {result.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-100 mt-1">
                    {result.title}
                  </div>
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

      {/* Settings button */}
      <button
        onClick={openSettingsModal}
        className="p-2 text-slate-400 hover:text-gray-100 hover:bg-slate-800 rounded-lg transition-colors"
        title="Settings"
      >
        <Settings size={18} />
      </button>

      {/* New ticket dropdown */}
      <div className="relative" ref={newMenuRef}>
        <div className="flex">
          {/* Main button */}
          <button
            onClick={openNewTicketModal}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-l-lg font-medium text-sm transition-colors"
          >
            <Plus size={18} />
            <span>New Ticket</span>
          </button>

          {/* Dropdown toggle */}
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="flex items-center px-2 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-r-lg border-l border-cyan-700 transition-colors"
            aria-label="More options"
          >
            <ChevronDown size={16} />
          </button>
        </div>

        {/* Dropdown Menu */}
        {showNewMenu && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <button
              onClick={() => {
                setShowNewMenu(false);
                openNewTicketModal();
              }}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
            >
              <Plus size={18} className="text-cyan-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-gray-100">New Ticket</div>
                <div className="text-xs text-slate-400">
                  Add a ticket to an existing project
                </div>
              </div>
            </button>
            <button
              onClick={handleStartFromScratch}
              disabled={launchInceptionMutation.isPending}
              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left border-t border-slate-700 disabled:opacity-50"
            >
              <Rocket size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="font-medium text-gray-100">Start from Scratch</div>
                <div className="text-xs text-slate-400">
                  Create a new project with Claude
                </div>
              </div>
            </button>
          </div>
        )}
      </div>
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
  } = useAppState();

  // Fetch tags based on current project/epic filter
  const tagFilters = useMemo(() => {
    const f: { projectId?: string; epicId?: string } = {};
    if (filters.projectId) f.projectId = filters.projectId;
    if (filters.epicId) f.epicId = filters.epicId;
    return f;
  }, [filters.projectId, filters.epicId]);

  const { tags: availableTags } = useTags(tagFilters);

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
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo/Title */}
      <div className="h-14 flex items-center px-4 border-b border-slate-800">
        <h1 className="text-3xl">🧠 💩</h1>
      </div>

      {/* Project tree */}
      <nav className="flex-1 p-4 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-slate-500 py-4 text-center">
            Loading...
          </div>
        ) : error ? (
          <div className="text-sm text-red-400 py-4 text-center">{error}</div>
        ) : (
          <ProjectTree
            projects={projects}
            selectedProjectId={filters.projectId}
            selectedEpicId={filters.epicId}
            onSelectProject={handleSelectProject}
            onSelectEpic={handleSelectEpic}
            onAddProject={handleAddProject}
            onAddEpic={handleAddEpic}
            onEditProject={handleEditProject}
            onEditEpic={handleEditEpic}
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
    </aside>
  );
}
