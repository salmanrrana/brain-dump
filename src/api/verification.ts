import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  computeManifestIntegrity,
  type VerificationIntegrityStatus,
  type VerificationManifest,
  type VerificationRunStatus,
} from "../../core/verification.ts";
import { verificationJobs, verificationRuns } from "../lib/schema";

export type {
  VerificationEvidenceFile,
  VerificationIntegrityStatus,
  VerificationManifest,
  VerificationRunStatus,
  VerificationStepStatus,
  VerificationStepVerdict,
} from "../../core/verification.ts";
export type { VerificationJob, VerificationJobStatus } from "../../core/verification-queue.ts";

export interface VerificationRunSummary {
  id: string;
  ticketId: string;
  round: number;
  status: VerificationRunStatus;
  certified: boolean;
  integrityStatus: VerificationIntegrityStatus;
  gitSha: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  manifest: VerificationManifest | null;
}

function durationMs(startedAt: string, finishedAt: string): number {
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
  return Math.max(0, finished - started);
}

export const getVerificationRuns = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ticketId: z.string() }))
  .handler(async ({ data: { ticketId } }: { data: { ticketId: string } }) => {
    const { db } = await import("../lib/db");
    const rows = db
      .select()
      .from(verificationRuns)
      .where(eq(verificationRuns.ticketId, ticketId))
      .orderBy(desc(verificationRuns.round))
      .all();

    return rows.map((row): VerificationRunSummary => {
      const { manifest, integrityStatus } = computeManifestIntegrity({
        id: row.id,
        ticketId: row.ticketId,
        round: row.round,
        status: row.status,
        certified: row.certified,
        gitSha: row.gitSha,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        manifest: row.manifest,
      });

      return {
        id: row.id,
        ticketId: row.ticketId,
        round: row.round,
        status: row.status,
        certified: row.certified,
        integrityStatus,
        gitSha: row.gitSha,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        durationMs: durationMs(row.startedAt, row.finishedAt),
        manifest,
      };
    });
  });

export const getVerificationJobStatus = createServerFn({ method: "GET" })
  .inputValidator(z.object({ ticketId: z.string() }))
  .handler(async ({ data: { ticketId } }: { data: { ticketId: string } }) => {
    const { db } = await import("../lib/db");
    return db.select().from(verificationJobs).where(eq(verificationJobs.ticketId, ticketId)).get();
  });
