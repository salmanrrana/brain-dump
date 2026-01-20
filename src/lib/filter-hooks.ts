/**
 * Filter hooks with URL synchronization using TanStack Router.
 *
 * This module provides hooks for managing board filters that sync with URL
 * search params, enabling shareable filtered views and persistence across navigation.
 *
 * Uses TanStack Router's useRouterState hook to properly subscribe to URL changes,
 * which works correctly with both programmatic navigation and browser history.
 *
 * @module filter-hooks
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Filter state for project/epic/tag filtering.
 */
export interface Filters {
  projectId: string | null;
  epicId: string | null;
  tags: string[];
}

/**
 * Return type for the useFiltersWithUrl hook.
 */
export interface UseFiltersWithUrlReturn {
  /** Current filter state */
  filters: Filters;
  /** Set the project filter (clears epic when project changes) */
  setProjectId: (id: string | null) => void;
  /** Set the epic filter (optionally set project too) */
  setEpicId: (id: string | null, projectId?: string) => void;
  /** Set all tags at once */
  setTags: (tags: string[]) => void;
  /** Toggle a single tag on/off */
  toggleTag: (tag: string) => void;
  /** Clear all tags */
  clearTags: () => void;
  /** Clear all filters and reset URL */
  clearAll: () => void;
  /** Whether any filters are active */
  hasActiveFilters: boolean;
  /** Count of active filters (project, epic, and tags count as 1 each if set) */
  activeFilterCount: number;
}

// =============================================================================
// URL PARSING UTILITIES
// =============================================================================

const EMPTY_FILTERS: Filters = { projectId: null, epicId: null, tags: [] };

/**
 * Parse URL search params into filter state.
 * Handles both single values and arrays for tags.
 */
function parseFiltersFromSearchString(searchString: string): Filters {
  if (!searchString) return EMPTY_FILTERS;

  const searchParams = new URLSearchParams(searchString);
  const projectId = searchParams.get("project") || null;
  const epicId = searchParams.get("epic") || null;

  // Tags can be a single value or comma-separated
  const tagsParam = searchParams.get("tags");
  const tags = tagsParam ? tagsParam.split(",").filter(Boolean) : [];

  return { projectId, epicId, tags };
}

/**
 * Build search params object from filter state for TanStack Router.
 * Returns an object suitable for navigate({ search: ... })
 */
function buildSearchParams(filters: Filters): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};

  if (filters.projectId) {
    params.project = filters.projectId;
  }

  if (filters.epicId) {
    params.epic = filters.epicId;
  }

  if (filters.tags.length > 0) {
    params.tags = filters.tags.join(",");
  }

  return params;
}

// =============================================================================
// MAIN HOOK
// =============================================================================

/**
 * Hook for managing board filters with URL synchronization.
 *
 * Uses TanStack Router's useRouterState hook to properly subscribe to URL changes.
 * This ensures the component re-renders when the URL changes via:
 * - Programmatic navigation (navigate())
 * - Browser back/forward buttons
 * - Direct URL manipulation
 *
 * Features:
 * - Reads state from URL search params (URL is source of truth)
 * - Updates URL when filters change (shareable links)
 * - Persists across navigation within the app
 * - Clears epic when project changes (maintains consistency)
 *
 * URL Schema:
 * - ?project=<id> - Filter by project
 * - ?epic=<id> - Filter by epic
 * - ?tags=tag1,tag2,tag3 - Filter by tags (comma-separated)
 *
 * @example
 * ```tsx
 * function BoardComponent() {
 *   const { filters, setProjectId, hasActiveFilters, clearAll } = useFiltersWithUrl();
 *
 *   return (
 *     <div>
 *       {hasActiveFilters && <button onClick={clearAll}>Clear Filters</button>}
 *       <Board projectId={filters.projectId} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useFiltersWithUrl(): UseFiltersWithUrlReturn {
  const navigate = useNavigate();

  // Subscribe to router state changes using TanStack Router's hook
  // This properly triggers re-renders when URL changes via navigate()
  const searchString = useRouterState({
    select: (state) => state.location.searchStr,
  });

  // Parse filters from URL - URL is the single source of truth
  // Memoized to avoid recalculation on every render
  const filters = useMemo(() => parseFiltersFromSearchString(searchString), [searchString]);

  // Helper to update URL with new filters using TanStack Router
  const navigateWithFilters = useCallback(
    (newFilters: Filters) => {
      const searchParams = buildSearchParams(newFilters);

      // Update URL via TanStack Router
      // Using replace: true to avoid cluttering browser history
      void navigate({
        to: ".",
        search: searchParams,
        replace: true,
      });
    },
    [navigate]
  );

  // Filter setters - all derive new state from current filters
  const setProjectId = useCallback(
    (id: string | null) => {
      navigateWithFilters({
        ...filters,
        projectId: id,
        epicId: null, // Clear epic when project changes
      });
    },
    [navigateWithFilters, filters]
  );

  const setEpicId = useCallback(
    (id: string | null, projectId?: string) => {
      navigateWithFilters({
        ...filters,
        epicId: id,
        // If projectId is provided, set it too
        ...(projectId !== undefined ? { projectId } : {}),
      });
    },
    [navigateWithFilters, filters]
  );

  const setTags = useCallback(
    (tags: string[]) => {
      navigateWithFilters({ ...filters, tags });
    },
    [navigateWithFilters, filters]
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const newTags = filters.tags.includes(tag)
        ? filters.tags.filter((t) => t !== tag)
        : [...filters.tags, tag];
      navigateWithFilters({ ...filters, tags: newTags });
    },
    [navigateWithFilters, filters]
  );

  const clearTags = useCallback(() => {
    navigateWithFilters({ ...filters, tags: [] });
  }, [navigateWithFilters, filters]);

  const clearAll = useCallback(() => {
    navigateWithFilters(EMPTY_FILTERS);
  }, [navigateWithFilters]);

  // Computed values - derived from filters
  const hasActiveFilters = useMemo(
    () => Boolean(filters.projectId || filters.epicId || filters.tags.length > 0),
    [filters.projectId, filters.epicId, filters.tags.length]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.projectId) count++;
    if (filters.epicId) count++;
    if (filters.tags.length > 0) count++;
    return count;
  }, [filters.projectId, filters.epicId, filters.tags.length]);

  return {
    filters,
    setProjectId,
    setEpicId,
    setTags,
    toggleTag,
    clearTags,
    clearAll,
    hasActiveFilters,
    activeFilterCount,
  };
}

// =============================================================================
// BACKWARD COMPATIBILITY
// =============================================================================

/**
 * Interface matching the original useFilters return type for backward compatibility.
 * This allows components using the old API to work with the new URL-synced version.
 */
export interface UseFiltersReturn {
  filters: Filters;
  setProjectId: (id: string | null) => void;
  setEpicId: (id: string | null, projectId?: string) => void;
  setTags: (tags: string[]) => void;
  toggleTag: (tag: string) => void;
  clearTags: () => void;
  clearAll: () => void;
}
