import type Database from "better-sqlite3";
import { updatePrdForDbTicketIfPresent, type OptionalUpdatePrdResult } from "../../core/prd-sync";
import { submitFeedback, validateSubmitFeedback } from "../../core/review";
import type { FeedbackResult } from "../../core/types";

type DemoStepStatus = "pending" | "passed" | "failed" | "skipped";

export interface SubmitDemoFeedbackInput {
  ticketId: string;
  passed: boolean;
  feedback: string;
  stepResults?:
    | Array<{
        order: number;
        status: DemoStepStatus;
        notes?: string | undefined;
      }>
    | undefined;
}

interface SubmitDemoFeedbackPayload {
  success: true;
  ticketStatus: FeedbackResult["newStatus"];
  ticketId: string;
  prdSync: OptionalUpdatePrdResult;
}

export function syncFeedbackPrdPassMarker(
  sqlite: Database.Database,
  ticketId: string,
  passes: boolean
): OptionalUpdatePrdResult {
  return updatePrdForDbTicketIfPresent(sqlite, ticketId, passes);
}

function submitDemoFeedbackPayload(
  result: FeedbackResult,
  prdSync: OptionalUpdatePrdResult
): SubmitDemoFeedbackPayload {
  return {
    success: true,
    ticketStatus: result.newStatus,
    ticketId: result.ticketId,
    prdSync,
  };
}

export async function submitDemoFeedbackForDatabase(
  sqlite: Database.Database,
  input: SubmitDemoFeedbackInput
): Promise<SubmitDemoFeedbackPayload> {
  const { ticketId, passed, feedback, stepResults } = input;
  validateSubmitFeedback(sqlite, {
    ticketId,
    passed,
    feedback,
    ...(stepResults !== undefined ? { stepResults } : {}),
  });

  const prdSync = syncFeedbackPrdPassMarker(sqlite, ticketId, passed);
  if (!passed && prdSync.required && !prdSync.success) {
    throw new Error(`Cannot submit demo feedback because PRD sync failed: ${prdSync.message}`);
  }

  const result = submitFeedback(sqlite, {
    ticketId,
    passed,
    feedback,
    ...(stepResults !== undefined ? { stepResults } : {}),
  });

  return submitDemoFeedbackPayload(result, prdSync);
}
