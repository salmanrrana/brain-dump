import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  computeManifestIntegrity,
  type VerificationIntegrityStatus,
  type VerificationManifest,
  type VerificationRunStatus,
} from "../../core/verification.ts";
import type {
  VerificationExecutionSurface,
  VerificationProviderSource,
  VerifierIdentity,
} from "../../core/verifier-identity.ts";
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
  verifier: VerifierIdentity | null;
  manifest: VerificationManifest | null;
}

function durationMs(startedAt: string, finishedAt: string): number {
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
  return Math.max(0, finished - started);
}

const PROVIDER_SOURCES = new Set<VerificationProviderSource>([
  "explicit",
  "session",
  "telemetry",
  "environment",
  "unknown",
]);

const EXECUTION_SURFACES = new Set<VerificationExecutionSurface>([
  "boot-drain",
  "enqueue-drain",
  "resident-poller",
  "cli-direct",
]);

type VerificationRunIdentityRow = Pick<
  typeof verificationRuns.$inferSelect,
  "provider" | "actor" | "providerSource" | "executionSurface" | "workerId" | "codeGitSha"
>;

function isProviderSource(value: string | null): value is VerificationProviderSource {
  return value !== null && PROVIDER_SOURCES.has(value as VerificationProviderSource);
}

function isExecutionSurface(value: string | null): value is VerificationExecutionSurface {
  return value !== null && EXECUTION_SURFACES.has(value as VerificationExecutionSurface);
}

export function verifierFromRunRow(
  row: VerificationRunIdentityRow,
  manifest: VerificationManifest | null
): VerifierIdentity | null {
  if (manifest?.verifier) return manifest.verifier;
  const hasIdentityColumns =
    row.provider !== null ||
    row.actor !== null ||
    row.providerSource !== null ||
    row.executionSurface !== null ||
    row.workerId !== null ||
    row.codeGitSha !== null;
  if (!hasIdentityColumns) return null;

  const provider = row.provider ?? "unknown";
  return {
    provider,
    actor: (row.actor ?? `${provider} ralph`) as `${string} ralph`,
    providerSource: isProviderSource(row.providerSource) ? row.providerSource : "unknown",
    executionSurface: isExecutionSurface(row.executionSurface)
      ? row.executionSurface
      : "cli-direct",
    workerId: row.workerId ?? null,
    codeGitSha: row.codeGitSha ?? null,
  };
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
        verifier: verifierFromRunRow(row, manifest),
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
