/**
 * Server functions for .braindump archive export and import.
 *
 * Uses base64 encoding to transfer zip data between browser and server.
 * Business logic lives in core/transfer.ts; this layer handles serialization.
 */

import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "../lib/db";
import {
  gatherEpicExportData,
  gatherProjectExportData,
  importData,
  createBrainDumpArchive,
  extractBrainDumpArchive,
  previewBrainDumpArchive,
  MAX_ARCHIVE_SIZE_BYTES,
  ArchiveTooLargeError,
  CoreError,
} from "../../core/index.ts";
import type { ConflictResolution, ManifestPreview, ImportResult } from "../../core/index.ts";

// ============================================
// Types
// ============================================

export interface ExportResponse {
  success: true;
  filename: string;
  base64Data: string;
  epicCount: number;
  ticketCount: number;
  commentCount: number;
}

export interface ExportErrorResponse {
  success: false;
  error: string;
}

export interface ImportInput {
  base64Data: string;
  targetProjectId: string;
  resetStatuses?: boolean;
  conflictResolution?: ConflictResolution;
}

export interface ImportResponse {
  success: true;
  result: ImportResult;
}

export interface ImportErrorResponse {
  success: false;
  error: string;
}

export interface PreviewResponse {
  success: true;
  preview: ManifestPreview;
}

export interface PreviewErrorResponse {
  success: false;
  error: string;
}

// ============================================
// Server Functions
// ============================================

export const exportEpicFn = createServerFn({ method: "POST" })
  .inputValidator((data: { epicId: string }) => {
    if (!data.epicId) throw new Error("Epic ID is required");
    return data;
  })
  .handler(
    async ({
      data,
    }: {
      data: { epicId: string };
    }): Promise<ExportResponse | ExportErrorResponse> => {
      try {
        const exportData = gatherEpicExportData(sqlite, data.epicId);
        const zipBuffer = await createBrainDumpArchive(exportData);

        if (zipBuffer.length > MAX_ARCHIVE_SIZE_BYTES) {
          throw new ArchiveTooLargeError(zipBuffer.length, MAX_ARCHIVE_SIZE_BYTES);
        }

        const epicTitle = exportData.manifest.epics[0]?.title ?? "export";
        const slug = epicTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        return {
          success: true,
          filename: `${slug}.braindump`,
          base64Data: zipBuffer.toString("base64"),
          epicCount: exportData.manifest.epics.length,
          ticketCount: exportData.manifest.tickets.length,
          commentCount: exportData.manifest.comments.length,
        };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof CoreError ? err.message : `Unexpected error: ${(err as Error).message}`,
        };
      }
    }
  );

export const exportProjectFn = createServerFn({ method: "POST" })
  .inputValidator((data: { projectId: string }) => {
    if (!data.projectId) throw new Error("Project ID is required");
    return data;
  })
  .handler(
    async ({
      data,
    }: {
      data: { projectId: string };
    }): Promise<ExportResponse | ExportErrorResponse> => {
      try {
        const exportData = gatherProjectExportData(sqlite, data.projectId);
        const zipBuffer = await createBrainDumpArchive(exportData);

        if (zipBuffer.length > MAX_ARCHIVE_SIZE_BYTES) {
          throw new ArchiveTooLargeError(zipBuffer.length, MAX_ARCHIVE_SIZE_BYTES);
        }

        const projectName = exportData.manifest.sourceProject.name ?? "project-export";
        const slug = projectName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");

        return {
          success: true,
          filename: `${slug}.braindump`,
          base64Data: zipBuffer.toString("base64"),
          epicCount: exportData.manifest.epics.length,
          ticketCount: exportData.manifest.tickets.length,
          commentCount: exportData.manifest.comments.length,
        };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof CoreError ? err.message : `Unexpected error: ${(err as Error).message}`,
        };
      }
    }
  );

export const previewImportFn = createServerFn({ method: "POST" })
  .inputValidator((data: { base64Data: string }) => {
    if (!data.base64Data) throw new Error("File data is required");
    return data;
  })
  .handler(
    async ({
      data,
    }: {
      data: { base64Data: string };
    }): Promise<PreviewResponse | PreviewErrorResponse> => {
      try {
        const zipBuffer = Buffer.from(data.base64Data, "base64");

        if (zipBuffer.length > MAX_ARCHIVE_SIZE_BYTES) {
          throw new ArchiveTooLargeError(zipBuffer.length, MAX_ARCHIVE_SIZE_BYTES);
        }

        const preview = await previewBrainDumpArchive(zipBuffer);
        return { success: true, preview };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof CoreError ? err.message : `Unexpected error: ${(err as Error).message}`,
        };
      }
    }
  );

export const performImportFn = createServerFn({ method: "POST" })
  .inputValidator((data: ImportInput) => {
    if (!data.base64Data) throw new Error("File data is required");
    if (!data.targetProjectId) throw new Error("Target project ID is required");
    return data;
  })
  .handler(
    async ({ data }: { data: ImportInput }): Promise<ImportResponse | ImportErrorResponse> => {
      try {
        const zipBuffer = Buffer.from(data.base64Data, "base64");

        if (zipBuffer.length > MAX_ARCHIVE_SIZE_BYTES) {
          throw new ArchiveTooLargeError(zipBuffer.length, MAX_ARCHIVE_SIZE_BYTES);
        }

        const { manifest, attachmentBuffers } = await extractBrainDumpArchive(zipBuffer);

        const result = importData({
          db: sqlite,
          manifest,
          attachmentBuffers,
          targetProjectId: data.targetProjectId,
          resetStatuses: data.resetStatuses ?? false,
          conflictResolution: data.conflictResolution ?? "create-new",
        });

        return { success: true, result };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof CoreError ? err.message : `Unexpected error: ${(err as Error).message}`,
        };
      }
    }
  );
