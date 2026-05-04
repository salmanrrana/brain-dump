import { lazy, ReactNode, Suspense, useState, useMemo, useCallback } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, List, Settings, RefreshCw, Menu, MessageSquareWarning } from "lucide-react";
import { IconSidebar } from "./navigation/IconSidebar";
import { ProjectsPanel } from "./navigation/ProjectsPanel";
import { SearchBar } from "./navigation/SearchBar";
import ProjectTree from "./ProjectTree";
import ContainerStatusSection from "./ContainerStatusSection";
import type { DeletePreview } from "./DeleteConfirmationModal";
import { NewTicketDropdown } from "./navigation/NewTicketDropdown";
import { useToast } from "./Toast";
import {
  useProjects,
  useProjectsWithAIActivity,
  useTags,
  useModal,
  useFilters,
  useSampleData,
  useDeleteEpic,
  useInvalidateQueries,
  useDockerAvailable,
  useRalphContainers,
  useLaunchRalphForEpic,
  useSettings,
  type ActiveRalphSession,
  type Epic,
  type ProjectBase,
  type SearchResult,
} from "../lib/hooks";
import {
  AppEpicDeletionContext,
  AppFiltersContext,
  AppMobileMenuContext,
  AppModalActionsContext,
  AppProjectsPanelContext,
  AppRefreshContext,
  AppSampleDataContext,
  AppSearchNavigationContext,
  useAppEpicDeletion,
  useAppFilters,
  useAppMobileMenu,
  useAppModalActions,
  useAppRefresh,
  useAppSampleData,
  useAppSearchNavigation,
  type AppEpicDeletionState,
  type AppFiltersState,
  type AppMobileMenuState,
  type AppModalActionsState,
  type AppProjectsPanelState,
  type AppRefreshState,
  type AppSampleDataState,
  type AppSearchNavigationState,
} from "./AppLayoutContext";
import { deleteEpic as deleteEpicFn } from "../api/epics";
import { useKeyboardShortcuts } from "../lib/keyboard-shortcuts";
import type { RalphAutonomousUiLaunchProvider } from "../lib/launch-provider-contract";
import {
  defaultRalphLaunchDependencies,
  dispatchRalphAutonomousUiLaunch,
  getDefaultRalphAutonomousProviderForWorkingMethod,
} from "../lib/ui-launch-dispatcher";

const ContainerLogsModal = lazy(() => import("./ContainerLogsModal"));
const DeleteConfirmationModal = lazy(() => import("./DeleteConfirmationModal"));
const EpicModal = lazy(() => import("./EpicModal"));
const FeedbackModal = lazy(() =>
  import("./FeedbackModal").then((module) => ({ default: module.FeedbackModal }))
);
const ImportModal = lazy(() => import("./transfer/ImportModal"));
const InceptionModal = lazy(() => import("./inception/InceptionModal"));
const NewTicketModal = lazy(() => import("./NewTicketModal"));
const ProjectModal = lazy(() => import("./ProjectModal"));
const SettingsModal = lazy(() => import("./settings/SettingsModal"));
const ShortcutsModal = lazy(() => import("./ui/ShortcutsModal"));

function ModalFallback() {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      Loading dialog...
    </div>
  );
}

function getEpicRalphProvider(
  projects: Array<ProjectBase & { epics?: Epic[] }>,
  epicId: string
): RalphAutonomousUiLaunchProvider {
  const project = projects.find((candidate) => candidate.epics?.some((epic) => epic.id === epicId));
  return getDefaultRalphAutonomousProviderForWorkingMethod(project?.workingMethod);
}

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const navigate = useNavigate();
  const { projects, refetch: refetchProjects } = useProjects();
  // Enhanced projects with AI activity for ProjectsPanel
  const { projects: projectsWithAI, activeSessions } = useProjectsWithAIActivity();
  // Settings for Ralph launch
  const { settings } = useSettings();
  // Ralph launch mutation
  const launchRalphMutation = useLaunchRalphForEpic();

  // Use consolidated hooks
  const {
    modal,
    openNewTicket,
    openProject,
    openEpic,
    openSettings,
    openShortcuts,
    openFeedback,
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
  const [ticketRefreshKey, setTicketRefreshKey] = useState(0);
  const [selectedTicketIdFromSearch, setSelectedTicketIdFromSearch] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProjectsPanelOpen, setIsProjectsPanelOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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
    setDeleteEpicPreview({});

    // Fetch dry-run preview - don't allow deletion without preview
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
      setDeleteEpicError(
        error instanceof Error
          ? `Could not load preview: ${error.message}`
          : "Failed to load deletion preview. Please try again."
      );
      // Don't show modal without preview - close it
      setEpicToDelete(null);
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

  // Mobile menu handlers
  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  // Projects panel handlers
  const openProjectsPanel = useCallback(() => {
    setIsProjectsPanelOpen(true);
  }, []);

  const closeProjectsPanel = useCallback(() => {
    setIsProjectsPanelOpen(false);
  }, []);

  // Focus search input callback for keyboard shortcut
  const handleFocusSearch = useCallback(() => {
    const searchInput = document.querySelector(
      'input[placeholder="Search tickets..."]'
    ) as HTMLInputElement;
    searchInput?.focus();
  }, []);

  // Navigation callbacks for keyboard shortcuts (1-5)
  const createNavigationHandler = useCallback(
    (to: string) => () => {
      navigate({ to }).catch((err) => {
        console.error(`Navigation to ${to} failed:`, err);
      });
    },
    [navigate]
  );

  const handleNavigateHome = useMemo(() => createNavigationHandler("/"), [createNavigationHandler]);
  const handleNavigateDashboard = useMemo(
    () => createNavigationHandler("/dashboard"),
    [createNavigationHandler]
  );
  const handleNavigateBoard = useMemo(
    () => createNavigationHandler("/board"),
    [createNavigationHandler]
  );
  const handleNavigateList = useMemo(
    () => createNavigationHandler("/list"),
    [createNavigationHandler]
  );

  const handleToggleProjects = useCallback(() => {
    // On mobile, toggle the mobile menu (which shows projects)
    // On desktop, toggle the projects panel
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen((prev) => !prev);
    } else {
      setIsProjectsPanelOpen((prev) => !prev);
    }
  }, []);

  // Global keyboard shortcuts using the extracted hook
  useKeyboardShortcuts({
    onNewTicket: openNewTicket,
    onRefresh: refreshAllData,
    onFocusSearch: handleFocusSearch,
    onShowShortcuts: openShortcuts,
    onCloseModal: closeModal,
    onNavigateHome: handleNavigateHome,
    onNavigateDashboard: handleNavigateDashboard,
    onNavigateBoard: handleNavigateBoard,
    onNavigateList: handleNavigateList,
    onToggleProjects: handleToggleProjects,
    onOpenSettings: openSettings,
    disabled: isAnyModalOpen,
    isRefreshing,
  });

  const appFiltersState: AppFiltersState = useMemo(
    () => ({
      filters,
      setProjectId,
      setEpicId,
      toggleTag,
      clearTagFilters: clearTags,
      clearAllFilters: clearAll,
    }),
    [filters, setProjectId, setEpicId, toggleTag, clearTags, clearAll]
  );

  const appModalActionsState: AppModalActionsState = useMemo(
    () => ({
      openNewTicketModal: openNewTicket,
      openProjectModal: openProject,
      openEpicModal: openEpic,
      openSettingsModal: openSettings,
      openFeedbackModal: openFeedback,
      closeModal,
    }),
    [openNewTicket, openProject, openEpic, openSettings, openFeedback, closeModal]
  );

  const appRefreshState: AppRefreshState = useMemo(
    () => ({
      ticketRefreshKey,
      refreshAllData,
      isRefreshing,
    }),
    [ticketRefreshKey, refreshAllData, isRefreshing]
  );

  const appSearchNavigationState: AppSearchNavigationState = useMemo(
    () => ({
      selectedTicketIdFromSearch,
      onSelectTicketFromSearch,
      clearSelectedTicketFromSearch,
    }),
    [selectedTicketIdFromSearch, onSelectTicketFromSearch, clearSelectedTicketFromSearch]
  );

  const appSampleDataState: AppSampleDataState = useMemo(
    () => ({
      hasSampleData,
      isDeletingSampleData,
      deleteSampleData,
    }),
    [hasSampleData, isDeletingSampleData, deleteSampleData]
  );

  const appEpicDeletionState: AppEpicDeletionState = useMemo(
    () => ({
      onDeleteEpic: handleDeleteEpicClick,
    }),
    [handleDeleteEpicClick]
  );

  const appMobileMenuState: AppMobileMenuState = useMemo(
    () => ({
      isMobileMenuOpen,
      openMobileMenu,
      closeMobileMenu,
    }),
    [isMobileMenuOpen, openMobileMenu, closeMobileMenu]
  );

  const appProjectsPanelState: AppProjectsPanelState = useMemo(
    () => ({
      isProjectsPanelOpen,
      openProjectsPanel,
      closeProjectsPanel,
    }),
    [isProjectsPanelOpen, openProjectsPanel, closeProjectsPanel]
  );

  // Handler for IconSidebar actions
  const handleSidebarAction = useCallback(
    (action: "openProjectsPanel" | "openSettings") => {
      if (action === "openProjectsPanel") {
        openProjectsPanel();
      } else if (action === "openSettings") {
        openSettings();
      }
    },
    [openProjectsPanel, openSettings]
  );

  // Handler for project selection from ProjectsPanel
  const handleProjectSelect = useCallback(
    (projectId: string | null) => {
      setProjectId(projectId);
      // Don't close panel - let user close manually or click outside
    },
    [setProjectId]
  );

  // Handler for project edit from ProjectsPanel
  const handleProjectEdit = useCallback(
    (project: { id: string; name: string; path: string; color: string | null }) => {
      // Find the full project from our projects list to get all fields
      const fullProject = projects.find((p) => p.id === project.id);
      if (fullProject) {
        openProject(fullProject);
      }
      closeProjectsPanel();
    },
    [projects, openProject, closeProjectsPanel]
  );

  // Handler for add project from ProjectsPanel
  const handleAddProjectFromPanel = useCallback(() => {
    openProject();
    closeProjectsPanel();
  }, [openProject, closeProjectsPanel]);

  // Handler for epic selection from ProjectsPanel
  const handleEpicSelectFromPanel = useCallback(
    (epicId: string | null, projectId: string) => {
      setEpicId(epicId, projectId);
      closeProjectsPanel();
    },
    [setEpicId, closeProjectsPanel]
  );

  // Handler for add epic from ProjectsPanel
  const handleAddEpicFromPanel = useCallback(
    (projectId: string) => {
      openEpic(projectId);
      closeProjectsPanel();
    },
    [openEpic, closeProjectsPanel]
  );

  // Handler for edit epic from ProjectsPanel
  const handleEditEpicFromPanel = useCallback(
    (projectId: string, epic: Epic) => {
      openEpic(projectId, epic);
      closeProjectsPanel();
    },
    [openEpic, closeProjectsPanel]
  );

  // Handler for launching Ralph for an epic from ProjectsPanel
  const handleLaunchRalphForEpic = useCallback(
    async (epicId: string) => {
      try {
        const result = await dispatchRalphAutonomousUiLaunch(
          getEpicRalphProvider(projects, epicId),
          {
            kind: "epic",
            epicId,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: settings?.ralphSandbox ?? false,
          },
          {
            ...defaultRalphLaunchDependencies,
            launchTicketRalph: async () => ({
              success: false,
              message: "Ticket Ralph launch is not available from the projects panel.",
            }),
            launchEpicRalph: (payload) => launchRalphMutation.mutateAsync(payload),
          }
        );

        result.warnings?.forEach((warning) => showToast("info", warning));
        showToast(result.success ? "success" : "error", result.message);
        closeProjectsPanel();
      } catch (err) {
        showToast(
          "error",
          `Failed to launch Ralph: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    },
    [launchRalphMutation, projects, settings, closeProjectsPanel, showToast]
  );

  // Epic ticket counts - currently not computed to avoid showing misleading "0"
  // badges. The badge only shows when count is defined, so an empty Map
  // effectively hides the badge until we implement proper counting.
  // Future: Add a lightweight endpoint to get epic ticket counts without
  // fetching full ticket data.
  const epicTicketCounts = useMemo(() => new Map<string, number>(), []);

  // Compute which epics have active AI sessions
  // Note: This currently checks by epic ID in sessions - in a real implementation
  // we'd need to check if any tickets within the epic have active sessions
  const epicsWithActiveAI = useMemo(() => {
    const epicIds = new Set<string>();
    // For each project, check if any of its epics' tickets have active sessions
    // Currently a simplified implementation that checks if the epic ID matches
    for (const project of projects) {
      for (const epic of project.epics) {
        // Check if any session's ticketId belongs to this epic
        // For now, this is a placeholder - proper implementation would
        // need a ticket-to-epic lookup
        if (activeSessions[epic.id]) {
          epicIds.add(epic.id);
        }
      }
    }
    return epicIds;
  }, [projects, activeSessions]);

  return (
    <AppFiltersContext.Provider value={appFiltersState}>
      <AppModalActionsContext.Provider value={appModalActionsState}>
        <AppRefreshContext.Provider value={appRefreshState}>
          <AppSearchNavigationContext.Provider value={appSearchNavigationState}>
            <AppSampleDataContext.Provider value={appSampleDataState}>
              <AppEpicDeletionContext.Provider value={appEpicDeletionState}>
                <AppMobileMenuContext.Provider value={appMobileMenuState}>
                  <AppProjectsPanelContext.Provider value={appProjectsPanelState}>
                    {/* Desktop: grid with IconSidebar (64px) | Mobile: single column */}
                    <div className="h-screen grid grid-cols-1 md:grid-cols-[64px_1fr] text-[var(--text-primary)]">
                      {/* Desktop IconSidebar - hidden on mobile, z-30 so tooltips render above main content */}
                      <div className="hidden md:block relative z-30">
                        <IconSidebar onAction={handleSidebarAction} />
                      </div>

                      {/* Projects Panel - slide-out panel (desktop only) */}
                      <ProjectsPanel
                        isOpen={isProjectsPanelOpen}
                        onClose={closeProjectsPanel}
                        projects={projectsWithAI}
                        selectedProjectId={filters.projectId}
                        selectedEpicId={filters.epicId}
                        onSelectProject={handleProjectSelect}
                        onSelectEpic={handleEpicSelectFromPanel}
                        onAddProject={handleAddProjectFromPanel}
                        onEditProject={handleProjectEdit}
                        onAddEpic={handleAddEpicFromPanel}
                        onEditEpic={handleEditEpicFromPanel}
                        onLaunchRalphForEpic={handleLaunchRalphForEpic}
                        onImport={() => {
                          closeProjectsPanel();
                          setIsImportModalOpen(true);
                        }}
                        epicTicketCounts={epicTicketCounts}
                        epicsWithActiveAI={epicsWithActiveAI}
                      />

                      {/* Mobile sidebar overlay */}
                      {isMobileMenuOpen && (
                        <div className="fixed inset-0 z-50 md:hidden">
                          {/* Backdrop */}
                          <div
                            className="absolute inset-0 bg-black/60"
                            onClick={closeMobileMenu}
                            aria-hidden="true"
                          />
                          {/* Slide-out menu */}
                          <div
                            className="absolute top-0 left-0 bottom-0 w-[280px] bg-[var(--bg-secondary)] shadow-xl transform transition-transform duration-200 ease-out animate-slide-in-left"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Mobile navigation menu"
                          >
                            <Sidebar
                              onItemClick={closeMobileMenu}
                              activeSessions={activeSessions}
                            />
                          </div>
                        </div>
                      )}

                      {/* Main content area - takes remaining space */}
                      <div className="flex flex-col min-w-0 overflow-hidden">
                        {/* Header */}
                        <AppHeader />

                        {/* Content */}
                        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto p-6">
                          {children}
                        </main>
                      </div>

                      <Suspense fallback={<ModalFallback />}>
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
                        {modal.type === "settings" && <SettingsModal onClose={closeModal} />}

                        {/* Keyboard Shortcuts Help Modal */}
                        {modal.type === "shortcuts" && (
                          <ShortcutsModal isOpen={true} onClose={closeModal} />
                        )}

                        {/* Feedback Modal */}
                        {modal.type === "feedback" && <FeedbackModal onClose={closeModal} />}

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

                        {/* Import Modal */}
                        {isImportModalOpen && (
                          <ImportModal isOpen={true} onClose={() => setIsImportModalOpen(false)} />
                        )}
                      </Suspense>
                    </div>
                  </AppProjectsPanelContext.Provider>
                </AppMobileMenuContext.Provider>
              </AppEpicDeletionContext.Provider>
            </AppSampleDataContext.Provider>
          </AppSearchNavigationContext.Provider>
        </AppRefreshContext.Provider>
      </AppModalActionsContext.Provider>
    </AppFiltersContext.Provider>
  );
}

function AppHeader() {
  const navigate = useNavigate();
  const routerState = useRouterState({ select: (s) => s.location });
  const pathname = routerState.pathname;
  const isProjectPage = pathname === "/" || pathname.startsWith("/projects/");
  const isListView = pathname === "/list";
  const { filters } = useAppFilters();
  const { openNewTicketModal, openSettingsModal, openFeedbackModal } = useAppModalActions();
  const { onSelectTicketFromSearch } = useAppSearchNavigation();
  const { refreshAllData, isRefreshing } = useAppRefresh();
  const { openMobileMenu } = useAppMobileMenu();
  const handleSearchResultSelect = useCallback(
    (result: SearchResult) => {
      onSelectTicketFromSearch(result.id);
    },
    [onSelectTicketFromSearch]
  );

  // Inception modal state
  const [isInceptionModalOpen, setIsInceptionModalOpen] = useState(false);

  if (isProjectPage) return null;

  return (
    <header className="h-14 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)] flex items-center px-4 gap-4">
      {/* Mobile hamburger menu button - only visible on mobile */}
      <button
        onClick={openMobileMenu}
        className="md:hidden p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <SearchBar projectId={filters.projectId} onResultSelect={handleSearchResultSelect} />
      </div>

      {/* View toggle */}
      <div
        className="flex items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg p-1"
        role="group"
        aria-label="View mode"
      >
        <button
          onClick={() => {
            const search: Record<string, string | undefined> = {};
            if (filters.projectId) search.project = filters.projectId;
            if (filters.epicId) search.epic = filters.epicId;
            if (filters.tags.length > 0) search.tags = filters.tags.join(",");
            void navigate({ to: "/board", search });
          }}
          className={`p-2 rounded-md transition-colors ${
            !isListView
              ? "bg-[var(--bg-hover)] text-[var(--accent-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          }`}
          aria-label="Kanban view"
          aria-pressed={!isListView}
        >
          <LayoutGrid size={18} aria-hidden="true" />
        </button>
        <button
          onClick={() => {
            const search: Record<string, string | undefined> = {};
            if (filters.projectId) search.project = filters.projectId;
            if (filters.epicId) search.epic = filters.epicId;
            if (filters.tags.length > 0) search.tags = filters.tags.join(",");
            void navigate({ to: "/list", search });
          }}
          className={`p-2 rounded-md transition-colors ${
            isListView
              ? "bg-[var(--bg-hover)] text-[var(--accent-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          }`}
          aria-label="List view"
          aria-pressed={isListView}
        >
          <List size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Refresh button */}
      <button
        onClick={() => void refreshAllData()}
        disabled={isRefreshing}
        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors disabled:opacity-50"
        aria-label="Refresh data (r)"
      >
        <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} aria-hidden="true" />
      </button>

      {/* Feedback button */}
      <button
        onClick={openFeedbackModal}
        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
        aria-label="Send feedback"
      >
        <MessageSquareWarning size={18} aria-hidden="true" />
      </button>

      {/* Settings button */}
      <button
        onClick={openSettingsModal}
        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
        aria-label="Settings"
      >
        <Settings size={18} aria-hidden="true" />
      </button>

      {/* New ticket dropdown */}
      <NewTicketDropdown
        onNewTicket={openNewTicketModal}
        onStartFromScratch={() => setIsInceptionModalOpen(true)}
      />

      {/* Inception Modal */}
      {isInceptionModalOpen && (
        <Suspense fallback={<ModalFallback />}>
          <InceptionModal
            isOpen={true}
            onClose={() => setIsInceptionModalOpen(false)}
            onSkipAI={openNewTicketModal}
          />
        </Suspense>
      )}
    </header>
  );
}

interface SidebarProps {
  /** Optional callback when a navigation item is clicked (for mobile menu close) */
  onItemClick?: () => void;
  activeSessions: Record<string, ActiveRalphSession>;
}

function Sidebar({ onItemClick, activeSessions }: SidebarProps) {
  const { projects, loading, error } = useProjects();
  const { filters, setProjectId, setEpicId, toggleTag, clearTagFilters } = useAppFilters();
  const { openProjectModal, openEpicModal } = useAppModalActions();
  const { hasSampleData, isDeletingSampleData, deleteSampleData } = useAppSampleData();
  const { onDeleteEpic } = useAppEpicDeletion();

  const { settings } = useSettings();
  const launchRalphMutation = useLaunchRalphForEpic();
  const { showToast } = useToast();

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

  // Build set of project IDs with active Ralph (AI) sessions
  const projectsWithActiveAI = useMemo(() => {
    const projectIds = new Set<string>();
    for (const session of Object.values(activeSessions)) {
      projectIds.add(session.projectId);
    }
    return projectIds;
  }, [activeSessions]);

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
    onItemClick?.();
  };

  const handleSelectEpic = (epicId: string | null, projectId: string) => {
    // When selecting an epic, also set the project context
    setEpicId(epicId, projectId);
    onItemClick?.();
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

  // Handler for launching Ralph for an epic from sidebar
  const handleLaunchRalphForEpic = useCallback(
    async (epicId: string) => {
      try {
        const result = await dispatchRalphAutonomousUiLaunch(
          getEpicRalphProvider(projects, epicId),
          {
            kind: "epic",
            epicId,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: settings?.ralphSandbox ?? false,
          },
          {
            ...defaultRalphLaunchDependencies,
            launchTicketRalph: async () => ({
              success: false,
              message: "Ticket Ralph launch is not available from the sidebar.",
            }),
            launchEpicRalph: (payload) => launchRalphMutation.mutateAsync(payload),
          }
        );

        result.warnings?.forEach((warning) => showToast("info", warning));
        showToast(result.success ? "success" : "error", result.message);
        onItemClick?.();
      } catch (err) {
        showToast(
          "error",
          `Failed to launch Ralph: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    },
    [launchRalphMutation, projects, settings, onItemClick, showToast]
  );

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-primary)",
      }}
    >
      {/* Logo/Title */}
      <div className="h-14 flex items-center px-4 border-b border-[var(--border-primary)]">
        <h1 className="text-3xl">🧠 💩</h1>
      </div>

      {/* Project tree */}
      <nav className="flex-1 p-4 overflow-y-auto">
        {loading ? (
          <div className="text-sm text-[var(--text-muted)] py-4 text-center">Loading...</div>
        ) : error ? (
          <div className="text-sm text-red-400 py-4 text-center">{error}</div>
        ) : (
          <ProjectTree
            projects={projects}
            selectedProjectId={filters.projectId}
            selectedEpicId={filters.epicId}
            projectsWithDockerContainers={projectsWithDockerContainers}
            projectsWithActiveAI={projectsWithActiveAI}
            onDockerIndicatorClick={setDockerLogsProjectId}
            onSelectProject={handleSelectProject}
            onSelectEpic={handleSelectEpic}
            onAddProject={handleAddProject}
            onAddEpic={handleAddEpic}
            onEditProject={handleEditProject}
            onEditEpic={handleEditEpic}
            onDeleteEpic={onDeleteEpic}
            onLaunchRalphForEpic={handleLaunchRalphForEpic}
          />
        )}

        {/* Tag filters */}
        {availableTags.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                Tags
              </h2>
              {filters.tags.length > 0 && (
                <button
                  onClick={clearTagFilters}
                  className="text-xs text-[var(--accent-ai)] hover:text-[var(--accent-primary)]"
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
                        ? "bg-[var(--accent-primary)] text-white"
                        : "bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
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
        <div className="px-4 py-3 border-t border-[var(--border-primary)] bg-[color-mix(in_srgb,var(--warning)_10%,transparent)]">
          <p className="text-xs text-[var(--warning)] mb-2">
            Sample data is loaded. Delete it to start fresh.
          </p>
          <button
            onClick={() => void deleteSampleData()}
            disabled={isDeletingSampleData}
            className="w-full text-xs px-3 py-1.5 bg-[color-mix(in_srgb,var(--error)_20%,transparent)] hover:bg-[color-mix(in_srgb,var(--error)_30%,transparent)] disabled:bg-[var(--bg-hover)] text-[var(--error)] rounded transition-colors"
          >
            {isDeletingSampleData ? "Deleting..." : "Delete Sample Data"}
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border-primary)]">
        <p className="text-xs text-[var(--text-muted)] text-center">Brain Dump v0.1.0</p>
      </div>

      {/* Container Logs Modal for Docker indicator click */}
      {dockerLogsProjectId !== null && (
        <Suspense fallback={<ModalFallback />}>
          <ContainerLogsModal
            isOpen={true}
            onClose={() => setDockerLogsProjectId(null)}
            containerName={dockerLogsContainerName}
          />
        </Suspense>
      )}
    </aside>
  );
}
