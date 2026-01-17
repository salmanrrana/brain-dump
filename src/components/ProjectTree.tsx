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
} from "lucide-react";
import { type Epic, type ProjectBase, type ProjectWithEpics } from "../lib/hooks";

interface ProjectTreeProps {
  projects: ProjectWithEpics[];
  selectedProjectId: string | null;
  selectedEpicId: string | null;
  /** Set of project IDs that have running Docker containers */
  projectsWithDockerContainers?: Set<string>;
  /** Callback when Docker indicator is clicked */
  onDockerIndicatorClick?: (projectId: string) => void;
  onSelectProject: (projectId: string | null) => void;
  onSelectEpic: (epicId: string | null, projectId: string) => void;
  onAddProject: () => void;
  onAddEpic: (projectId: string) => void;
  onEditProject?: (project: ProjectBase) => void;
  onEditEpic?: (projectId: string, epic: Epic) => void;
  onDeleteEpic?: (epic: Epic) => void;
}

export default function ProjectTree({
  projects,
  selectedProjectId,
  selectedEpicId,
  projectsWithDockerContainers,
  onDockerIndicatorClick,
  onSelectProject,
  onSelectEpic,
  onAddProject,
  onAddEpic,
  onEditProject,
  onEditEpic,
  onDeleteEpic,
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
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Projects</h2>
        <button
          onClick={onAddProject}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-gray-100 transition-colors"
          title="Add project"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Empty state */}
      {projects.length === 0 && (
        <div className="text-sm text-slate-500 py-4 text-center">No projects yet</div>
      )}

      {/* Project list */}
      {projects.map((project) => {
        const isExpanded = expandedProjects.has(project.id);
        const isSelected = selectedProjectId === project.id && !selectedEpicId;
        const hasDockerContainer = projectsWithDockerContainers?.has(project.id);

        return (
          <div key={project.id}>
            {/* Project row */}
            <div
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group ${
                isSelected ? "bg-cyan-600/20 text-cyan-400" : "hover:bg-slate-800 text-slate-300"
              }`}
            >
              {/* Expand/collapse button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleProject(project.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded"
              >
                {isExpanded ? (
                  <ChevronDown size={14} className="text-slate-400" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400" />
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
                    className={project.color ? "" : "text-slate-400"}
                  />
                ) : (
                  <Folder
                    size={16}
                    style={{ color: project.color ?? undefined }}
                    className={project.color ? "" : "text-slate-400"}
                  />
                )}
                <span className="text-sm truncate">{project.name}</span>
              </div>

              {/* Docker container indicator (always visible when running) */}
              {hasDockerContainer && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDockerIndicatorClick?.(project.id);
                  }}
                  className="p-0.5 hover:bg-cyan-900/50 rounded transition-colors"
                  title="Ralph running in Docker - click to view logs"
                  aria-label="Docker container running"
                >
                  <Container size={14} className="text-cyan-400 animate-pulse" />
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
                  className="p-0.5 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit project"
                >
                  <Pencil size={12} className="text-slate-400" />
                </button>
              )}

              {/* Add epic button (visible on hover) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddEpic(project.id);
                }}
                className="p-0.5 hover:bg-slate-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Add epic"
              >
                <Plus size={12} className="text-slate-400" />
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
                          ? "bg-cyan-600/20 text-cyan-400"
                          : "hover:bg-slate-800 text-slate-300"
                      }`}
                    >
                      <Layers
                        size={14}
                        style={{ color: epic.color ?? undefined }}
                        className={epic.color ? "" : "text-slate-400"}
                      />
                      <span className="flex-1 text-sm truncate">{epic.title}</span>
                      {onEditEpic && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditEpic(project.id, epic);
                          }}
                          className="p-0.5 hover:bg-slate-700 rounded opacity-0 group-hover/epic:opacity-100 transition-opacity"
                          title="Edit epic"
                        >
                          <Pencil size={10} className="text-slate-400" />
                        </button>
                      )}
                      {onDeleteEpic && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEpic(epic);
                          }}
                          className="p-0.5 hover:bg-red-900/50 rounded opacity-0 group-hover/epic:opacity-100 transition-opacity"
                          title="Delete epic"
                        >
                          <Trash2 size={10} className="text-red-400" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Empty epics state */}
            {isExpanded && project.epics.length === 0 && (
              <div className="ml-6 py-2 text-xs text-slate-500">No epics yet</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
