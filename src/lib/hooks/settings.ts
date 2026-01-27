/**
 * Settings and Docker TanStack Query hooks.
 * Includes queries and mutations for app settings and Docker runtime detection.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSettings,
  updateSettings,
  detectAvailableTerminals,
  getDockerStatus,
  buildSandboxImage,
  detectDockerRuntimes,
  getActiveDockerRuntime,
  type UpdateSettingsInput,
} from "../../api/settings";
import { getDockerUnavailableMessage } from "../docker-messages";
import type { DockerRuntimeInfo } from "../docker-runtime";
import { createBrowserLogger } from "../browser-logger";
import { queryKeys } from "../query-keys";

// Browser-safe logger for hook errors
const logger = createBrowserLogger("hooks:settings");

// =============================================================================
// TYPES
// =============================================================================

// Settings type
export interface Settings {
  id: string;
  terminalEmulator: string | null;
  ralphSandbox: boolean | null;
  ralphTimeout: number | null;
  ralphMaxIterations: number | null;
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
  // Git worktree feature flag
  enableWorktreeSupport: boolean | null; // Global opt-in for worktree support
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

// Hook for updating settings with optimistic updates
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateSettingsInput) => updateSettings({ data }),
    onMutate: async (newSettings) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.settings });

      // Snapshot the previous value for rollback
      const previousSettings = queryClient.getQueryData<Settings>(queryKeys.settings);

      // Optimistically update the cache with merged settings
      if (previousSettings) {
        queryClient.setQueryData<Settings>(queryKeys.settings, {
          ...previousSettings,
          ...newSettings,
          updatedAt: new Date().toISOString(),
        });
      }

      // Return context with previous value for rollback
      return { previousSettings };
    },
    onError: (err, newSettings, context) => {
      // Note: Components using this hook should show user-facing error notifications
      // Log error with context for debugging
      logger.error(
        `Failed to update settings: attemptedUpdate=${JSON.stringify(newSettings)}`,
        err instanceof Error ? err : new Error(String(err))
      );

      // Rollback to previous settings on error
      if (context?.previousSettings) {
        queryClient.setQueryData(queryKeys.settings, context.previousSettings);
      }
    },
    onSettled: () => {
      // Always invalidate to ensure server state is reflected
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

// =============================================================================
// DOCKER STATUS HOOKS
// =============================================================================

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
