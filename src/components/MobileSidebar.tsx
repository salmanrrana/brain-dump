import { lazy, Suspense, useState, useMemo, useCallback } from "react";
import ProjectTree from "./ProjectTree";
import ContainerStatusSection from "./ContainerStatusSection";
import { useToast } from "./Toast";
import {
  useProjects,
  useTags,
  useDockerAvailable,
  useRalphContainers,
  useLaunchRalphForEpic,
  useSettings,
  type ActiveRalphSession,
  type Epic,
  type ProjectBase,
} from "../lib/hooks";
import {
  useAppEpicDeletion,
  useAppFilters,
  useAppModalActions,
  useAppSampleData,
} from "./AppLayoutContext";
import {
  defaultRalphLaunchDependencies,
  dispatchRalphAutonomousUiLaunch,
} from "../lib/ui-launch-dispatcher";
import { getEpicRalphProvider } from "../lib/epic-ralph-provider";

const ContainerLogsModal = lazy(() => import("./ContainerLogsModal"));

function ModalFallback() {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      Loading dialog...
    </div>
  );
}

export interface MobileSidebarProps {
  /** Optional callback when a navigation item is clicked (for mobile menu close) */
  onItemClick?: () => void;
  activeSessions: Record<string, ActiveRalphSession>;
}

/**
 * MobileSidebar - the slide-out navigation drawer shown only on mobile when the
 * hamburger menu is open. Extracted from AppLayout and lazy-loaded so its heavy
 * dependencies (ProjectTree, ContainerStatusSection with Docker polling) stay
 * out of the initial/main chunk and load only when the menu is opened.
 */
export function MobileSidebar({ onItemClick, activeSessions }: MobileSidebarProps) {
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

export default MobileSidebar;
