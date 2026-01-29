import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Container,
  Bot,
} from "lucide-react";
import { type Epic, type ProjectBase, type ProjectWithEpics } from "../lib/hooks";

interface ProjectTreeProps {
  projects: ProjectWithEpics[];
  selectedProjectId: string | null;
  selectedEpicId: string | null;
  /** Set of project IDs that have running Docker containers */
  projectsWithDockerContainers?: Set<string>;
  /** Set of project IDs with active Ralph (AI) sessions */
  projectsWithActiveAI?: Set<string>;
  /** Callback when Docker indicator is clicked */
  onDockerIndicatorClick?: (projectId: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectEpic: (epicId: string | null, projectId: string) => void;
  onAddProject: () => void;
  onAddEpic: (projectId: string) => void;
  onEditProject?: (project: ProjectBase) => void;
  onEditEpic?: (projectId: string, epic: Epic) => void;
  onDeleteEpic?: (epic: Epic) => void;
  /** Handler to launch Ralph for an epic */
  onLaunchRalphForEpic?: (epicId: string) => void;
}

export default function ProjectTree({
  projects,
  selectedProjectId,
  selectedEpicId,
  projectsWithDockerContainers,
  projectsWithActiveAI,
  onDockerIndicatorClick,
  onSelectProject,
  onSelectEpic,
  onAddProject,
  onAddEpic,
  onEditProject,
  onEditEpic,
  onDeleteEpic,
  onLaunchRalphForEpic,
}: ProjectTreeProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleProjectClick = (projectId: string) => {
    if (selectedProjectId === projectId) {
      onSelectProject(null);
    } else {
      onSelectProject(projectId);
    }
  };

  const handleEpicClick = (epicId: string, projectId: string) => {
    if (selectedEpicId === epicId) {
      onSelectEpic(null, projectId);
    } else {
      onSelectEpic(epicId, projectId);
    }
  };

  return (
    <div className="space-y-1">
      {/* Header with add button */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
          Projects
        </h2>
        <button
          onClick={onAddProject}
          className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Add project"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="text-sm text-[var(--text-muted)] py-4 text-center">No projects yet</div>
      )}

      {/* Project list */}
      {projects.map((project) => {
        const isExpanded = expandedProjects.has(project.id);
        const isSelected = selectedProjectId === project.id && !selectedEpicId;
        const hasDockerContainer = projectsWithDockerContainers?.has(project.id);
        const hasActiveAI = projectsWithActiveAI?.has(project.id);

        return (
          <div key={project.id}>
            {/* Project row */}
            <div
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group transition-all ${
                isSelected
                  ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                  : "hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
              } ${hasActiveAI ? "shadow-[0_0_8px_var(--accent-ai)] ring-1 ring-[var(--accent-ai)]/30" : ""}`}
            >
              {/* Expand/collapse button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleProject(project.id);
                }}
                className="p-0.5 hover:bg-[var(--bg-hover)] rounded"
                aria-label={isExpanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
                aria-expanded={isExpanded}
              >
                {isExpanded ? (
                  <ChevronDown
                    size={14}
                    className="text-[var(--text-secondary)]"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronRight
                    size={14}
                    className="text-[var(--text-secondary)]"
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* Project icon and name */}
              <div
                className="flex-1 flex items-center gap-2 min-w-0"
                onClick={() => handleProjectClick(project.id)}
              >
                {isExpanded ? (
                  <FolderOpen
                    size={16}
                    style={{ color: project.color ?? undefined }}
                    className={project.color ? "" : "text-[var(--text-secondary)]"}
                  />
                ) : (
                  <Folder
                    size={16}
                    style={{ color: project.color ?? undefined }}
                    className={project.color ? "" : "text-[var(--text-secondary)]"}
                  />
                )}
                <span className="text-sm truncate">{project.name}</span>
              </div>

              {/* AI activity indicator (always visible when active) */}
              {hasActiveAI && !hasDockerContainer && (
                <span
                  className="p-0.5 text-[var(--accent-ai)]"
                  title="Ralph is active on this project"
                  aria-label="AI is active"
                >
                  <Bot size={14} className="animate-pulse" aria-hidden="true" />
                </span>
              )}

              {/* Docker container indicator (always visible when running) */}
              {hasDockerContainer && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDockerIndicatorClick?.(project.id);
                  }}
                  className="p-0.5 hover:bg-[var(--accent-ai)]/10 rounded transition-colors"
                  title="Ralph running in Docker - click to view logs"
                  aria-label="Docker container running"
                >
                  <Container size={14} className="text-[var(--accent-ai)] animate-pulse" />
                </button>
              )}

              {/* Edit project button (visible on hover) */}
              {onEditProject && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditProject({
                      id: project.id,
                      name: project.name,
                      path: project.path,
                      color: project.color,
                      workingMethod: project.workingMethod,
                    });
                  }}
                  className="p-0.5 hover:bg-[var(--bg-hover)] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Edit project ${project.name}`}
                >
                  <Pencil size={12} className="text-[var(--text-secondary)]" aria-hidden="true" />
                </button>
              )}

              {/* Add epic button (visible on hover) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddEpic(project.id);
                }}
                className="p-0.5 hover:bg-[var(--bg-hover)] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Add epic to ${project.name}`}
              >
                <Plus size={12} className="text-[var(--text-secondary)]" aria-hidden="true" />
              </button>
            </div>

            {/* Epics list */}
            {isExpanded && project.epics.length > 0 && (
              <div className="ml-4 mt-1 space-y-0.5">
                {project.epics.map((epic) => {
                  const isEpicSelected = selectedEpicId === epic.id;

                  return (
                    <div
                      key={epic.id}
                      onClick={() => handleEpicClick(epic.id, project.id)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer group/epic ${
                        isEpicSelected
                          ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                          : "hover:bg-[var(--bg-hover)] text-[var(--text-primary)]"
                      }`}
                    >
                      <Layers
                        size={14}
                        style={{ color: epic.color ?? undefined }}
                        className={epic.color ? "" : "text-[var(--text-secondary)]"}
                      />
                      <span className="flex-1 text-sm truncate">{epic.title}</span>
                      {onLaunchRalphForEpic && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onLaunchRalphForEpic(epic.id);
                          }}
                          className="p-0.5 hover:bg-[var(--accent-ai)]/10 rounded opacity-0 group-hover/epic:opacity-100 transition-opacity"
                          aria-label={`Launch Ralph for ${epic.title}`}
                          title="Launch Ralph"
                        >
                          <Bot size={10} className="text-[var(--accent-ai)]" aria-hidden="true" />
                        </button>
                      )}
                      {onEditEpic && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditEpic(project.id, epic);
                          }}
                          className="p-0.5 hover:bg-[var(--bg-hover)] rounded opacity-0 group-hover/epic:opacity-100 transition-opacity"
                          aria-label={`Edit epic ${epic.title}`}
                        >
                          <Pencil
                            size={10}
                            className="text-[var(--text-secondary)]"
                            aria-hidden="true"
                          />
                        </button>
                      )}
                      {onDeleteEpic && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEpic(epic);
                          }}
                          className="p-0.5 hover:bg-red-900/50 rounded opacity-0 group-hover/epic:opacity-100 transition-opacity"
                          aria-label={`Delete epic ${epic.title}`}
                        >
                          <Trash2 size={10} className="text-red-400" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty epics state */}
            {isExpanded && project.epics.length === 0 && (
              <div className="ml-6 py-2 text-xs text-[var(--text-muted)]">No epics yet</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
