import { useCallback, useEffect, useState, useRef, useMemo, type RefObject } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// =============================================================================
// STATE UTILITY HOOKS
// =============================================================================

/**
 * Hook for state that automatically clears after a duration.
 * Useful for notifications, copy confirmations, and other transient UI states.
 *
 * @param duration - Time in ms before auto-clearing (default: 5000ms)
 * @returns Tuple of [value, setValue] where setValue triggers the auto-clear timer
 */
export function useAutoClearState<T>(duration = 5000): [T | null, (value: T | null) => void] {
  const [value, setValue] = useState<T | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setValueWithAutoClear = useCallback(
    (newValue: T | null) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      setValue(newValue);

      // Only set up auto-clear if we're setting a non-null value
      if (newValue !== null) {
        timeoutRef.current = setTimeout(() => {
          setValue(null);
          timeoutRef.current = null;
        }, duration);
      }
    },
    [duration]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [value, setValueWithAutoClear];
}

// =============================================================================
// MODAL UTILITY HOOKS
// =============================================================================

/**
 * Hook for handling modal keyboard interactions (Escape to close, focus trap)
 * @param modalRef - Ref to the modal container element
 * @param onClose - Callback to close the modal
 * @param options - Additional options for customizing behavior
 */
export function useModalKeyboard(
  modalRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: {
    /** Additional condition for escape key (e.g., dropdown open) - return true to prevent close */
    shouldPreventClose?: () => boolean;
    /** Callback when escape is pressed but close is prevented */
    onPreventedClose?: () => void;
    /** Ref to initial focus element (defaults to first focusable) */
    initialFocusRef?: RefObject<HTMLElement | null>;
  } = {}
) {
  const { shouldPreventClose, onPreventedClose, initialFocusRef } = options;

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (shouldPreventClose?.()) {
          onPreventedClose?.();
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, shouldPreventClose, onPreventedClose]);

  // Focus trap and initial focus
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modal.querySelectorAll(focusableSelector);
    const firstElement = focusableElements[0] as HTMLElement | undefined;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement | undefined;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTabKey);

    // Set initial focus
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      firstElement?.focus();
    }

    return () => document.removeEventListener("keydown", handleTabKey);
  }, [modalRef, initialFocusRef]);
}

/**
 * Hook for handling click-outside behavior for dropdowns/menus
 * @param ref - Ref to the container element
 * @param onClickOutside - Callback when clicked outside
 * @param isActive - Whether to listen for clicks (e.g., when dropdown is open)
 * @param excludeRef - Optional ref to exclude from click-outside detection (e.g., a trigger button)
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClickOutside: () => void,
  isActive: boolean = true,
  excludeRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedOutsideMain = ref.current && !ref.current.contains(target);
      const clickedOutsideExclude = !excludeRef?.current || !excludeRef.current.contains(target);

      if (clickedOutsideMain && clickedOutsideExclude) {
        onClickOutside();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ref, onClickOutside, isActive, excludeRef]);
}

// =============================================================================
// APP STATE HOOKS - Consolidated state management
// =============================================================================

/**
 * Modal state type - discriminated union for type-safe modal management
 */
export type ModalState =
  | { type: "none" }
  | { type: "newTicket" }
  | {
      type: "project";
      project: {
        id: string;
        name: string;
        path: string;
        color: string | null;
        workingMethod: string | null;
      } | null;
    }
  | {
      type: "epic";
      projectId: string;
      epic: {
        id: string;
        title: string;
        description: string | null;
        projectId: string;
        color: string | null;
        createdAt: string;
      } | null;
    }
  | { type: "settings" }
  | { type: "shortcuts" };

export interface UseModalReturn {
  modal: ModalState;
  openNewTicket: () => void;
  openProject: (project?: {
    id: string;
    name: string;
    path: string;
    color: string | null;
    workingMethod: string | null;
  }) => void;
  openEpic: (
    projectId: string,
    epic?: {
      id: string;
      title: string;
      description: string | null;
      projectId: string;
      color: string | null;
      createdAt: string;
    }
  ) => void;
  openSettings: () => void;
  openShortcuts: () => void;
  close: () => void;
  isAnyOpen: boolean;
}

/**
 * Hook for managing modal state with a discriminated union
 * Replaces 8 separate useState calls with a single state variable
 */
export function useModal(): UseModalReturn {
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  const openNewTicket = useCallback(() => {
    setModal({ type: "newTicket" });
  }, []);

  const openProject = useCallback(
    (project?: {
      id: string;
      name: string;
      path: string;
      color: string | null;
      workingMethod: string | null;
    }) => {
      setModal({ type: "project", project: project ?? null });
    },
    []
  );

  const openEpic = useCallback(
    (
      projectId: string,
      epic?: {
        id: string;
        title: string;
        description: string | null;
        projectId: string;
        color: string | null;
        createdAt: string;
      }
    ) => {
      setModal({ type: "epic", projectId, epic: epic ?? null });
    },
    []
  );

  const openSettings = useCallback(() => {
    setModal({ type: "settings" });
  }, []);

  const openShortcuts = useCallback(() => {
    setModal({ type: "shortcuts" });
  }, []);

  const close = useCallback(() => {
    setModal({ type: "none" });
  }, []);

  const isAnyOpen = modal.type !== "none";

  return {
    modal,
    openNewTicket,
    openProject,
    openEpic,
    openSettings,
    openShortcuts,
    close,
    isAnyOpen,
  };
}

/**
 * Filter state for project/epic/tag filtering
 */
export interface Filters {
  projectId: string | null;
  epicId: string | null;
  tags: string[];
}

export interface UseFiltersReturn {
  filters: Filters;
  setProjectId: (id: string | null) => void;
  setEpicId: (id: string | null, projectId?: string) => void;
  setTags: (tags: string[]) => void;
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  clearAll: () => void;
}

/**
 * Hook for managing filter state
 * Replaces 3 separate useState calls and related handlers
 */
export function useFilters(): UseFiltersReturn {
  const [filters, setFilters] = useState<Filters>({
    projectId: null,
    epicId: null,
    tags: [],
  });

  const setProjectId = useCallback((id: string | null) => {
    setFilters((prev) => ({
      ...prev,
      projectId: id,
      epicId: null, // Clear epic when project changes
    }));
  }, []);

  const setEpicId = useCallback((id: string | null, projectId?: string) => {
    setFilters((prev) => ({
      ...prev,
      epicId: id,
      // If projectId is provided (e.g., when selecting an epic), set it too
      ...(projectId !== undefined ? { projectId } : {}),
    }));
  }, []);

  const setTags = useCallback((tags: string[]) => {
    setFilters((prev) => ({
      ...prev,
      tags,
    }));
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setFilters((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  }, []);

  const clearTags = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      tags: [],
    }));
  }, []);

  const clearAll = useCallback(() => {
    setFilters({
      projectId: null,
      epicId: null,
      tags: [],
    });
  }, []);

  return {
    filters,
    setProjectId,
    setEpicId,
    setTags,
    toggleTag,
    clearTags,
    clearAll,
  };
}

import {
  checkFirstLaunch,
  createSampleData,
  deleteSampleData as deleteSampleDataApi,
} from "../api/sample-data";

export interface UseSampleDataReturn {
  hasSampleData: boolean;
  isDeleting: boolean;
  deleteSampleData: () => void;
}

/**
 * Hook for managing sample data lifecycle
 * Handles first launch detection and sample data deletion
 * Uses TanStack Query mutation for proper query invalidation
 */
export function useSampleData(onDeleted?: () => void): UseSampleDataReturn {
  const [hasSampleData, setHasSampleData] = useState(false);
  const queryClient = useQueryClient();

  // Check for first launch and create sample data if needed
  useEffect(() => {
    const initSampleData = async () => {
      try {
        const result = await checkFirstLaunch({ data: undefined });
        if (result.isEmpty) {
          // First launch - create sample data
          await createSampleData({ data: undefined });
          setHasSampleData(true);
        } else if (result.hasSampleData) {
          setHasSampleData(true);
        }
      } catch (error) {
        console.error("Failed to check/create sample data:", error);
      }
    };
    void initSampleData();
  }, []);

  // Use mutation for proper query invalidation
  const deleteMutation = useMutation({
    mutationFn: () => deleteSampleDataApi({ data: undefined }),
    onSuccess: () => {
      setHasSampleData(false);
      // Invalidate all affected queries - projects, tickets, and tags
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
      onDeleted?.();
    },
    onError: (error) => {
      console.error("Failed to delete sample data:", error);
    },
  });

  const deleteSampleData = useCallback(() => {
    if (!confirm("Delete all sample data? This cannot be undone.")) return;
    deleteMutation.mutate();
  }, [deleteMutation]);

  return {
    hasSampleData,
    isDeleting: deleteMutation.isPending,
    deleteSampleData,
  };
}

import { getProjects, createProject, updateProject, deleteProject } from "../api/projects";
import {
  getSettings,
  updateSettings,
  detectAvailableTerminals,
  getDockerStatus,
  buildSandboxImage,
  detectDockerRuntimes,
  getActiveDockerRuntime,
  type UpdateSettingsInput,
} from "../api/settings";
import { getEpicsByProject, createEpic, updateEpic, deleteEpic } from "../api/epics";
import {
  getTickets,
  createTicket,
  updateTicket,
  updateTicketStatus,
  updateTicketPosition,
  deleteTicket,
  type TicketFilters,
  type CreateTicketInput,
  type UpdateTicketInput,
  type TicketStatus,
} from "../api/tickets";
import { searchTickets, type SearchResult } from "../api/search";
import { getTags, type TagFilters } from "../api/tags";

// Query Keys - centralized for easy invalidation
export const queryKeys = {
  projects: ["projects"] as const,
  projectsWithEpics: ["projects", "with-epics"] as const,
  epics: (projectId: string) => ["epics", projectId] as const,
  tickets: (filters: TicketFilters) => ["tickets", filters] as const,
  allTickets: ["tickets"] as const,
  tags: (filters: TagFilters) => ["tags", filters] as const,
  allTags: ["tags"] as const,
  search: (query: string, projectId?: string) => ["search", query, projectId] as const,
  settings: ["settings"] as const,
  availableTerminals: ["available-terminals"] as const,
  // Docker runtime detection
  dockerRuntimes: ["dockerRuntimes"] as const,
  activeDockerRuntime: ["activeDockerRuntime"] as const,
  // Docker availability (for UI buttons)
  dockerAvailability: ["docker-availability"] as const,
  // Ralph container monitoring (hierarchical for easy invalidation)
  ralph: {
    all: ["ralph"] as const,
    containers: () => ["ralph", "containers"] as const,
    containerLogs: (containerName: string, tail: number) =>
      ["ralph", "containerLogs", containerName, tail] as const,
    containerStats: (containerNames?: string[]) =>
      ["ralph", "containerStats", containerNames ?? "all"] as const,
    events: (sessionId: string) => ["ralph", "events", sessionId] as const,
  },
  // Project services
  projectServices: (projectPath: string) => ["projectServices", projectPath] as const,
};

// Types
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

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  position: number;
  projectId: string;
  epicId: string | null;
  tags: string | null;
  subtasks: string | null;
  isBlocked: boolean;
  blockedReason: string | null;
  linkedFiles: string | null;
  attachments: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  // Git/PR tracking fields
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prStatus: "draft" | "open" | "merged" | "closed" | null;
}

// Hook for invalidating queries - use this after mutations!
export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  return {
    invalidateProjects: () => queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
    invalidateTickets: () => queryClient.invalidateQueries({ queryKey: queryKeys.allTickets }),
    invalidateTags: () => queryClient.invalidateQueries({ queryKey: queryKeys.allTags }),
    invalidateAll: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  };
}

// =============================================================================
// MUTATION HOOKS - Use these for all data modifications!
// =============================================================================

// Ticket mutations
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTicketInput) => createTicket({ data }),
    onSuccess: () => {
      // Invalidate tickets and tags (new ticket might have new tags)
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

export function useUpdateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; updates: UpdateTicketInput }) => updateTicket({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; status: TicketStatus }) => updateTicketStatus({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

export function useUpdateTicketPosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { id: string; position: number }) => updateTicketPosition({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

export function useDeleteTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { ticketId: string; confirm?: boolean }) => deleteTicket({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

// Project mutations
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

// Epic mutations
export function useCreateEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title: string;
      projectId: string;
      description?: string;
      color?: string;
    }) => createEpic({ data }),
    onSuccess: () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { epicId: string; confirm?: boolean }) => deleteEpic({ data: params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

// =============================================================================
// DELETE PREVIEW HOOKS
// =============================================================================

/**
 * Hook for fetching ticket delete preview (dry-run).
 * @param ticketId - The ticket ID to preview deletion for
 * @param enabled - Whether to fetch the preview (typically when modal opens)
 */
export function useTicketDeletePreview(ticketId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ticket", ticketId, "delete-preview"] as const,
    queryFn: () => deleteTicket({ data: { ticketId, confirm: false } }),
    enabled,
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

// Hook for fetching projects with their epics
export function useProjects() {
  const query = useQuery({
    queryKey: queryKeys.projectsWithEpics,
    queryFn: async () => {
      // Fetch all projects
      const projectList = await getProjects();

      // Fetch epics for each project
      const projectsWithEpics: ProjectWithEpics[] = await Promise.all(
        projectList.map(async (project) => {
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

// Status change event for notifications
export interface StatusChange {
  ticketId: string;
  ticketTitle: string;
  fromStatus: string;
  toStatus: string;
}

// Hook for fetching tickets with optional filters and polling
// Polling disabled by default (pollingInterval = 0) for performance
export function useTickets(
  filters: TicketFilters = {},
  options: { pollingInterval?: number; onStatusChange?: (change: StatusChange) => void } = {}
) {
  const prevTicketsRef = useRef<Map<string, string>>(new Map());
  const isInitialLoad = useRef(true);
  const { pollingInterval = 0, onStatusChange } = options;

  const query = useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: async () => {
      const ticketList = await getTickets({ data: filters });
      return ticketList as Ticket[];
    },
    // Always stale - tickets can be created/updated via MCP externally
    staleTime: 0,
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  // Check for status changes when data updates
  useEffect(() => {
    if (!query.data || !onStatusChange) return;

    if (!isInitialLoad.current) {
      for (const ticket of query.data) {
        const prevStatus = prevTicketsRef.current.get(ticket.id);
        if (prevStatus && prevStatus !== ticket.status) {
          onStatusChange({
            ticketId: ticket.id,
            ticketTitle: ticket.title,
            fromStatus: prevStatus,
            toStatus: ticket.status,
          });
        }
      }
    }

    // Update previous tickets map
    prevTicketsRef.current = new Map(query.data.map((t) => [t.id, t.status]));
    isInitialLoad.current = false;
  }, [query.data, onStatusChange]);

  return {
    tickets: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Hook for searching tickets with debouncing
export function useSearch(projectId?: string | null) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const search = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setSearchError(null);
        return;
      }

      setLoading(true);
      setSearchError(null);
      try {
        const searchData: { query: string; projectId?: string } = {
          query: searchQuery,
        };
        if (projectId) {
          searchData.projectId = projectId;
        }
        const data = await searchTickets({
          data: searchData,
        });
        setResults(data);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  const debouncedSearch = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      if (!searchQuery.trim()) {
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void search(searchQuery);
      }, 300);
    },
    [search]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const clearSearch = useCallback(() => {
    setQuery("");
    setResults([]);
    setSearchError(null);
  }, []);

  return { query, results, loading, error: searchError, search: debouncedSearch, clearSearch };
}

// Hook for fetching unique tags with optional project/epic filter
export function useTags(filters: TagFilters = {}) {
  const query = useQuery({
    queryKey: queryKeys.tags(filters),
    queryFn: async () => {
      const tagData: TagFilters = {};
      if (filters.projectId) {
        tagData.projectId = filters.projectId;
      }
      if (filters.epicId) {
        tagData.epicId = filters.epicId;
      }

      return await getTags({ data: tagData });
    },
    // Always stale - tags derived from tickets which can change via MCP
    staleTime: 0,
  });

  return {
    tags: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Settings type
export interface Settings {
  id: string;
  terminalEmulator: string | null;
  ralphSandbox: boolean | null;
  ralphTimeout: number | null;
  autoCreatePr: boolean | null;
  prTargetBranch: string | null;
  defaultProjectsDirectory: string | null;
  defaultWorkingMethod: string | null;
  // Docker runtime settings
  dockerRuntime: string | null; // 'lima' | 'colima' | 'rancher' | 'docker-desktop' | 'podman' | null (auto)
  dockerSocketPath: string | null; // Custom socket path override
  // Enterprise conversation logging
  conversationLoggingEnabled: boolean | null;
  conversationRetentionDays: number | null;
  createdAt: string;
  updatedAt: string;
}

// Docker status type
export interface DockerStatus {
  dockerAvailable: boolean;
  dockerRunning: boolean;
  imageBuilt: boolean;
  imageTag: string;
  // Runtime detection info (from docker-utils)
  runtimeType: string | null; // 'lima' | 'colima' | 'rancher' | 'docker-desktop' | 'podman' | 'unknown'
  socketPath: string | null; // Detected/configured socket path
}

// =============================================================================
// SETTINGS HOOKS
// =============================================================================

// Hook for fetching settings
export function useSettings() {
  const query = useQuery({
    queryKey: queryKeys.settings,
    queryFn: async () => {
      const settings = await getSettings();
      return settings as Settings;
    },
    // Settings change infrequently and only via UI, cache for 30 seconds
    staleTime: 30000,
  });

  return {
    settings: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Hook for updating settings
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) => updateSettings({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

// Hook for detecting available terminals
export function useAvailableTerminals() {
  const query = useQuery({
    queryKey: queryKeys.availableTerminals,
    queryFn: async () => {
      const terminals = await detectAvailableTerminals();
      return terminals as string[];
    },
    staleTime: 60000, // Cache for 1 minute
  });

  return {
    availableTerminals: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}

// Hook for checking Docker status
export function useDockerStatus() {
  const query = useQuery({
    queryKey: ["docker-status"],
    queryFn: async () => {
      const status = await getDockerStatus();
      return status as DockerStatus;
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  return {
    dockerStatus: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Hook for building sandbox image
export function useBuildSandboxImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => buildSandboxImage(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docker-status"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dockerAvailability });
    },
  });
}

// =============================================================================
// DOCKER AVAILABILITY HOOK
// =============================================================================

import { getDockerUnavailableMessage } from "./docker-messages";

/**
 * Hook for checking Docker availability with caching.
 *
 * Provides a consumer-friendly interface for checking if Docker can be used
 * to run Ralph in sandbox mode. Caches status for 30 seconds to prevent
 * excessive Docker checks when modals are opened/closed.
 *
 * Multiple components using this hook share the same cached query (deduplication).
 *
 * @returns Object with:
 *   - isAvailable: Whether Docker daemon is running
 *   - isImageBuilt: Whether the sandbox image exists
 *   - message: User-friendly message if Docker is unavailable
 *   - loading: Whether status is being fetched
 *   - refetch: Function to force refresh the status
 */
export function useDockerAvailability() {
  const query = useQuery({
    queryKey: queryKeys.dockerAvailability,
    queryFn: async () => {
      const status = await getDockerStatus();
      return {
        available: status.dockerAvailable && status.dockerRunning,
        imageBuilt: status.imageBuilt,
        message: getDockerUnavailableMessage(status),
      };
    },
    staleTime: 30_000, // 30 seconds - prevents flicker on modal re-open
  });

  return {
    isAvailable: query.data?.available ?? false,
    isImageBuilt: query.data?.imageBuilt ?? false,
    message: query.data?.message,
    loading: query.isLoading,
    refetch: query.refetch,
  };
}

// =============================================================================
// DOCKER RUNTIME DETECTION HOOKS
// =============================================================================

import type { DockerRuntimeInfo } from "./docker-runtime";

/**
 * Hook for fetching all available Docker runtimes on the system.
 * Returns a list of detected runtimes with availability status and socket paths.
 * Used by the Settings UI to show which runtimes are available for selection.
 *
 * Results are cached for 30 seconds to avoid repeated filesystem checks.
 */
export function useAvailableDockerRuntimes() {
  const query = useQuery({
    queryKey: queryKeys.dockerRuntimes,
    queryFn: async () => {
      const runtimes = await detectDockerRuntimes();
      return runtimes as DockerRuntimeInfo[];
    },
    staleTime: 30_000, // 30 seconds - runtimes don't change frequently
  });

  return {
    runtimes: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook for getting the currently active Docker runtime.
 * This respects user preference (from settings) over auto-detection.
 *
 * Use this when you need to know which runtime would actually be used
 * for Docker commands (as opposed to what's available).
 *
 * Results are cached for 30 seconds.
 */
export function useActiveDockerRuntime() {
  const query = useQuery({
    queryKey: queryKeys.activeDockerRuntime,
    queryFn: async () => {
      const runtime = await getActiveDockerRuntime();
      return runtime as DockerRuntimeInfo;
    },
    staleTime: 30_000, // 30 seconds
  });

  return {
    runtime: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// RALPH HOOKS - Autonomous agent mode
// =============================================================================

import {
  launchRalphForTicket,
  launchRalphForEpic,
  getActiveRalphSessions,
  type ActiveRalphSession,
} from "../api/ralph";
import { launchProjectInception, launchSpecBreakdown } from "../api/inception";
import {
  getComments,
  createComment,
  deleteComment,
  type Comment,
  type CreateCommentInput,
} from "../api/comments";

// =============================================================================
// COMMENTS HOOKS
// =============================================================================

// Hook for fetching comments for a ticket with optional polling
export function useComments(ticketId: string, options: { pollingInterval?: number } = {}) {
  const { pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: ["comments", ticketId],
    queryFn: async () => {
      const comments = await getComments({ data: ticketId });
      return comments as Comment[];
    },
    enabled: Boolean(ticketId),
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  return {
    comments: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Hook for creating a comment
export function useCreateComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCommentInput) => createComment({ data }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["comments", variables.ticketId] });
    },
  });
}

// Hook for deleting a comment
export function useDeleteComment(ticketId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => deleteComment({ data: commentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", ticketId] });
    },
  });
}

// Hook for launching Ralph on a single ticket
export function useLaunchRalphForTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      ticketId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
    }) => launchRalphForTicket({ data }),
    onSuccess: () => {
      // Ticket status will be updated by Ralph, invalidate to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

// Hook for launching Ralph on an entire epic
export function useLaunchRalphForEpic() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      epicId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
    }) => launchRalphForEpic({ data }),
    onSuccess: () => {
      // Ticket statuses will be updated by Ralph, invalidate to reflect changes
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
    },
  });
}

/**
 * Hook for fetching all active Ralph sessions.
 * Returns a map of ticketId -> session for efficient lookup in kanban board.
 *
 * Uses polling to keep the status updated in real-time.
 */
export function useActiveRalphSessions(options: { pollingInterval?: number } = {}) {
  const { pollingInterval = 5000 } = options; // Default: poll every 5 seconds

  const query = useQuery({
    queryKey: ["activeRalphSessions"],
    queryFn: async (): Promise<Record<string, ActiveRalphSession>> => {
      return getActiveRalphSessions();
    },
    // Poll frequently to show real-time status
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
    // Sessions can change at any time via MCP
    staleTime: 0,
  });

  return {
    /** Map of ticketId -> active session (for O(1) lookup) */
    sessions: query.data ?? {},
    /** Check if a ticket has an active Ralph session */
    hasActiveSession: (ticketId: string) => Boolean(query.data?.[ticketId]),
    /** Get the active session for a ticket (if any) */
    getSession: (ticketId: string) => query.data?.[ticketId] ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// Re-export the ActiveRalphSession type for components
export type { ActiveRalphSession };

// =============================================================================
// PROJECT INCEPTION HOOKS - Start from scratch workflow
// =============================================================================

// Hook for launching Project Inception (new project from scratch)
export function useLaunchProjectInception() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { preferredTerminal?: string | null }) => launchProjectInception({ data }),
    onSuccess: () => {
      // A new project may be created, invalidate projects list
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// Hook for launching Spec Breakdown (generate tickets from spec)
export function useLaunchSpecBreakdown() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      projectPath: string;
      projectName: string;
      preferredTerminal?: string | null;
    }) => launchSpecBreakdown({ data }),
    onSuccess: () => {
      // Tickets will be created, invalidate tickets and projects
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export type { SearchResult };

// =============================================================================
// SERVICE DISCOVERY HOOKS
// =============================================================================

import {
  getProjectServices,
  startService,
  stopService,
  stopAllServices,
  listRalphContainers,
  getRalphContainerLogs,
} from "../api/services";
import type { RalphServicesFile, RalphService } from "./service-discovery";

/**
 * Hook for fetching running services from a project's .ralph-services.json file.
 * Polls at configurable intervals when enabled.
 *
 * @param projectPath - Path to the project root
 * @param options - Configuration options
 * @returns Services data and query state
 */
export function useProjectServices(
  projectPath: string | null | undefined,
  options: {
    /** Whether to enable the query (default: true) */
    enabled?: boolean;
    /** Polling interval in ms (default: 0, no polling) */
    pollingInterval?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 0 } = options;

  const query = useQuery({
    queryKey: queryKeys.projectServices(projectPath ?? ""),
    queryFn: async () => {
      if (!projectPath) {
        return { services: [], updatedAt: new Date().toISOString() } as RalphServicesFile;
      }
      return getProjectServices({ data: { projectPath } });
    },
    enabled: enabled && Boolean(projectPath),
    refetchInterval: pollingInterval > 0 ? pollingInterval : false,
  });

  // Filter to only running services for convenience
  const runningServices: RalphService[] = (query.data?.services ?? []).filter(
    (s) => s.status === "running"
  );

  return {
    services: query.data?.services ?? [],
    runningServices,
    updatedAt: query.data?.updatedAt,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Mutation hook to start a service.
 *
 * Updates the service status in .ralph-services.json to "running".
 * Note: This only updates the status file, not the actual process.
 */
export function useStartService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectPath: string;
      serviceName: string;
      servicePort: number;
    }) => {
      const result = await startService({ data: params });
      if (!result.success) {
        throw new Error(result.error ?? "Failed to start service");
      }
      return result;
    },
    onSuccess: (_data, variables) => {
      // Return promise to keep mutation pending until queries refetch (TanStack best practice)
      return queryClient.invalidateQueries({
        queryKey: queryKeys.projectServices(variables.projectPath),
      });
    },
  });
}

/**
 * Mutation hook to stop a service.
 *
 * Updates the service status in .ralph-services.json to "stopped".
 * Note: This only updates the status file, not the actual process.
 */
export function useStopService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectPath: string;
      serviceName: string;
      servicePort: number;
    }) => {
      const result = await stopService({ data: params });
      if (!result.success) {
        throw new Error(result.error ?? "Failed to stop service");
      }
      return result;
    },
    onSuccess: (_data, variables) => {
      // Return promise to keep mutation pending until queries refetch (TanStack best practice)
      return queryClient.invalidateQueries({
        queryKey: queryKeys.projectServices(variables.projectPath),
      });
    },
  });
}

/**
 * Mutation hook to stop all running services in a project.
 *
 * Updates all services with "running" status to "stopped" in .ralph-services.json.
 */
export function useStopAllServices() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { projectPath: string }) => {
      const result = await stopAllServices({ data: params });
      if (!result.success) {
        throw new Error(result.error ?? "Failed to stop services");
      }
      return result;
    },
    onSuccess: (_data, variables) => {
      // Return promise to keep mutation pending until queries refetch (TanStack best practice)
      return queryClient.invalidateQueries({
        queryKey: queryKeys.projectServices(variables.projectPath),
      });
    },
  });
}

// =============================================================================
// RALPH EVENT STREAMING
// =============================================================================

import { getRalphEvents } from "../api/ralph-events";
import type { RalphEventType, RalphEventData } from "./schema";

/** Parsed Ralph event for UI consumption */
export interface ParsedRalphEvent {
  id: string;
  sessionId: string;
  type: RalphEventType;
  data: RalphEventData;
  createdAt: string;
}

/**
 * Hook for streaming Ralph events from a session.
 * Uses polling to fetch all events and derives state from the full event list.
 *
 * @param sessionId - The Ralph session ID (usually ticket ID)
 * @param options - Configuration options
 */
export function useRalphEvents(
  sessionId: string | null,
  options: {
    /** Whether to enable the stream (default: true when sessionId is provided) */
    enabled?: boolean;
    /** Polling interval in ms (default: 1000ms = 1 second) */
    pollingInterval?: number;
    /** Maximum events to return (default: 100) */
    maxEvents?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 1000, maxEvents = 100 } = options;
  const queryClient = useQueryClient();

  // Query fetches all events from the server
  const query = useQuery({
    queryKey: queryKeys.ralph.events(sessionId ?? ""),
    queryFn: async () => {
      if (!sessionId) {
        return [] as ParsedRalphEvent[];
      }

      const result = await getRalphEvents({
        data: { sessionId, limit: maxEvents },
      });

      // Throw on failure so TanStack Query shows error state
      if (!result.success) {
        throw new Error(result.message || "Failed to fetch Ralph events");
      }

      // Return empty array if no events (distinct from failure)
      if (!result.events) {
        return [] as ParsedRalphEvent[];
      }

      return result.events as ParsedRalphEvent[];
    },
    enabled: enabled && Boolean(sessionId),
    refetchInterval: pollingInterval,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Derive all values from query data using useMemo (no effects needed)
  const events = useMemo(() => query.data ?? [], [query.data]);

  const latestEvent = useMemo(() => {
    if (events.length === 0) return null;
    return events[events.length - 1] ?? null;
  }, [events]);

  // Get the current state from state_change events
  const currentState = useMemo(() => {
    const stateEvents = events.filter((e) => e.type === "state_change");
    const lastStateEvent = stateEvents[stateEvents.length - 1];
    return lastStateEvent?.data?.state ?? null;
  }, [events]);

  // Helper to get events of a specific type
  const getEventsByType = useCallback(
    (type: RalphEventType) => events.filter((e) => e.type === type),
    [events]
  );

  // Clear events by invalidating the query (will refetch empty)
  const clearEvents = useCallback(() => {
    queryClient.setQueryData(["ralphEvents", sessionId], []);
  }, [queryClient, sessionId]);

  return {
    /** All events for this session (up to maxEvents) */
    events,
    /** The most recent event */
    latestEvent,
    /** Current state from state_change events */
    currentState,
    /** Whether we're fetching events */
    loading: query.isLoading,
    /** Any error that occurred */
    error: query.error?.message ?? null,
    /** Get events of a specific type */
    getEventsByType,
    /** Clear all events (useful when session ends) */
    clearEvents,
    /** Force refetch events */
    refetch: query.refetch,
  };
}

// =============================================================================
// RALPH CONTAINER LOGS
// =============================================================================

// Hoisted regex for parsing Ralph iteration info (js-hoist-regexp)
const RALPH_ITERATION_REGEX = /Ralph Iteration (\d+) of (\d+)/g;
const ITERATION_NUMBERS_REGEX = /(\d+) of (\d+)/;

/**
 * Hook for listing running Ralph containers.
 * Polls at configurable intervals to detect when Ralph starts/stops.
 *
 * @param options - Configuration options
 * @returns List of Ralph containers and query state
 */
export function useRalphContainers(
  options: {
    /** Whether to enable the query (default: true) */
    enabled?: boolean;
    /** Polling interval in ms (default: 3000ms) */
    pollingInterval?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 3000 } = options;

  const query = useQuery({
    queryKey: queryKeys.ralph.containers(),
    queryFn: listRalphContainers, // Let type be inferred from API function
    enabled,
    refetchInterval: pollingInterval,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Find the most recent running Ralph container
  const runningContainer = useMemo(() => {
    const containers = query.data ?? [];
    return containers.find((c) => c.isRunning) ?? null;
  }, [query.data]);

  return {
    containers: query.data ?? [],
    runningContainer,
    hasRunningContainer: Boolean(runningContainer),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching logs from a Ralph container.
 * Uses polling to stream logs in near real-time.
 *
 * @param containerName - Name of the container to fetch logs from
 * @param options - Configuration options
 * @returns Log content and container status
 */
export function useRalphContainerLogs(
  containerName: string | null,
  options: {
    /** Whether to enable the query (default: true when containerName is provided) */
    enabled?: boolean;
    /** Polling interval in ms (default: 1000ms) */
    pollingInterval?: number;
    /** Number of lines to fetch (default: 500) */
    tail?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 1000, tail = 500 } = options;

  // Track the previous log length for detecting new content
  // Using useState because hasNewLogs is used for rendering (auto-scroll behavior)
  const [prevLogLength, setPrevLogLength] = useState(0);

  const query = useQuery({
    queryKey: queryKeys.ralph.containerLogs(containerName ?? "", tail),
    queryFn: async () => {
      if (!containerName) {
        return { logs: "", containerRunning: false };
      }
      return getRalphContainerLogs({ data: { containerName, tail } });
    },
    enabled: enabled && Boolean(containerName),
    refetchInterval: pollingInterval,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Parse iteration info from logs using hoisted regex (js-hoist-regexp)
  // Note: String.match() with global regex returns all matches without using lastIndex
  const iterationInfo = useMemo(() => {
    const logs = query.data?.logs ?? "";
    const match = logs.match(RALPH_ITERATION_REGEX);
    if (!match || match.length === 0) {
      return null;
    }
    // Get the last match (most recent iteration)
    const lastMatch = match[match.length - 1];
    const numbers = lastMatch?.match(ITERATION_NUMBERS_REGEX);
    if (!numbers) return null;
    return {
      current: parseInt(numbers[1] ?? "0", 10),
      total: parseInt(numbers[2] ?? "0", 10),
    };
  }, [query.data?.logs]);

  // Detect if new logs have arrived
  const currentLogLength = query.data?.logs?.length ?? 0;
  const hasNewLogs = currentLogLength > prevLogLength;

  // Update previous length after render
  useEffect(() => {
    setPrevLogLength(currentLogLength);
  }, [currentLogLength]);

  return {
    logs: query.data?.logs ?? "",
    containerRunning: query.data?.containerRunning ?? false,
    iterationInfo,
    hasNewLogs,
    loading: query.isLoading,
    error: query.data?.error ?? query.error?.message ?? null,
    refetch: query.refetch,
  };
}

// =============================================================================
// RALPH CONTAINER STATS
// =============================================================================

import { getRalphContainerStats } from "../api/services";
import type { ContainerStats, ContainerStatsResult } from "../api/docker-utils";

// Re-export types for components
export type { ContainerStats, ContainerStatsResult };

/**
 * Hook for fetching resource usage stats for Ralph containers.
 *
 * Uses `docker stats --no-stream` which is heavier than `docker ps`,
 * so polls less frequently (default: 10 seconds).
 *
 * @param containerNames - Optional list of container names to filter
 * @param options - Configuration options
 * @returns Container stats and query state
 */
export function useContainerStats(
  containerNames?: string[],
  options: {
    /** Whether to enable the query (default: true) */
    enabled?: boolean;
    /** Polling interval in ms (default: 10000ms = 10 seconds) */
    pollingInterval?: number;
  } = {}
) {
  const { enabled = true, pollingInterval = 10_000 } = options;

  const query = useQuery({
    queryKey: queryKeys.ralph.containerStats(containerNames),
    queryFn: async (): Promise<ContainerStatsResult> => {
      // Only include containerNames in data if provided (exactOptionalPropertyTypes)
      return getRalphContainerStats({
        data: containerNames ? { containerNames } : {},
      });
    },
    enabled,
    refetchInterval: pollingInterval,
    // Prevent refetch on window focus since we're polling (TanStack Query best practice)
    staleTime: pollingInterval,
    refetchOnWindowFocus: false,
  });

  // Create a map for efficient lookup by container name
  const statsMap = useMemo(() => {
    const map = new Map<string, ContainerStats>();
    const stats = query.data?.stats;
    if (stats) {
      for (const stat of stats) {
        map.set(stat.name, stat);
      }
    }
    return map;
  }, [query.data]);

  return {
    /** Array of container stats */
    stats: query.data?.stats ?? [],
    /** Map of containerName -> stats for O(1) lookup */
    statsMap,
    /** Get stats for a specific container by name */
    getStats: (name: string) => statsMap.get(name) ?? null,
    /** Any error that occurred (from Docker or query) */
    error: query.data?.error ?? query.error?.message ?? null,
    /** Whether we're fetching stats */
    loading: query.isLoading,
    /** Force refetch stats */
    refetch: query.refetch,
  };
}
