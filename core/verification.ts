import { randomUUID, createHmac } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import type {
  DbHandle,
  DemoStep,
  DemoStepAutomationValue,
  ExecFileNoThrowResult,
} from "./types.ts";
import type { DbDemoScriptRow, DbTicketRow } from "./db-rows.ts";
import { ValidationError, InvalidStateError, TicketNotFoundError } from "./errors.ts";
import { assertTransition, isTicketStatus, WorkflowTransitionError } from "./workflow-steps.ts";
import { getStateDir } from "./db.ts";
import { updatePrdForDbTicketIfPresent } from "./prd-sync.ts";
import { addComment, addVerificationReportComment } from "./comment.ts";
import { writeAttachmentFromFile } from "./attachments.ts";
import {
  handleEpicCompletionAutoPr,
  handleEpicCompletionLearnings,
  type HandleEpicCompletionAutoPrResult,
} from "./ship.ts";
import type { AttachmentType } from "./attachment-types.ts";
import { settleVerificationJob, settleVerificationJobForTicket } from "./verification-queue.ts";

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

export interface VerificationRun {
  id: string;
  ticketId: string;
  round: number;
  status: VerificationRunStatus;
  certified: boolean;
  manifest: VerificationManifest;
  gitSha: string | null;
  startedAt: string;
  finishedAt: string;
  epicAutoPr?: HandleEpicCompletionAutoPrResult;
}

export interface VerifyTicketParams {
  ticketId: string;
  provider?: string | undefined;
  projectPath?: string;
  baseUrl?: string;
  bootCommand?: string[];
  timeoutMs?: number;
  execFileNoThrow?: (
    command: string,
    args: string[],
    options?: { cwd?: string; timeoutMs?: number; maxBuffer?: number }
  ) => Promise<ExecFileNoThrowResult>;
  fetchImpl?: typeof fetch;
  verificationJobLease?: {
    jobId: string;
    workerId: string;
    attemptCount: number;
  };
}

interface BootedApp {
  baseUrl: string;
  port: number;
  command: string[];
  log: () => string;
  stop: () => Promise<void>;
}

interface FailedBootInfo {
  port: number;
  command: string[];
  bootLog: string;
}

class VerificationBootError extends ValidationError {
  readonly bootInfo: FailedBootInfo;

  constructor(message: string, bootInfo: FailedBootInfo) {
    super(message);
    this.name = "VerificationBootError";
    this.bootInfo = bootInfo;
  }
}

interface GitInfo {
  sha: string | null;
  dirty: boolean;
  changedFiles: string[];
}

const BODY_LIMIT = 16_384;
const BOOT_LOG_LIMIT = 8_192;
const DEFAULT_TIMEOUT_MS = 30_000;

function truncate(value: string, limit = BODY_LIMIT): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n...[truncated ${value.length - limit} bytes]`;
}

function hmac(value: string, key: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function hashEvidence(value: string, runId: string): string {
  return hmac(value, `brain-dump:verification:${runId}`);
}

function manifestHashFor(manifestBase: object, runId: string): string {
  return hmac(JSON.stringify(manifestBase), `brain-dump:manifest:${runId}`);
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

function parseManifestForIntegrity(value: string): VerificationManifest | null {
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

/**
 * Re-check a stored verification run against its sealed manifest.
 *
 * Owned by this module (which also seals manifests in buildRun) so the hash
 * derivation and serialization can never silently diverge between the sealer
 * and auditing viewers.
 */
export function computeManifestIntegrity(row: {
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
  const manifest = parseManifestForIntegrity(row.manifest);
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
  const expectedHash = manifestHashFor(manifestBase, manifest.runId);
  if (!rowMatchesManifest || expectedHash !== manifestHash) {
    return { manifest, integrityStatus: "tampered" };
  }

  return {
    manifest,
    integrityStatus: manifest.status === "uncertified" ? "uncertified-tripwire" : "valid",
  };
}

function getTicketRow(db: DbHandle, ticketId: string): DbTicketRow {
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as
    | DbTicketRow
    | undefined;
  if (!ticket) throw new TicketNotFoundError(ticketId);
  return ticket;
}

function getDemoScriptRow(db: DbHandle, ticketId: string): DbDemoScriptRow {
  const demo = db.prepare("SELECT * FROM demo_scripts WHERE ticket_id = ?").get(ticketId) as
    | DbDemoScriptRow
    | undefined;
  if (!demo) {
    throw new ValidationError(`Ticket ${ticketId} has no demo script to verify.`);
  }
  return demo;
}

function parseSteps(row: DbDemoScriptRow): DemoStep[] {
  try {
    const parsed = JSON.parse(row.steps) as unknown;
    if (!Array.isArray(parsed)) throw new Error("steps is not an array");
    return parsed as DemoStep[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(`Demo script ${row.id} has corrupted steps: ${message}`);
  }
}

function stringifyEvidenceRefs(evidenceFiles: VerificationEvidenceFile[]): string {
  if (evidenceFiles.length === 0) return "none";
  return evidenceFiles.map((file) => `${file.path} (${file.hash})`).join(", ");
}

function severityForFailedStep(step: DemoStep | undefined): "critical" | "major" {
  const assertions = step?.automation?.assert ?? [];
  return assertions.some((assertion) => {
    const extra = assertion as Record<string, unknown>;
    return extra.severity === "critical" || extra.criticality === "critical";
  })
    ? "critical"
    : "major";
}

function failedStepOrdersFromManifest(manifest: VerificationManifest): Set<number> {
  return new Set(
    manifest.stepVerdicts.filter((step) => step.status === "failed").map((step) => step.order)
  );
}

function parseVerificationManifest(value: string): VerificationManifest | null {
  try {
    const manifest = JSON.parse(value) as Partial<VerificationManifest>;
    if (!Array.isArray(manifest.stepVerdicts)) return null;
    return manifest as VerificationManifest;
  } catch {
    return null;
  }
}

function ensureWorkflowState(db: DbHandle, ticketId: string, phase: string, now: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO ticket_workflow_state
     (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
     VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?)`
  ).run(randomUUID(), ticketId, phase, now, now);
}

function latestThreeFailedRunsShareStep(db: DbHandle, ticketId: string): number | null {
  const rows = db
    .prepare(
      `SELECT status, manifest
       FROM verification_runs
       WHERE ticket_id = ?
       ORDER BY round DESC
       LIMIT 3`
    )
    .all(ticketId) as Array<{ status: string; manifest: string }>;
  if (rows.length < 3 || rows.some((row) => row.status !== "failed")) return null;

  const manifests = rows.map((row) => parseVerificationManifest(row.manifest));
  if (manifests.some((manifest) => manifest === null)) return null;

  const failedOrderSets = manifests.map((manifest) => failedStepOrdersFromManifest(manifest!));
  const [firstSet, ...remainingSets] = failedOrderSets;
  for (const order of firstSet ?? []) {
    if (remainingSets.every((set) => set.has(order))) return order;
  }
  return null;
}

function recordVerificationFindings(
  db: DbHandle,
  run: VerificationRun,
  steps: DemoStep[],
  now: string
): void {
  const workflowState = db
    .prepare("SELECT review_iteration FROM ticket_workflow_state WHERE ticket_id = ?")
    .get(run.ticketId) as { review_iteration: number } | undefined;
  ensureWorkflowState(db, run.ticketId, "implementation", now);
  const iteration = workflowState?.review_iteration ?? 0;
  const stepsByOrder = new Map(steps.map((step) => [step.order, step]));
  const failedVerdicts = run.manifest.stepVerdicts.filter((step) => step.status === "failed");

  for (const verdict of failedVerdicts) {
    const step = stepsByOrder.get(verdict.order);
    const description = [
      `Verification run ${run.id} failed step ${verdict.order}.`,
      step ? `Step: ${step.description}` : null,
      step ? `Expected: ${step.expectedOutcome}` : null,
      `Actual: ${verdict.message}`,
      `Evidence: ${stringifyEvidenceRefs(verdict.evidenceFiles)}`,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    db.prepare(
      `INSERT INTO review_findings
       (id, ticket_id, iteration, agent, severity, category, description, status, created_at)
       VALUES (?, ?, ?, 'code-reviewer', ?, 'verification', ?, 'open', ?)`
    ).run(randomUUID(), run.ticketId, iteration, severityForFailedStep(step), description, now);
  }

  if (failedVerdicts.length > 0) {
    db.prepare(
      "UPDATE ticket_workflow_state SET findings_count = findings_count + ?, updated_at = ? WHERE ticket_id = ?"
    ).run(failedVerdicts.length, now, run.ticketId);
  }
}

function updateDemoStepStatusesForRun(db: DbHandle, run: VerificationRun, steps: DemoStep[]): void {
  const verdictsByOrder = new Map(
    run.manifest.stepVerdicts.map((verdict) => [verdict.order, verdict])
  );
  const updatedSteps = steps.map((step) => {
    const verdict = verdictsByOrder.get(step.order);
    if (!verdict) return step;
    return {
      ...step,
      status: verdict.status,
      notes: verdict.message,
    };
  });

  db.prepare(
    "UPDATE demo_scripts SET steps = ?, completed_at = NULL, passed = NULL WHERE ticket_id = ?"
  ).run(JSON.stringify(updatedSteps), run.ticketId);
}

function nextRound(db: DbHandle, ticketId: string): number {
  const row = db
    .prepare("SELECT MAX(round) as maxRound FROM verification_runs WHERE ticket_id = ?")
    .get(ticketId) as { maxRound: number | null };
  return (row.maxRound ?? 0) + 1;
}

function toVerificationRun(row: {
  id: string;
  ticket_id: string;
  round: number;
  status: string;
  certified: number;
  manifest: string;
  git_sha: string | null;
  started_at: string;
  finished_at: string;
}): VerificationRun {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    round: row.round,
    status: row.status as VerificationRunStatus,
    certified: row.certified === 1,
    manifest: JSON.parse(row.manifest) as VerificationManifest,
    gitSha: row.git_sha,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function assertCanVerify(status: string): void {
  if (!isTicketStatus(status)) {
    throw new InvalidStateError("ticket", status, "known ticket status", "verify ticket");
  }
  try {
    assertTransition(status, "done", "verify-pass");
  } catch (error) {
    if (error instanceof WorkflowTransitionError) {
      throw new InvalidStateError("ticket", status, error.allowedFrom.join("|"), "verify ticket");
    }
    throw error;
  }
}

function resolveJsonPath(value: unknown, path: string): unknown {
  const normalized = path.startsWith("$.") ? path.slice(2) : path;
  if (!normalized) return value;
  return normalized.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function resolveAppUrl(target: string, baseUrl: string, label: string): string {
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(target) || target.startsWith("//")) {
    throw new ValidationError(`${label} must be an app-relative path.`);
  }
  const base = new URL(baseUrl);
  const url = new URL(normalizePath(target), base);
  if (url.origin !== base.origin) {
    throw new ValidationError(`${label} must resolve within the app origin.`);
  }
  return url.toString();
}

function evidenceDir(runId: string): string {
  const dir = join(getStateDir(), "verification", runId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function writeEvidence(runId: string, name: string, content: string): VerificationEvidenceFile {
  const path = join(evidenceDir(runId), name);
  writeFileSync(path, content, { mode: 0o600 });
  return { path, hash: hashEvidence(content, runId) };
}

function packageManagerCommand(projectPath: string, packageManagerArgs: string[]): string[] {
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return ["pnpm", ...packageManagerArgs];
  if (existsSync(join(projectPath, "yarn.lock"))) return ["yarn", ...packageManagerArgs];
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"))) {
    return ["bun", "run", ...packageManagerArgs];
  }
  return ["npm", "run", ...packageManagerArgs];
}

function directViteCommand(projectPath: string, port: number): string[] {
  const args = ["vite", "dev", "--host", "127.0.0.1", "--port", String(port)];
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return ["pnpm", "exec", ...args];
  if (existsSync(join(projectPath, "yarn.lock"))) return ["yarn", ...args];
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"))) {
    return ["bunx", ...args];
  }
  return ["npx", ...args];
}

function discoverBootCommand(projectPath: string, port: number): string[] {
  const packagePath = join(projectPath, "package.json");
  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (
      pkg.dependencies?.vite ||
      pkg.devDependencies?.vite ||
      pkg.dependencies?.["@tanstack/react-start"]
    ) {
      return directViteCommand(projectPath, port);
    }
    const script = pkg.scripts?.dev ? "dev" : pkg.scripts?.start ? "start" : null;
    if (!script) {
      throw new ValidationError(`No dev/start script found in ${packagePath}.`);
    }
    const args = ["--host", "127.0.0.1", "--port", String(port)];
    return packageManagerCommand(projectPath, [script, "--", ...args]);
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(`Unable to discover boot command from ${packagePath}: ${message}`);
  }
}

function choosePort(): number {
  return 42_400 + Math.floor(Math.random() * 1000);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(
  baseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<void> {
  const start = Date.now();
  let lastError = "server did not respond";
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetchImpl(baseUrl, { method: "GET" });
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(250);
  }
  throw new ValidationError(`Timed out waiting for app readiness at ${baseUrl}: ${lastError}`);
}

async function bootApp(params: {
  projectPath: string;
  baseUrl?: string;
  bootCommand?: string[];
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<BootedApp> {
  const url = params.baseUrl ? new URL(params.baseUrl) : null;
  const port = url?.port ? Number(url.port) : choosePort();
  const baseUrl = params.baseUrl ?? `http://127.0.0.1:${port}`;
  if (params.baseUrl) {
    await waitForReady(baseUrl, params.fetchImpl, params.timeoutMs);
    return {
      baseUrl,
      port,
      command: [],
      log: () => "external baseUrl supplied",
      stop: async () => {},
    };
  }

  const command = params.bootCommand ?? discoverBootCommand(params.projectPath, port);
  const child = spawn(command[0]!, command.slice(1), {
    cwd: params.projectPath,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      PLAYWRIGHT_E2E: "1",
      BRAIN_DUMP_VERIFY_BOOT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output = truncate(output + chunk.toString(), BOOT_LOG_LIMIT);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output = truncate(output + chunk.toString(), BOOT_LOG_LIMIT);
  });

  try {
    await waitForReady(baseUrl, params.fetchImpl, params.timeoutMs);
  } catch (error) {
    child.kill("SIGTERM");
    const message = error instanceof Error ? error.message : String(error);
    throw new VerificationBootError(message, { port, command, bootLog: output });
  }

  return {
    baseUrl,
    port,
    command,
    log: () => output,
    stop: async () => {
      if (child.exitCode !== null || child.killed) return;
      child.kill("SIGTERM");
      await sleep(100);
      if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
    },
  };
}

async function getGitInfo(
  projectPath: string,
  execFileNoThrow?: VerifyTicketParams["execFileNoThrow"]
): Promise<GitInfo> {
  if (!execFileNoThrow) return { sha: null, dirty: false, changedFiles: [] };
  const shaResult = await execFileNoThrow("git", ["rev-parse", "HEAD"], { cwd: projectPath });
  const statusResult = await execFileNoThrow("git", ["status", "--short"], { cwd: projectPath });
  const changedFiles = statusResult.success
    ? statusResult.stdout
        .split(/\r?\n/)
        .map((line) => line.slice(3).trim())
        .filter(Boolean)
    : [];
  return {
    sha: shaResult.success ? shaResult.stdout.trim() : null,
    dirty: statusResult.success ? changedFiles.length > 0 : true,
    changedFiles,
  };
}

function hasVerificationTripwireChange(changedFiles: string[]): boolean {
  return changedFiles.some(
    (file) =>
      file.startsWith("core/verification") ||
      file.startsWith("core/__tests__/verification") ||
      file.includes("manifest")
  );
}

async function runExecutableSteps(params: {
  projectPath: string;
  baseUrl?: string;
  bootCommand?: string[];
  fetchImpl: typeof fetch;
  timeoutMs: number;
  steps: DemoStep[];
  runId: string;
}): Promise<{ boot: BootedApp | null; verdicts: VerificationStepVerdict[] }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let boot: BootedApp | null = null;
    try {
      boot = await bootApp({
        projectPath: params.projectPath,
        ...(params.baseUrl !== undefined ? { baseUrl: params.baseUrl } : {}),
        ...(params.bootCommand !== undefined ? { bootCommand: params.bootCommand } : {}),
        fetchImpl: params.fetchImpl,
        timeoutMs: params.timeoutMs,
      });
      const verdicts: VerificationStepVerdict[] = [];
      for (const step of params.steps) {
        verdicts.push(await runStep(step, params.runId, boot.baseUrl, params.fetchImpl));
      }
      return { boot, verdicts };
    } catch (error) {
      lastError = error;
      await boot?.stop();
      if (attempt === 0) continue;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function runApiStep(
  step: DemoStep,
  runId: string,
  baseUrl: string,
  fetchImpl: typeof fetch
): Promise<VerificationStepVerdict> {
  if (!step.automation || step.automation.kind !== "api") {
    throw new ValidationError(`Step ${step.order} is missing API automation.`);
  }
  const start = Date.now();
  const request = step.automation.request;
  const url = resolveAppUrl(request.path, baseUrl, `Step ${step.order} API automation path`);
  const headers = request.headers ?? {};
  const requestInit: RequestInit = {
    method: request.method,
    headers,
    ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
  };
  const response = await fetchImpl(url, requestInit);
  const body = truncate(await response.text());
  const responseHeaders = Object.fromEntries(response.headers.entries());
  const failures: string[] = [];

  for (const assertion of step.automation.assert) {
    if (assertion.type === "status" && response.status !== assertion.expected) {
      failures.push(`expected status ${assertion.expected}, got ${response.status}`);
    } else if (assertion.type === "bodyContains" && !body.includes(String(assertion.expected))) {
      failures.push(`expected body to contain ${String(assertion.expected)}`);
    } else if (assertion.type === "jsonPath") {
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        failures.push("expected JSON body for jsonPath assertion");
        continue;
      }
      const actual = resolveJsonPath(json, String(assertion.expected).split("=")[0] ?? "");
      const expected = String(assertion.expected).includes("=")
        ? String(assertion.expected).split("=").slice(1).join("=")
        : assertion.expected;
      if (!valuesEqual(actual, expected)) {
        failures.push(
          `expected jsonPath ${String(assertion.expected)}, got ${JSON.stringify(actual)}`
        );
      }
    }
  }

  const evidence = writeEvidence(
    runId,
    `step-${step.order}-api.json`,
    JSON.stringify(
      {
        request: { method: request.method, url, headers, body: request.body },
        response: { status: response.status, headers: responseHeaders, body },
      },
      null,
      2
    )
  );

  return {
    order: step.order,
    status: failures.length === 0 ? "passed" : "failed",
    message: failures.length === 0 ? "API assertions passed." : failures.join("; "),
    durationMs: Date.now() - start,
    evidenceFiles: [evidence],
    request: { method: request.method, url, headers, body: request.body },
    response: { status: response.status, headers: responseHeaders, body },
  };
}

async function runUiStep(
  step: DemoStep,
  runId: string,
  baseUrl: string
): Promise<VerificationStepVerdict> {
  const start = Date.now();
  if (!step.automation || step.automation.kind !== "ui") {
    throw new ValidationError(`Step ${step.order} is missing UI automation.`);
  }
  const url = resolveAppUrl(
    step.automation.route,
    baseUrl,
    `Step ${step.order} UI automation route`
  );
  let playwright: typeof import("@playwright/test");
  try {
    playwright = await import("@playwright/test");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      order: step.order,
      status: "skipped",
      message: `UI verification uncertified: ${message}`,
      durationMs: Date.now() - start,
      evidenceFiles: [],
    };
  }

  const browser = await playwright.chromium.launch();
  const page = await browser.newPage();
  const failures: string[] = [];
  try {
    try {
      await page.goto(url);
      for (const action of step.automation.actions ?? []) {
        if (action.act === "click") await page.locator(action.selector ?? "").click();
        if (action.act === "fill")
          await page.locator(action.selector ?? "").fill(action.value ?? "");
        if (action.act === "press") await page.keyboard.press(action.value ?? "Enter");
        if (action.act === "waitFor") await page.locator(action.selector ?? "body").waitFor();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`UI action failed: ${message}`);
    }

    for (const assertion of step.automation.assert) {
      try {
        if (assertion.type === "visible") {
          const visible = await page
            .locator(assertion.selector ?? "body")
            .first()
            .isVisible();
          if (!visible) failures.push(`expected ${assertion.selector ?? "body"} to be visible`);
        }
        if (assertion.type === "text") {
          const text = await page
            .locator(assertion.selector ?? "body")
            .first()
            .textContent();
          if (!text?.includes(assertion.expected ?? "")) {
            failures.push(
              `expected ${assertion.selector ?? "body"} to contain ${assertion.expected}`
            );
          }
        }
        if (assertion.type === "url" && !page.url().includes(assertion.expected ?? "")) {
          failures.push(`expected URL to contain ${assertion.expected}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`UI assertion failed: ${message}`);
      }
    }

    const screenshotPath = join(evidenceDir(runId), `step-${step.order}-ui.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const evidenceContent = readFileSync(screenshotPath).toString("base64");
    return {
      order: step.order,
      status: failures.length === 0 ? "passed" : "failed",
      message: failures.length === 0 ? "UI assertions passed." : failures.join("; "),
      durationMs: Date.now() - start,
      evidenceFiles: [{ path: screenshotPath, hash: hashEvidence(evidenceContent, runId) }],
    };
  } finally {
    await browser.close();
  }
}

async function runStep(
  step: DemoStep,
  runId: string,
  baseUrl: string,
  fetchImpl: typeof fetch
): Promise<VerificationStepVerdict> {
  if (step.type === "manual") {
    return {
      order: step.order,
      status: "skipped",
      message: "Manual steps cannot be certified by the verification runner.",
      durationMs: 0,
      evidenceFiles: [],
    };
  }
  if (step.automation?.kind === "api") return await runApiStep(step, runId, baseUrl, fetchImpl);
  if (step.automation?.kind === "ui") return await runUiStep(step, runId, baseUrl);
  throw new ValidationError(`Step ${step.order} has no executable automation spec.`);
}

function summarizeStatus(verdicts: VerificationStepVerdict[]): VerificationRunStatus {
  if (verdicts.some((step) => step.status === "failed")) return "failed";
  if (verdicts.some((step) => step.status === "skipped")) return "uncertified";
  return "passed";
}

function persistRun(db: DbHandle, run: VerificationRun): void {
  db.prepare(
    `INSERT INTO verification_runs
     (id, ticket_id, round, status, certified, manifest, git_sha, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    run.id,
    run.ticketId,
    run.round,
    run.status,
    run.certified ? 1 : 0,
    JSON.stringify(run.manifest),
    run.gitSha,
    run.startedAt,
    run.finishedAt
  );
}

function evidenceAttachmentType(path: string): AttachmentType {
  if (path.endsWith("manifest.json")) return "verification-manifest";
  if (path.endsWith(".png")) return "verification-screenshot";
  return "api-evidence";
}

function attachRunEvidenceAndReport(
  db: DbHandle,
  run: VerificationRun,
  provider: string | undefined
): void {
  const reportProvider = provider ?? process.env.BRAIN_DUMP_PROVIDER ?? "unknown";
  const evidenceFiles = [
    ...run.manifest.evidenceFiles,
    {
      path: join(getStateDir(), "verification", run.id, "manifest.json"),
      hash: run.manifest.manifestHash,
    },
  ];
  const attachmentIdsByPath = new Map<string, string>();

  for (const evidence of evidenceFiles) {
    if (!existsSync(evidence.path)) {
      throw new ValidationError(
        `Verification evidence file is missing and cannot be reported: ${evidence.path}`
      );
    }
    const attachment = writeAttachmentFromFile(db, {
      ticketId: run.ticketId,
      filePath: evidence.path,
      metadata: {
        type: evidenceAttachmentType(evidence.path),
        priority: "primary",
        provider: reportProvider,
        description: `Verification run ${run.id} evidence (${evidence.hash})`,
      },
    });
    attachmentIdsByPath.set(evidence.path, attachment.id);
  }

  addVerificationReportComment(db, {
    ticketId: run.ticketId,
    provider: reportProvider,
    runId: run.id,
    status: run.status,
    integrityStatus: run.certified ? "valid" : "uncertified",
    manifestAttachmentId: attachmentIdsByPath.get(
      join(getStateDir(), "verification", run.id, "manifest.json")
    ),
    summary: `Verification run ${run.id} ${run.status}${run.certified ? " with certified evidence" : " without certification"}.`,
    steps: run.manifest.stepVerdicts.map((step) => ({
      order: step.order,
      status: step.status,
      actual: step.message,
      evidenceAttachments: step.evidenceFiles
        .map((file) => attachmentIdsByPath.get(file.path))
        .filter((id): id is string => typeof id === "string"),
    })),
  });
}

function completeTicketIfCertified(db: DbHandle, ticketId: string, now: string): void {
  db.prepare(
    `UPDATE tickets
     SET status = 'done', completed_at = ?, updated_at = ?, is_blocked = 0, blocked_reason = NULL
     WHERE id = ?`
  ).run(now, now, ticketId);
  db.prepare(
    "UPDATE ticket_workflow_state SET current_phase = 'done', updated_at = ? WHERE ticket_id = ?"
  ).run(now, ticketId);
  db.prepare("UPDATE demo_scripts SET completed_at = ?, passed = 1 WHERE ticket_id = ?").run(
    now,
    ticketId
  );
  updatePrdForDbTicketIfPresent(db, ticketId, true);
}

function blockTicket(db: DbHandle, ticketId: string, reason: string, now: string): void {
  db.prepare(
    "UPDATE tickets SET is_blocked = 1, blocked_reason = ?, updated_at = ? WHERE id = ?"
  ).run(reason, now, ticketId);
}

function blockTicketAfterRepeatedVerificationFailures(
  db: DbHandle,
  run: VerificationRun,
  stepOrder: number,
  now: string
): void {
  ensureWorkflowState(db, run.ticketId, "ai_verification", now);
  const reason = `Verification failed 3 consecutive times on step ${stepOrder}. Latest run: ${run.id}. Evidence: ${stringifyEvidenceRefs(
    run.manifest.stepVerdicts.find((step) => step.order === stepOrder)?.evidenceFiles ?? []
  )}`;
  blockTicket(db, run.ticketId, reason, now);
  addComment(db, {
    ticketId: run.ticketId,
    author: "brain-dump",
    type: "comment",
    content: `## Needs Attention\n\n${reason}\n\nThe ticket remains in AI verification and is blocked to prevent an infinite repair loop.`,
  });
}

function returnTicketToImplementationAfterVerificationFailure(
  db: DbHandle,
  run: VerificationRun,
  now: string
): void {
  const ticket = getTicketRow(db, run.ticketId);
  if (!isTicketStatus(ticket.status)) {
    throw new InvalidStateError("ticket", ticket.status, "known ticket status", "verify-fail");
  }
  try {
    assertTransition(ticket.status, "in_progress", "verify-fail");
  } catch (error) {
    if (error instanceof WorkflowTransitionError) {
      throw new InvalidStateError(
        "ticket",
        ticket.status,
        error.allowedFrom.join("|"),
        "verify-fail"
      );
    }
    throw error;
  }

  ensureWorkflowState(db, run.ticketId, "implementation", now);
  db.prepare(
    `UPDATE tickets
     SET status = 'in_progress', completed_at = NULL, is_blocked = 0, blocked_reason = NULL, updated_at = ?
     WHERE id = ?`
  ).run(now, run.ticketId);
  db.prepare(
    "UPDATE ticket_workflow_state SET current_phase = 'implementation', demo_generated = 0, updated_at = ? WHERE ticket_id = ?"
  ).run(now, run.ticketId);
  updatePrdForDbTicketIfPresent(db, run.ticketId, false);
}

async function buildRun(
  db: DbHandle,
  params: VerifyTicketParams,
  statusOverride?: VerificationRunStatus,
  messageOverride?: string
): Promise<VerificationRun> {
  const ticket = getTicketRow(db, params.ticketId);
  assertCanVerify(ticket.status);
  const demo = getDemoScriptRow(db, params.ticketId);
  const steps = parseSteps(demo);
  const actualProjectPath =
    params.projectPath ??
    (
      db.prepare("SELECT path FROM projects WHERE id = ?").get(ticket.project_id) as {
        path: string;
      }
    ).path;
  const runId = randomUUID();
  const round = nextRound(db, params.ticketId);
  const startedAt = new Date().toISOString();
  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const gitInfo = await getGitInfo(actualProjectPath, params.execFileNoThrow);
  let boot: BootedApp | null = null;
  let failedBootInfo: FailedBootInfo | null = null;
  let verdicts: VerificationStepVerdict[] = [];
  let status = statusOverride ?? "infra_error";

  try {
    if (statusOverride) {
      verdicts = [
        {
          order: 0,
          status: "failed",
          message: messageOverride ?? statusOverride,
          durationMs: 0,
          evidenceFiles: [],
        },
      ];
    } else {
      const result = await runExecutableSteps({
        projectPath: actualProjectPath,
        ...(params.baseUrl !== undefined ? { baseUrl: params.baseUrl } : {}),
        ...(params.bootCommand !== undefined ? { bootCommand: params.bootCommand } : {}),
        fetchImpl,
        timeoutMs,
        steps,
        runId,
      });
      boot = result.boot;
      verdicts = result.verdicts;
      if (hasVerificationTripwireChange(gitInfo.changedFiles)) {
        verdicts.push({
          order: 0,
          status: "skipped",
          message:
            "Verification run uncertified because the diff touches verification/manifest code.",
          durationMs: 0,
          evidenceFiles: [],
        });
      }
      status = summarizeStatus(verdicts);
    }
  } catch (error) {
    if (error instanceof VerificationBootError) {
      failedBootInfo = error.bootInfo;
    }
    const message = error instanceof Error ? error.message : String(error);
    status = "infra_error";
    verdicts = [{ order: 0, status: "failed", message, durationMs: 0, evidenceFiles: [] }];
  } finally {
    await boot?.stop();
  }

  const finishedAt = new Date().toISOString();
  const certified = status === "passed";
  const evidenceFiles = verdicts.flatMap((step) => step.evidenceFiles);
  const manifestBase = {
    runId,
    ticketId: params.ticketId,
    round,
    status,
    certified,
    gitSha: gitInfo.sha,
    dirty: gitInfo.dirty,
    port:
      boot?.port ??
      failedBootInfo?.port ??
      (params.baseUrl ? Number(new URL(params.baseUrl).port || 80) : 0),
    bootCommand: boot?.command ?? failedBootInfo?.command ?? params.bootCommand ?? [],
    bootLog: boot?.log() ?? failedBootInfo?.bootLog ?? "",
    startedAt,
    finishedAt,
    stepVerdicts: verdicts,
    evidenceFiles,
  };
  const manifestHash = manifestHashFor(manifestBase, runId);
  const manifest = { ...manifestBase, manifestHash };
  writeEvidence(runId, "manifest.json", JSON.stringify(manifest, null, 2));

  return {
    id: runId,
    ticketId: params.ticketId,
    round,
    status,
    certified,
    manifest,
    gitSha: gitInfo.sha,
    startedAt,
    finishedAt,
  };
}

export async function verifyTicket(
  db: DbHandle,
  params: VerifyTicketParams
): Promise<VerificationRun> {
  const demo = getDemoScriptRow(db, params.ticketId);
  const steps = parseSteps(demo);
  const run = await buildRun(db, params);
  const now = run.finishedAt;
  const shouldHandleEpicCompletion = run.status === "passed" && run.certified;

  const settleJob = (
    status: "succeeded" | "failed" | "blocked",
    options: { error?: string; now?: string } = {}
  ): void => {
    if (params.verificationJobLease) {
      settleVerificationJob(db, {
        jobId: params.verificationJobLease.jobId,
        workerId: params.verificationJobLease.workerId,
        attemptCount: params.verificationJobLease.attemptCount,
        status,
        ...options,
      });
      return;
    }
    settleVerificationJobForTicket(db, params.ticketId, status, options);
  };

  db.transaction(() => {
    persistRun(db, run);
    attachRunEvidenceAndReport(db, run, params.provider);

    if (run.status === "passed" && run.certified) {
      completeTicketIfCertified(db, params.ticketId, now);
      settleJob("succeeded", { now });
    } else if (run.status === "failed") {
      recordVerificationFindings(db, run, steps, now);
      updateDemoStepStatusesForRun(db, run, steps);
      const blockedStepOrder = latestThreeFailedRunsShareStep(db, params.ticketId);
      if (blockedStepOrder === null) {
        returnTicketToImplementationAfterVerificationFailure(db, run, now);
        settleJob("failed", {
          now,
          error: "Verification assertions failed; ticket returned to implementation.",
        });
      } else {
        blockTicketAfterRepeatedVerificationFailures(db, run, blockedStepOrder, now);
        settleJob("blocked", {
          now,
          error: `Repeated verification failure on step ${blockedStepOrder}.`,
        });
      }
    } else if (run.status === "uncertified" || run.status === "infra_error") {
      const blockedReason = `Verification ${run.status}: ${run.manifest.stepVerdicts[0]?.message ?? "see manifest"}`;
      blockTicket(db, params.ticketId, blockedReason, now);
      settleJob("blocked", { now, error: blockedReason });
    }
  })();
  if (shouldHandleEpicCompletion) {
    handleEpicCompletionLearnings({ completedTicketId: params.ticketId }, { db });
    const epicAutoPr = await handleEpicCompletionAutoPr(
      { completedTicketId: params.ticketId },
      {
        db,
        ...(params.execFileNoThrow ? { execFileNoThrow: params.execFileNoThrow } : {}),
      }
    );
    return { ...run, epicAutoPr };
  }
  return run;
}

export function listVerificationRuns(db: DbHandle, ticketId: string): VerificationRun[] {
  getTicketRow(db, ticketId);
  const rows = db
    .prepare("SELECT * FROM verification_runs WHERE ticket_id = ? ORDER BY round DESC")
    .all(ticketId) as Array<{
    id: string;
    ticket_id: string;
    round: number;
    status: string;
    certified: number;
    manifest: string;
    git_sha: string | null;
    started_at: string;
    finished_at: string;
  }>;
  return rows.map(toVerificationRun);
}

export const verificationTestInternals = {
  resolveJsonPath,
  summarizeStatus,
  hashEvidence,
  attachRunEvidenceAndReport,
  discoverBootCommand,
};
