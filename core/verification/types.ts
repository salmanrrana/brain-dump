/**
 * Shared Verification data contracts.
 *
 * Leaf module: implementation files (run, lifecycle, ops, worker, queue)
 * import these types from here so the cluster stays an acyclic graph.
 */
import type { DemoStepAutomationValue } from "../types.ts";
import type { HandleEpicCompletionAutoPrResult } from "../ship.ts";
import type { VerifierIdentity } from "../verifier-identity.ts";

export type VerificationRunStatus = "passed" | "failed" | "uncertified" | "infra_error";
export type VerificationStepStatus = "passed" | "failed" | "skipped";
export type VerificationIntegrityStatus = "valid" | "tampered" | "uncertified-tripwire";

export interface VerificationEvidenceFile {
  path: string;
  hash: string;
}

export interface VerificationStepVerdict {
  order: number;
  status: VerificationStepStatus;
  message: string;
  durationMs: number;
  evidenceFiles: VerificationEvidenceFile[];
  /** Stable identity for the assertion target across demo step renumbering. */
  automationKey?: string;
  /** Automation adapter that produced this verdict. */
  automationKind?: "api" | "ui" | "command" | "file";
  /** Stable identities for the assertion and non-assertion conditions that failed. */
  failureKeys?: string[];
  /** HMAC of a file step's inspected contents, used to bind generated artifacts to final state. */
  verifiedFileHash?: string | null;
  /** Internal assertion indexes, removed after stable failure keys are derived. */
  failedAssertionIndexes?: number[];
  request?: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    // JSON-shaped (mirrors DemoStepApiAutomation.request.body) so run summaries
    // stay serializable across the server-function boundary.
    body?: DemoStepAutomationValue | undefined;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
}

export interface VerificationManifest {
  /** False when retrying without repairing the checkout cannot make progress. */
  retryable?: boolean;
  runId: string;
  ticketId: string;
  round: number;
  status: VerificationRunStatus;
  certified: boolean;
  gitSha: string | null;
  dirty: boolean;
  /**
   * SHA-256 over the uncommitted diff plus untracked file names, modes, and
   * contents when the
   * worktree is dirty. gitSha alone cannot pin what a dirty run actually
   * verified; this makes the sealed evidence reproducible or at least
   * comparable across runs.
   */
  dirtyDiffHash?: string | null;
  port: number;
  bootCommand: string[];
  bootCwd?: string;
  bootLog: string;
  startedAt: string;
  finishedAt: string;
  stepVerdicts: VerificationStepVerdict[];
  evidenceFiles: VerificationEvidenceFile[];
  verifier: VerifierIdentity;
  manifestHash: string;
}

export interface VerificationRun {
  id: string;
  ticketId: string;
  round: number;
  status: VerificationRunStatus;
  certified: boolean;
  manifest: VerificationManifest;
  gitSha: string | null;
  identity: VerifierIdentity;
  startedAt: string;
  finishedAt: string;
  epicAutoPr?: HandleEpicCompletionAutoPrResult;
}
