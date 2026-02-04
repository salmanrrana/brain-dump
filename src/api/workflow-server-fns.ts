/**
 * Server function wrappers for workflow operations.
 *
 * This module ONLY contains createServerFn exports so TanStack Start
 * can fully code-split it for client/server. Business logic lives in
 * core/workflow.ts; this layer catches thrown errors and converts them
 * to the {success, error, warnings} shape the UI expects.
 *
 * Client components (AppLayout, EpicModal, EditTicketModal) should import
 * from THIS module.
 */

import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "../lib/db";
import { startWork, startEpicWork, createRealGitOperations, CoreError } from "../../core/index.ts";

const git = createRealGitOperations();

/**
 * Server function to start ticket workflow from the UI.
 * Called by EditTicketModal before launching AI.
 */
export const startTicketWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator((data: { ticketId: string; projectPath: string }) => data)
  .handler(async ({ data }: { data: { ticketId: string; projectPath: string } }) => {
    try {
      const result = startWork(sqlite, data.ticketId, git);
      return {
        success: true as const,
        branchName: result.branch,
        branchCreated: result.branchCreated,
        usingEpicBranch: result.usingEpicBranch,
        warnings: result.warnings,
      };
    } catch (err) {
      return {
        success: false as const,
        warnings: [] as string[],
        error:
          err instanceof CoreError ? err.message : `Unexpected error: ${(err as Error).message}`,
      };
    }
  });

/**
 * Server function to start epic workflow from the UI.
 * Called by EpicModal and sidebar epic launch before launching Ralph.
 */
export const startEpicWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator((data: { epicId: string; projectPath: string }) => data)
  .handler(async ({ data }: { data: { epicId: string; projectPath: string } }) => {
    try {
      const result = startEpicWork(sqlite, data.epicId, git);
      return {
        success: true as const,
        branchName: result.branch,
        branchCreated: result.branchCreated,
        warnings: result.warnings,
      };
    } catch (err) {
      return {
        success: false as const,
        warnings: [] as string[],
        error:
          err instanceof CoreError ? err.message : `Unexpected error: ${(err as Error).message}`,
      };
    }
  });
