/**
 * Server function wrappers for workflow operations.
 *
 * This module ONLY contains createServerFn exports so TanStack Start
 * can fully code-split it for client/server. The raw workflow functions
 * live in start-ticket-workflow.ts (server-only module).
 *
 * Client components (AppLayout, EpicModal, EditTicketModal) should import
 * from THIS module, never from start-ticket-workflow.ts directly.
 */

import { createServerFn } from "@tanstack/react-start";
import { startTicketWorkflow, startEpicWorkflow } from "./start-ticket-workflow";

/**
 * Server function to start ticket workflow from the UI.
 * Called by EditTicketModal before launching AI.
 */
export const startTicketWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator((data: { ticketId: string; projectPath: string }) => data)
  .handler(async ({ data }: { data: { ticketId: string; projectPath: string } }) => {
    return startTicketWorkflow(data.ticketId, data.projectPath);
  });

/**
 * Server function to start epic workflow from the UI.
 * Called by EpicModal and sidebar epic launch before launching Ralph.
 */
export const startEpicWorkflowFn = createServerFn({ method: "POST" })
  .inputValidator((data: { epicId: string; projectPath: string }) => data)
  .handler(async ({ data }: { data: { epicId: string; projectPath: string } }) => {
    return startEpicWorkflow(data.epicId, data.projectPath);
  });
