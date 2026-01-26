/**
 * Service discovery TanStack Query hooks.
 * Includes queries and mutations for managing project services.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProjectServices, startService, stopService, stopAllServices } from "../../api/services";
import type { RalphServicesFile, RalphService } from "../service-discovery";
import { queryKeys } from "../query-keys";

// Re-export types for components
export type { RalphServicesFile, RalphService };

// =============================================================================
// SERVICE DISCOVERY HOOKS
// =============================================================================

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
