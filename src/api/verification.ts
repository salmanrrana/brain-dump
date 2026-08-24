import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  listVerificationRunSummaries,
  type VerificationManifest,
  type VerificationRunSummary,
} from "../../core/verification/index.ts";
import {
  verifierFromLegacyRunColumns,
  type VerifierIdentity,
} from "../../core/verifier-identity.ts";
import { verificationJobs, verificationRuns } from "../lib/schema";

export type {
  VerificationEvidenceFile,
  VerificationIntegrityStatus,
  VerificationManifest,
  VerificationRunStatus,
  VerificationRunSummary,
  VerificationStepStatus,
  VerificationStepVerdict,
} from "../../core/verification/index.ts";
export type { VerificationJob, VerificationJobStatus } from "../../core/verification/index.ts";

type VerificationRunIdentityRow = Pick<
  typeof verificationRuns.$inferSelect,
  "provider" | "actor" | "providerSource" | "executionSurface" | "workerId" | "codeGitSha"
>;

/** Thin adapter over the core resolver so existing tests/imports keep working. */
export function verifierFromRunRow(
  row: VerificationRunIdentityRow,
  manifest: VerificationManifest | null
): VerifierIdentity | null {
  return verifierFromLegacyRunColumns(row, manifest);
}

export const getVerificationRuns = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ticketId: z.string() }))
  .handler(async ({ data: { ticketId } }: { data: { ticketId: string } }) => {
    const { sqlite } = await import("../lib/db");
    return listVerificationRunSummaries(sqlite, ticketId) satisfies VerificationRunSummary[];
  });

export const getVerificationJobStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ticketId: z.string() }))
  .handler(async ({ data: { ticketId } }: { data: { ticketId: string } }) => {
    const { db } = await import("../lib/db");
    return db.select().from(verificationJobs).where(eq(verificationJobs.ticketId, ticketId)).get();
  });
