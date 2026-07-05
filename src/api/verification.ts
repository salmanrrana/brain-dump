import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { createHmac } from "crypto";
import { z } from "zod";
import { verificationRuns } from "../lib/schema";

export type VerificationRunStatus = "passed" | "failed" | "uncertified" | "infra_error";
export type VerificationStepStatus = "passed" | "failed" | "skipped";
export type VerificationIntegrityStatus = "valid" | "tampered" | "uncertified-tripwire";

export interface VerificationEvidenceFile {
  path: string;
  hash: string;
}

type VerificationBody =
  | string
  | number
  | boolean
  | VerificationBody[]
  | { [key: string]: VerificationBody };

export interface VerificationStepVerdict {
  order: number;
  status: VerificationStepStatus;
  message: string;
  durationMs: number;
  evidenceFiles: VerificationEvidenceFile[];
  request?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: VerificationBody;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
}

export interface VerificationManifest {
  runId: string;
  ticketId: string;
  round: number;
  status: VerificationRunStatus;
  certified: boolean;
  gitSha: string | null;
  dirty: boolean;
  port: number;
  bootCommand: string[];
  bootLog: string;
  startedAt: string;
  finishedAt: string;
  stepVerdicts: VerificationStepVerdict[];
  evidenceFiles: VerificationEvidenceFile[];
  manifestHash: string;
}

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

function hmac(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function isEvidenceFile(value: unknown): value is VerificationEvidenceFile {
  const file = value as Partial<VerificationEvidenceFile>;
  return typeof file.path === "string" && typeof file.hash === "string";
}

function isStepVerdict(value: unknown): value is VerificationStepVerdict {
  const step = value as Partial<VerificationStepVerdict>;
  return (
    typeof step.order === "number" &&
    (step.status === "passed" || step.status === "failed" || step.status === "skipped") &&
    typeof step.message === "string" &&
    typeof step.durationMs === "number" &&
    Array.isArray(step.evidenceFiles) &&
    step.evidenceFiles.every(isEvidenceFile)
  );
}

function parseManifest(value: string): VerificationManifest | null {
  try {
    const manifest = JSON.parse(value) as Partial<VerificationManifest>;
    if (typeof manifest.runId !== "string") return null;
    if (typeof manifest.ticketId !== "string") return null;
    if (typeof manifest.round !== "number") return null;
    if (
      manifest.status !== "passed" &&
      manifest.status !== "failed" &&
      manifest.status !== "uncertified" &&
      manifest.status !== "infra_error"
    ) {
      return null;
    }
    if (typeof manifest.certified !== "boolean") return null;
    if (typeof manifest.manifestHash !== "string") return null;
    if (!Array.isArray(manifest.stepVerdicts) || !manifest.stepVerdicts.every(isStepVerdict)) {
      return null;
    }
    if (!Array.isArray(manifest.evidenceFiles) || !manifest.evidenceFiles.every(isEvidenceFile)) {
      return null;
    }
    return manifest as VerificationManifest;
  } catch {
    return null;
  }
}

function computeIntegrityStatus(row: {
  id: string;
  ticketId: string;
  round: number;
  status: string;
  certified: boolean;
  gitSha: string | null;
  startedAt: string;
  finishedAt: string;
  manifest: string;
}): { manifest: VerificationManifest | null; integrityStatus: VerificationIntegrityStatus } {
  const manifest = parseManifest(row.manifest);
  if (!manifest) {
    return { manifest: null, integrityStatus: "tampered" };
  }

  const rowMatchesManifest =
    manifest.runId === row.id &&
    manifest.ticketId === row.ticketId &&
    manifest.round === row.round &&
    manifest.status === row.status &&
    manifest.certified === row.certified &&
    manifest.gitSha === row.gitSha &&
    manifest.startedAt === row.startedAt &&
    manifest.finishedAt === row.finishedAt;

  const { manifestHash, ...manifestBase } = manifest;
  const expectedHash = hmac(JSON.stringify(manifestBase), `brain-dump:manifest:${manifest.runId}`);
  if (!rowMatchesManifest || expectedHash !== manifestHash) {
    return { manifest, integrityStatus: "tampered" };
  }

  return {
    manifest,
    integrityStatus: manifest.status === "uncertified" ? "uncertified-tripwire" : "valid",
  };
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
      const { manifest, integrityStatus } = computeIntegrityStatus({
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
