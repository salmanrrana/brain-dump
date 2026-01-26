/**
 * Sample data management hook.
 * Handles first launch detection and sample data lifecycle.
 */

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  checkFirstLaunch,
  createSampleData,
  deleteSampleData as deleteSampleDataApi,
} from "../../api/sample-data";
import { createBrowserLogger } from "../browser-logger";
import { queryKeys } from "../query-keys";

// Browser-safe logger for hook errors
const logger = createBrowserLogger("hooks:sample-data");

// =============================================================================
// SAMPLE DATA HOOK
// =============================================================================

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
        // Note: Components using this hook should show user-facing error notifications
        logger.error(
          "Failed to check/create sample data",
          error instanceof Error ? error : new Error(String(error))
        );
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
      // Note: Components using this hook should show user-facing error notifications
      logger.error(
        "Failed to delete sample data",
        error instanceof Error ? error : new Error(String(error))
      );
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
