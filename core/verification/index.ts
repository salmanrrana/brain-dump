/**
 * Public interface of the Verification module.
 *
 * The lifecycle verbs and adapter-facing data contracts are the seam; the
 * implementation files (run, lifecycle, ops, queue, worker) are internal.
 * Adapters — server functions, MCP tools, CLI, app boot — import from here
 * only.
 */

// Run surface: execute a ticket verification and read past runs.
export { listVerificationRuns, listVerificationRunSummaries, verifyTicket } from "./run.ts";
export type { VerifyTicketParams, VerificationRunSummary } from "./run.ts";

// Shared data contracts.
export type {
  VerificationIntegrityStatus,
  VerificationEvidenceFile,
  VerificationManifest,
  VerificationRun,
  VerificationRunStatus,
  VerificationStepStatus,
  VerificationStepVerdict,
} from "./types.ts";

// Job queue: enqueue, inspect, lease state.
export { enqueueVerificationJob, getVerificationJob } from "./queue.ts";
export type { VerificationJob, VerificationJobStatus } from "./queue.ts";

// Operations: reconciliation, failure resolution, worker pause/dead-letter controls.
export {
  getVerificationOperationsStatus,
  markVerificationJobDead,
  reconcileVerificationTicketStates,
  resolveVerificationFailure,
  requeueVerificationJob,
  setVerificationWorkerPaused,
  summarizeVerificationJobsForOps,
  VERIFICATION_FAILURE_RESOLUTION_CLASSIFICATIONS,
} from "./ops.ts";
export type {
  ResolveVerificationFailureResult,
  VerificationFailureResolutionClassification,
} from "./ops.ts";

// Worker: background runner and detached drain lifecycle.
export {
  drainVerificationQueue,
  isVerificationExecutionAllowedFromEnv,
  resolveBrainDumpRootFrom,
  runNextVerificationJob,
  shouldStartVerificationWorkerFromEnv,
  spawnDetachedVerificationDrain,
  spawnDetachedVerificationDrainIfNeeded,
  startVerificationWorker,
} from "./worker.ts";
