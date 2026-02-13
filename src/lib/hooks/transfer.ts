/**
 * Transfer (export/import) React Query hooks.
 *
 * Mutations for exporting/importing .braindump archives.
 * Export mutations trigger browser downloads on success.
 * Import mutations invalidate relevant caches on success.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  exportEpicFn,
  exportProjectFn,
  previewImportFn,
  performImportFn,
  createProjectAndImportFn,
  type ExportResponse,
  type ExportErrorResponse,
  type PreviewResponse,
  type PreviewErrorResponse,
  type ImportResponse,
  type ImportErrorResponse,
  type ImportInput,
  type CreateAndImportInput,
  type CreateAndImportResponse,
  type CreateAndImportErrorResponse,
} from "../../api/transfer";
import { downloadBase64File } from "../download";
import { queryKeys } from "../query-keys";

// ============================================
// Export Hooks
// ============================================

export function useExportEpic() {
  return useMutation({
    mutationFn: async (epicId: string) => {
      const result = (await exportEpicFn({ data: { epicId } })) as
        | ExportResponse
        | ExportErrorResponse;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (data) => {
      if (data.success) {
        downloadBase64File(data.base64Data, data.filename, "application/zip");
      }
    },
  });
}

export function useExportProject() {
  return useMutation({
    mutationFn: async (projectId: string) => {
      const result = (await exportProjectFn({ data: { projectId } })) as
        | ExportResponse
        | ExportErrorResponse;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: (data) => {
      if (data.success) {
        downloadBase64File(data.base64Data, data.filename, "application/zip");
      }
    },
  });
}

// ============================================
// Import Hooks
// ============================================

export function usePreviewImport() {
  return useMutation({
    mutationFn: async (base64Data: string) => {
      const result = (await previewImportFn({ data: { base64Data } })) as
        | PreviewResponse
        | PreviewErrorResponse;
      if (!result.success) throw new Error(result.error);
      return result;
    },
  });
}

export function usePerformImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: ImportInput) => {
      const result = (await performImportFn({ data: input })) as
        | ImportResponse
        | ImportErrorResponse;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}

export function useCreateProjectAndImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAndImportInput) => {
      const result = (await createProjectAndImportFn({ data: input })) as
        | CreateAndImportResponse
        | CreateAndImportErrorResponse;
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allTickets });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.allTags });
    },
  });
}
