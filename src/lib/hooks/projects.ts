/**
 * Project and Epic TanStack Query hooks.
 * Includes queries and mutations for project/epic CRUD operations with optimistic updates.
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProjects, createProject, updateProject, deleteProject } from "../../api/projects";
import { getEpicsByProject, createEpic, updateEpic, deleteEpic } from "../../api/epics";
import { createBrowserLogger } from "../browser-logger";
import { queryKeys } from "../query-keys";
import { useActiveRalphSessions, type ActiveRalphSession } from "./ralph";

// Browser-safe logger for hook errors
const logger = createBrowserLogger("hooks:projects");

// =============================================================================
// TYPES
// =============================================================================

export interface Epic {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  color: string | null;
  createdAt: string;
}

/** Base project properties used for editing (without createdAt) */
export interface ProjectBase {
  id: string;
  name: string;
  path: string;
  color: string | null;
  workingMethod: string | null;
}

/** Full project type including createdAt */
export interface Project extends ProjectBase {
  createdAt: string;
}

export interface ProjectWithEpics extends Project {
  epics: Epic[];
}

/**
 * Project type with AI activity indicator.
 * Used by ProjectsPanel and navigation components to show glow effects.
 */
export interface ProjectWithAIActivity extends ProjectWithEpics {
  /** Whether this project has any active Ralph sessions */
  hasActiveAI: boolean;
  /** Number of active sessions in this project */
  activeSessionCount: number;
}

// =============================================================================
// PROJECT QUERIES
// =============================================================================

// Hook for fetching projects with their epics
export function useProjects() {
  const query = useQuery({
    queryKey: queryKeys.projectsWithEpics,
    queryFn: async () => {
      // Fetch all projects
      const projectList = await getProjects();

      // Fetch epics for each project
      const projectsWithEpics: ProjectWithEpics[] = await Promise.all(
        projectList.map(async (project: (typeof projectList)[0]) => {
          const epics = await getEpicsByProject({ data: project.id });
          return { ...project, epics };
        })
      );

      return projectsWithEpics;
    },
    // Always stale - projects can be created via MCP externally
    staleTime: 0,
  });

  return {
    projects: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching projects with AI activity indicators.
 * Combines projects data with active Ralph session data to determine
 * which projects have active AI work for glow effects.
 *
 * This enables the sidebar to show a pulsing glow indicator on projects
 * where Ralph is currently working on tickets.
 *
 * @returns Projects enhanced with hasActiveAI and activeSessionCount
 */
export function useProjectsWithAIActivity() {
  const { projects, loading, error, refetch } = useProjects();
  const { sessions } = useActiveRalphSessions();

  // Compute which projects have active AI sessions
  const projectsWithActivity = useMemo<ProjectWithAIActivity[]>(() => {
    // Count sessions per project
    const sessionCountByProject = new Map<string, number>();
    for (const session of Object.values(sessions)) {
      const count = sessionCountByProject.get(session.projectId) ?? 0;
      sessionCountByProject.set(session.projectId, count + 1);
    }

    return projects.map((project) => {
      const activeSessionCount = sessionCountByProject.get(project.id) ?? 0;
      return {
        ...project,
        hasActiveAI: activeSessionCount > 0,
        activeSessionCount,
      };
    });
  }, [projects, sessions]);

  return {
    projects: projectsWithActivity,
    loading,
    error,
    refetch,
  };
}

// =============================================================================
// PROJECT MUTATIONS
// =============================================================================

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; path: string; color?: string }) => createProject({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      updates: {
        name?: string;
        path?: string;
        color?: string;
        workingMethod?: "auto" | "claude-code" | "vscode" | "opencode";
      };
    }) => updateProject({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { projectId: string; confirm?: boolean }) =>
      deleteProject({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

/**
 * Hook for fetching project delete preview (dry-run).
 * @param projectId - The project ID to preview deletion for
 */
export function useProjectDeletePreview(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId, "delete-preview"] as const,
    queryFn: () => deleteProject({ data: { projectId, confirm: false } }),
  });
}

// =============================================================================
// EPIC MUTATIONS
// =============================================================================

export function useCreateEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title: string;
      projectId: string;
      description?: string;
      color?: string;
    }) => createEpic({ data }),
    onMutate: async (newEpicData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.projectsWithEpics });

      // Snapshot previous projects data
      const previousProjects = queryClient.getQueryData<ProjectWithEpics[]>(
        queryKeys.projectsWithEpics
      );

      // Optimistically add epic to the target project
      if (previousProjects) {
        const optimisticEpic: Epic = {
          id: `temp-${Date.now()}`,
          title: newEpicData.title,
          description: newEpicData.description ?? null,
          projectId: newEpicData.projectId,
          color: newEpicData.color ?? null,
          createdAt: new Date().toISOString(),
        };

        queryClient.setQueryData<ProjectWithEpics[]>(
          queryKeys.projectsWithEpics,
          previousProjects.map((project) =>
            project.id === newEpicData.projectId
              ? { ...project, epics: [...project.epics, optimisticEpic] }
              : project
          )
        );
      }

      return { previousProjects };
    },
    onError: (err, newEpic, context) => {
      // Note: Components using this hook should show user-facing error notifications
      // Log error with context for debugging
      logger.error(
        `Failed to create epic: title="${newEpic.title}", projectId="${newEpic.projectId}"`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projectsWithEpics, context.previousProjects);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useUpdateEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      id: string;
      updates: { title?: string; description?: string; color?: string };
    }) => updateEpic({ data }),
    onMutate: async ({ id, updates }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.projectsWithEpics });

      // Snapshot previous projects data
      const previousProjects = queryClient.getQueryData<ProjectWithEpics[]>(
        queryKeys.projectsWithEpics
      );

      // Optimistically update the epic in its project
      if (previousProjects) {
        queryClient.setQueryData<ProjectWithEpics[]>(
          queryKeys.projectsWithEpics,
          previousProjects.map((project) => ({
            ...project,
            epics: project.epics.map((epic) =>
              epic.id === id
                ? {
                    ...epic,
                    title: updates.title ?? epic.title,
                    description:
                      updates.description !== undefined ? updates.description : epic.description,
                    color: updates.color !== undefined ? updates.color : epic.color,
                  }
                : epic
            ),
          }))
        );
      }

      return { previousProjects };
    },
    onError: (err, variables, context) => {
      // Note: Components using this hook should show user-facing error notifications
      // Log error with context for debugging
      logger.error(
        `Failed to update epic: id="${variables.id}", updates=${JSON.stringify(variables.updates)}`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projectsWithEpics, context.previousProjects);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { epicId: string; confirm?: boolean }) => deleteEpic({ data: params }),
    onMutate: async ({ epicId, confirm }) => {
      // Only optimistically update on confirmed deletes, not dry-runs
      if (!confirm) return {};

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.projectsWithEpics });

      // Snapshot previous projects data
      const previousProjects = queryClient.getQueryData<ProjectWithEpics[]>(
        queryKeys.projectsWithEpics
      );

      // Optimistically remove the epic from its project
      if (previousProjects) {
        queryClient.setQueryData<ProjectWithEpics[]>(
          queryKeys.projectsWithEpics,
          previousProjects.map((project) => ({
            ...project,
            epics: project.epics.filter((epic) => epic.id !== epicId),
          }))
        );
      }

      return { previousProjects };
    },
    onError: (err, variables, context) => {
      // Note: Components using this hook should show user-facing error notifications
      // Log error with context for debugging
      logger.error(
        `Failed to delete epic: epicId="${variables.epicId}"`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback on error
      if (context?.previousProjects) {
        queryClient.setQueryData(queryKeys.projectsWithEpics, context.previousProjects);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

// Re-export ActiveRalphSession for backward compatibility
export type { ActiveRalphSession };
