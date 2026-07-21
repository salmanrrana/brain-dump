import { randomUUID, createHash, createHmac } from "crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "fs";
import { lstat, readlink } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createServer } from "net";
import type {
  DbHandle,
  DemoAppBoot,
  DemoStep,
  DemoStepAutomationValue,
  ExecFileNoThrowOptions,
  ExecFileNoThrowResult,
} from "./types.ts";
import type { DbDemoScriptRow, DbTicketRow } from "./db-rows.ts";
import { ValidationError, InvalidStateError, TicketNotFoundError } from "./errors.ts";
import { assertTransition, isTicketStatus, WorkflowTransitionError } from "./workflow-steps.ts";
import { getStateDir } from "./db.ts";
import {
  execFileNoThrow as defaultExecFileNoThrow,
  type HandleEpicCompletionAutoPrResult,
} from "./ship.ts";
import {
  attachRunEvidenceAndReport,
  settleVerificationLifecycle,
  type VerificationJobLease,
} from "./verification-lifecycle.ts";
import {
  MANUAL_STEP_SKIP_MESSAGE,
  UNCERTIFIED_COVERAGE_RATIONALE_MESSAGE,
  UNCERTIFIED_TRIPWIRE_MESSAGE,
} from "./verification-messages.ts";
import { getActiveVerificationLease } from "./verification-queue.ts";
import {
  DEMO_COMMAND_MAX_TIMEOUT_MS,
  readProjectVerifyCommandTemplates,
  validateDemoAppBootArgv,
  validateNonShellArgv,
  validateProjectRelativePath,
  validateSafeAutomationFilePath,
} from "./review.ts";
import {
  resolveVerifierIdentity,
  verifierFromLegacyRunColumns,
  type VerifierIdentity,
  type VerificationExecutionSurface,
  type VerificationProviderSource,
} from "./verifier-identity.ts";

export type VerificationRunStatus = "passed" | "failed" | "uncertified" | "infra_error";
export type VerificationStepStatus = "passed" | "failed" | "skipped";
export type VerificationIntegrityStatus = "valid" | "tampered" | "uncertified-tripwire";

const VERIFIER_CODE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

export interface VerifyTicketParams {
  ticketId: string;
  provider?: string | undefined;
  projectPath?: string;
  baseUrl?: string;
  bootCommand?: string[];
  bootCwd?: string;
  timeoutMs?: number;
  execFileNoThrow?: (
    command: string,
    args: string[],
    options?: ExecFileNoThrowOptions
  ) => Promise<ExecFileNoThrowResult>;
  fetchImpl?: typeof fetch;
  verificationJobLease?: VerificationJobLease;
  executionSurface?: VerificationExecutionSurface;
}

interface BootedApp {
  baseUrl: string;
  port: number;
  command: string[];
  cwd: string;
  log: () => string;
  stop: () => Promise<void>;
}

interface FailedBootInfo {
  port: number;
  command: string[];
  cwd: string;
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
  dirtyDiffHash: string | null;
  worktreeSealFailed: boolean;
  dirtyFiles: string[];
  untrackedFiles: string[];
  changedFiles: string[];
}

interface BrowserSplashSkipResult {
  ok: boolean;
  error?: string;
}

const BODY_LIMIT = 16_384;
const BOOT_LOG_LIMIT = 8_192;
const COMMAND_OUTPUT_LIMIT = 16_384;
const COMMAND_EXEC_BUFFER_LIMIT = 16 * 1024 * 1024;
const UNTRACKED_HASH_BYTE_LIMIT = 32 * 1024 * 1024;
const DIRTY_SUBMODULE_DIFF_PATTERN = /^\+Subproject commit [0-9a-f]+-dirty$/im;
const FILE_SNIPPET_LIMIT = 16_384;
const FILE_READ_LIMIT = 1_048_576;
const DEFAULT_TIMEOUT_MS = 30_000;
const UI_ASSERTION_TIMEOUT_MS = 10_000;
const WARM_UP_NAV_TIMEOUT_MS = 30_000;
const WARM_UP_TOTAL_BUDGET_MS = 60_000;
// Mirrors src/routes/__root.tsx so verifier-controlled Brain Dump boots skip the cold splash.
const SPLASH_SHOWN_KEY = "bd:splash-shown";
const SPLASH_SKIP_RESULT_KEY = "__brainDumpVerificationSplashSkip";
// Mirrors src/components/SplashScreen.tsx. The sessionStorage skip only takes
// effect after hydration — the server ALWAYS renders the splash — so evidence
// captured before this overlay detaches shows only a spinner.
const SPLASH_OVERLAY_SELECTOR = '[data-testid="app-splash"]';
const SPLASH_DISMISS_TIMEOUT_MS = 15_000;
const SCROLL_INTO_VIEW_TIMEOUT_MS = 3_000;
const UNCERTIFIED_WORKTREE_INTEGRITY_MESSAGE =
  "Verification run uncertified because the dirty worktree could not be sealed into evidence (unreadable or oversized uncommitted/untracked content). Commit the work being verified, or remove/gitignore large runtime artifacts, then re-run verification.";
const UNCERTIFIED_WORKTREE_CHANGED_MESSAGE =
  "Verification run uncertified because the worktree changed while verification was running. If the app writes runtime artifacts into the project, add them to .gitignore or prove them with trailing file assertions; then re-run verification from a stable worktree (ideally with the work committed).";
const REDACTED_SECRET = "[redacted]";
const SECRET_ENV_KEY_PATTERN = /(SECRET|TOKEN|PASSWORD|PASS|KEY|AUTH|CREDENTIAL|COOKIE|SESSION)/i;
const COMMAND_ENV_ALLOWLIST = ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT"];
const BOOT_ENV_ALLOWLIST = [
  ...COMMAND_ENV_ALLOWLIST,
  "HOME",
  "USER",
  "LOGNAME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
];
const NON_SECRET_ENV_VALUES = new Set(["false", "none", "null", "true", "undefined"]);

function collectSecretEnvValues(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(env)
    .filter(([key, value]) => SECRET_ENV_KEY_PATTERN.test(key) && typeof value === "string")
    .map(([, value]) => value as string)
    .filter((value) => value.length >= 8 && !NON_SECRET_ENV_VALUES.has(value.toLowerCase()))
    .sort((left, right) => right.length - left.length);
}

function redactSecrets(value: string): string {
  let redacted = value;
  for (const secret of collectSecretEnvValues()) {
    redacted = redacted.split(secret).join(REDACTED_SECRET);
  }
  return redacted
    .replace(
      /(\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASS|KEY|AUTH|CREDENTIAL|COOKIE|SESSION)[A-Z0-9_]*\s*[:=]\s*)([^\s"',}]+)/gi,
      `$1${REDACTED_SECRET}`
    )
    .replace(/(\b(?:Bearer|Basic)\s+)([A-Za-z0-9._~+/-]+=*)/gi, `$1${REDACTED_SECRET}`);
}

function redactVerificationValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map((entry) => redactVerificationValue(entry));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactVerificationValue(entry)])
    );
  }
  return value;
}

function commandAutomationEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    COMMAND_ENV_ALLOWLIST.flatMap((key) => {
      const value = process.env[key];
      return typeof value === "string" ? [[key, value]] : [];
    })
  );
}

function bootAutomationEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    BOOT_ENV_ALLOWLIST.flatMap((key) => {
      const value = process.env[key];
      return typeof value === "string" ? [[key, value]] : [];
    })
  );
}

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
    (step.automationKey === undefined || typeof step.automationKey === "string") &&
    (step.automationKind === undefined ||
      ["api", "ui", "command", "file"].includes(step.automationKind)) &&
    (step.failureKeys === undefined ||
      (Array.isArray(step.failureKeys) &&
        step.failureKeys.every((key) => typeof key === "string"))) &&
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
  provider?: string | null;
  actor?: string | null;
  provider_source?: VerificationProviderSource | null;
  execution_surface?: VerificationExecutionSurface | null;
  worker_id?: string | null;
  code_git_sha?: string | null;
}): VerificationRun {
  const manifest = JSON.parse(row.manifest) as VerificationManifest;
  const identity =
    manifest.verifier ??
    ({
      provider: row.provider ?? "unknown",
      actor: (row.actor ?? "unknown ralph") as `${string} ralph`,
      providerSource: row.provider_source ?? "unknown",
      executionSurface: row.execution_surface ?? "cli-direct",
      workerId: row.worker_id ?? null,
      codeGitSha: row.code_git_sha ?? row.git_sha,
    } satisfies VerifierIdentity);
  return {
    id: row.id,
    ticketId: row.ticket_id,
    round: row.round,
    status: row.status as VerificationRunStatus,
    certified: row.certified === 1,
    manifest,
    gitSha: row.git_sha,
    identity,
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

function resolveProjectPath(projectPath: string, target: string, label: string): string {
  validateProjectRelativePath(target, label);
  const root = resolve(projectPath);
  const resolved = resolve(root, target || ".");
  const relativePath = relative(root, resolved);
  if (relativePath !== "" && (relativePath.startsWith("..") || isAbsolute(relativePath))) {
    throw new ValidationError(`${label} must not escape the project directory.`);
  }
  return resolved;
}

function assertRealPathInsideProject(projectPath: string, targetPath: string, label: string): void {
  const root = realpathSync(projectPath);
  let existingPath = targetPath;
  while (!existsSync(existingPath)) {
    const parent = dirname(existingPath);
    if (parent === existingPath) break;
    existingPath = parent;
  }
  const realTarget = realpathSync(existingPath);
  const relativePath = relative(root, realTarget);
  if (relativePath !== "" && (relativePath.startsWith("..") || isAbsolute(relativePath))) {
    throw new ValidationError(`${label} must not resolve outside the project directory.`);
  }
}

function stepNeedsApp(step: DemoStep): boolean {
  return step.automation?.kind === "api" || step.automation?.kind === "ui";
}

function readDemoAppBoot(steps: DemoStep[]): DemoAppBoot | null {
  const boots = steps.flatMap((step) => (step.app ? [step.app] : []));
  if (boots.length === 0) return null;
  const first = boots[0]!;
  validateDemoAppBootArgv(first.start, "Demo app.start");
  if (first.cwd !== undefined) validateProjectRelativePath(first.cwd, "Demo app.cwd");
  if (boots.some((boot) => JSON.stringify(boot) !== JSON.stringify(first))) {
    throw new ValidationError("Demo steps declare conflicting app boot commands.");
  }
  return first;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function evidenceDir(runId: string): string {
  const dir = join(getStateDir(), "verification", runId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function writeEvidence(runId: string, name: string, content: string): VerificationEvidenceFile {
  const path = join(evidenceDir(runId), name);
  const safeContent = redactSecrets(content);
  writeFileSync(path, safeContent, { mode: 0o600 });
  return { path, hash: hashEvidence(safeContent, runId) };
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
  const args = ["vite", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return ["pnpm", "exec", ...args];
  if (existsSync(join(projectPath, "yarn.lock"))) return ["yarn", ...args];
  if (existsSync(join(projectPath, "bun.lockb")) || existsSync(join(projectPath, "bun.lock"))) {
    return ["bunx", ...args];
  }
  return ["npx", ...args];
}

// Project-declared boot config. A project tells Brain Dump how it starts
// instead of Brain Dump guessing that every project is an npm dev server. The
// file form (.brain-dump/verify.json) works for any stack — Python, Go, Rust,
// Lakebed — not just projects with a package.json.
const VERIFY_CONFIG_RELATIVE_PATH = join(".brain-dump", "verify.json");

// Host the runner waits on. The chosen free port is injected via the PORT env
// var (see bootApp) and is also substitutable as a {port} token so a declared
// command can place it wherever its CLI expects it.
const VERIFY_BOOT_HOST = "127.0.0.1";

/**
 * Substitute `{port}` / `{host}` tokens in a declared start command so the
 * project can bind the runner-selected free port. Commands that instead read
 * the injected PORT/HOST env vars can omit the tokens entirely.
 */
function applyPortTokens(args: readonly string[], port: number): string[] {
  return args.map((arg) =>
    arg.replaceAll("{port}", String(port)).replaceAll("{host}", VERIFY_BOOT_HOST)
  );
}

/**
 * Normalize a declared `start` command into an argv array. Accepts an argv
 * array (preferred, spawn-safe, no shell) or a plain string that is split on
 * whitespace. Never runs through a shell, so there is no interpolation risk.
 */
function normalizeDeclaredStart(start: unknown, source: string): string[] {
  const argv = Array.isArray(start)
    ? start
    : typeof start === "string"
      ? start.trim().split(/\s+/).filter(Boolean)
      : null;
  if (!argv || argv.length === 0 || !argv.every((part) => typeof part === "string")) {
    throw new ValidationError(
      `Invalid "start" command in ${source}. Provide a non-empty string or array of strings, e.g. ["npm","run","dev"] or "uvicorn app:app --port {port}".`
    );
  }
  return argv as string[];
}

/**
 * Read an explicit start command the project declares for verification, in
 * priority order: a portable .brain-dump/verify.json file, then a package.json
 * `brainDump.verify.start` field. Returns null when the project declares
 * nothing (auto-discovery then applies). A malformed declaration throws so a
 * broken opt-in surfaces instead of silently falling back.
 */
function readDeclaredBootCommand(projectPath: string, port: number): string[] | null {
  const configPath = join(projectPath, VERIFY_CONFIG_RELATIVE_PATH);
  if (existsSync(configPath)) {
    let config: { start?: unknown };
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8")) as { start?: unknown };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationError(`Could not parse ${configPath}: ${message}`);
    }
    if (config.start !== undefined) {
      return applyPortTokens(normalizeDeclaredStart(config.start, configPath), port);
    }
  }

  const packagePath = join(projectPath, "package.json");
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf-8")) as {
        brainDump?: { verify?: { start?: unknown } };
      };
      const declared = pkg.brainDump?.verify?.start;
      if (declared !== undefined) {
        return applyPortTokens(
          normalizeDeclaredStart(declared, `${packagePath} (brainDump.verify.start)`),
          port
        );
      }
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      // A package.json that is unreadable/invalid is reported by auto-discovery
      // below with fuller context; do not mask it here.
    }
  }

  return null;
}

function discoverBootCommand(projectPath: string, port: number): string[] {
  // 1. Honor an explicit project declaration first (any stack).
  const declared = readDeclaredBootCommand(projectPath, port);
  if (declared) return declared;

  // 2. Fall back to npm/package.json auto-discovery for JS web apps.
  const packagePath = join(projectPath, "package.json");
  if (!existsSync(packagePath)) {
    throw new ValidationError(
      `Cannot determine how to start the app for verification: no package.json at ${packagePath} ` +
        `and no ${VERIFY_CONFIG_RELATIVE_PATH}. Declare a start command in ${VERIFY_CONFIG_RELATIVE_PATH}, ` +
        `e.g. {"start":["<cmd>","--port","{port}"]}, or use only file/command demo steps that don't boot the app.`
    );
  }

  let pkg: {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ValidationError(`Unable to read boot command from ${packagePath}: ${message}`);
  }

  if (
    pkg.dependencies?.vite ||
    pkg.devDependencies?.vite ||
    pkg.dependencies?.["@tanstack/react-start"]
  ) {
    return directViteCommand(projectPath, port);
  }

  const scripts = pkg.scripts ?? {};
  const script = scripts.dev ? "dev" : scripts.start ? "start" : scripts.serve ? "serve" : null;
  if (!script) {
    const available = Object.keys(scripts);
    const availableHint =
      available.length > 0
        ? `Available scripts: ${available.join(", ")}.`
        : "package.json declares no scripts.";
    throw new ValidationError(
      `No dev/start/serve script found in ${packagePath}. ${availableHint} ` +
        `This project may not run as a local dev server. Declare how it starts in ` +
        `${VERIFY_CONFIG_RELATIVE_PATH}, e.g. {"start":["npm","run","<script>","--","--port","{port}"]}, ` +
        `or author file/command/API demo steps that don't require booting the app.`
    );
  }

  const args = ["--host", VERIFY_BOOT_HOST, "--port", String(port)];
  return packageManagerCommand(projectPath, [script, "--", ...args]);
}

async function chooseFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new ValidationError("Unable to reserve a free verification boot port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
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
  bootCwd?: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}): Promise<BootedApp> {
  const url = params.baseUrl ? new URL(params.baseUrl) : null;
  const port = url?.port ? Number(url.port) : await chooseFreePort();
  const baseUrl = params.baseUrl ?? `http://127.0.0.1:${port}`;
  if (params.baseUrl) {
    await waitForReady(baseUrl, params.fetchImpl, params.timeoutMs);
    return {
      baseUrl,
      port,
      command: [],
      cwd: params.projectPath,
      log: () => "external baseUrl supplied",
      stop: async () => {},
    };
  }

  const command = params.bootCommand
    ? applyPortTokens(params.bootCommand, port)
    : discoverBootCommand(params.projectPath, port);
  const cwd = params.bootCwd
    ? resolveProjectPath(params.projectPath, params.bootCwd, "Demo app.cwd")
    : params.projectPath;
  assertRealPathInsideProject(params.projectPath, cwd, "Demo app.cwd");
  // detached puts the boot in its own process group so stop() can kill the
  // whole tree: killing only the spawned wrapper (e.g. `pnpm exec vite dev`)
  // orphans the underlying dev server, which keeps serving AND keeps running
  // an embedded verification worker that leases queued jobs with stale code.
  const supportsProcessGroups = process.platform !== "win32";
  const child = spawn(command[0]!, command.slice(1), {
    cwd,
    env: {
      ...bootAutomationEnv(),
      PORT: String(port),
      HOST: "127.0.0.1",
      PLAYWRIGHT_E2E: "1",
      BRAIN_DUMP_VERIFY_BOOT: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: supportsProcessGroups,
  });
  const killBootTree = (signal: NodeJS.Signals) => {
    if (child.pid !== undefined && supportsProcessGroups) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // ESRCH: the group is already gone, so is the child.
        if (code === "ESRCH") return;
        // Anything else (e.g. EPERM in restrictive sandboxes) means the direct
        // kill below may orphan grandchildren; record it in the boot log so the
        // sealed manifest explains why a port stayed busy.
        output = truncate(
          `${output}\n[verification] Process-group kill (${signal}) failed with ${code ?? String(error)}; falling back to killing only the boot wrapper.`,
          BOOT_LOG_LIMIT
        );
      }
    }
    child.kill(signal);
  };
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output = truncate(output + chunk.toString(), BOOT_LOG_LIMIT);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output = truncate(output + chunk.toString(), BOOT_LOG_LIMIT);
  });

  const failedBootInfo = (details = ""): FailedBootInfo => ({
    port,
    command,
    cwd,
    bootLog: truncate([output, details].filter(Boolean).join("\n"), BOOT_LOG_LIMIT),
  });
  let ready = false;
  const childFailure = new Promise<never>((_, reject) => {
    child.once("error", (error) => {
      if (ready) return;
      reject(
        new VerificationBootError(
          `Boot command failed to start: ${error.message}`,
          failedBootInfo()
        )
      );
    });
    child.once("exit", (code, signal) => {
      if (ready) return;
      const detail = `Boot command exited before readiness with code ${code ?? "null"} and signal ${signal ?? "none"}.`;
      reject(new VerificationBootError(detail, failedBootInfo(detail)));
    });
  });

  try {
    await Promise.race([waitForReady(baseUrl, params.fetchImpl, params.timeoutMs), childFailure]);
    ready = true;
  } catch (error) {
    killBootTree("SIGTERM");
    if (error instanceof VerificationBootError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new VerificationBootError(message, failedBootInfo());
  }

  return {
    baseUrl,
    port,
    command,
    cwd,
    log: () => output,
    stop: async () => {
      if (child.exitCode !== null || child.killed) return;
      killBootTree("SIGTERM");
      await sleep(100);
      if (child.exitCode === null && !child.killed) killBootTree("SIGKILL");
    },
  };
}

async function getGitInfo(
  projectPath: string,
  execFileNoThrow?: VerifyTicketParams["execFileNoThrow"]
): Promise<GitInfo> {
  if (!execFileNoThrow) {
    return {
      sha: null,
      dirty: false,
      dirtyDiffHash: null,
      worktreeSealFailed: false,
      dirtyFiles: [],
      untrackedFiles: [],
      changedFiles: [],
    };
  }
  const shaResult = await execFileNoThrow("git", ["rev-parse", "HEAD"], { cwd: projectPath });
  const statusResult = await execFileNoThrow(
    "git",
    ["status", "--short", "--untracked-files=all"],
    { cwd: projectPath }
  );
  const committedDiffResult = await execFileNoThrow(
    "git",
    ["diff", "--name-only", "HEAD~1", "HEAD"],
    {
      cwd: projectPath,
    }
  );
  const dirtyFiles = statusResult.success
    ? statusResult.stdout
        .split(/\r?\n/)
        .map((line) => line.slice(3).trim())
        .filter(Boolean)
    : [];
  const committedFiles = committedDiffResult.success
    ? committedDiffResult.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const notGitRepository =
    !shaResult.success &&
    !statusResult.success &&
    /not a git repository/i.test(`${shaResult.stderr}\n${statusResult.stderr}`);
  // A confirmed path outside Git has no worktree to seal. Any other metadata
  // failure is an unknown worktree and must fail closed.
  const dirty = statusResult.success ? dirtyFiles.length > 0 : !notGitRepository;
  let dirtyDiffHash: string | null = null;
  let worktreeSealFailed = dirty && !statusResult.success;
  let untrackedFiles: string[] = [];
  if (dirty) {
    const diffResult = await execFileNoThrow(
      "git",
      ["diff", "--full-index", "--binary", "--no-ext-diff", "--no-textconv", "HEAD"],
      {
        cwd: projectPath,
        maxBuffer: 32 * 1024 * 1024,
      }
    );
    const untrackedResult = await execFileNoThrow(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd: projectPath }
    );
    if (
      !worktreeSealFailed &&
      diffResult.success &&
      untrackedResult.success &&
      !DIRTY_SUBMODULE_DIFF_PATTERN.test(diffResult.stdout)
    ) {
      untrackedFiles = untrackedResult.stdout.split("\0").filter(Boolean).sort();
      const untrackedEntries: string[] = [];
      let untrackedBytesHashed = 0;
      for (const file of untrackedFiles) {
        const entry = await hashUntrackedFile(
          projectPath,
          file,
          UNTRACKED_HASH_BYTE_LIMIT - untrackedBytesHashed
        );
        if (entry === null) {
          worktreeSealFailed = true;
          break;
        }
        untrackedBytesHashed += entry.bytesHashed;
        untrackedEntries.push(`${file}\0${entry.hash}`);
      }
      if (!worktreeSealFailed) {
        dirtyDiffHash = createHash("sha256")
          .update(diffResult.stdout)
          .update("\n--untracked--\n")
          .update(untrackedEntries.join("\n"))
          .digest("hex");
      }
    } else {
      worktreeSealFailed = true;
    }
  }
  return {
    sha: shaResult.success ? shaResult.stdout.trim() : null,
    dirty,
    dirtyDiffHash,
    worktreeSealFailed,
    dirtyFiles,
    untrackedFiles,
    changedFiles: [...new Set([...dirtyFiles, ...committedFiles])],
  };
}

async function hashUntrackedFile(
  projectPath: string,
  file: string,
  remainingBytes: number
): Promise<{ hash: string; bytesHashed: number } | null> {
  const projectRoot = resolve(projectPath);
  const absolutePath = resolve(projectRoot, file);
  const projectRelativePath = relative(projectRoot, absolutePath);
  if (projectRelativePath.startsWith("..") || isAbsolute(projectRelativePath)) {
    return null;
  }
  try {
    const stats = await lstat(absolutePath);
    const mode = (stats.mode & 0o7777).toString(8);
    if (stats.isSymbolicLink()) {
      const target = await readlink(absolutePath);
      const bytesHashed = Buffer.byteLength(target);
      if (bytesHashed > remainingBytes) return null;
      return { hash: `symlink:${mode}:${target}`, bytesHashed };
    }
    if (!stats.isFile()) return null;
    if (stats.size > remainingBytes) return null;
    const contentHash = createHash("sha256");
    let bytesHashed = 0;
    for await (const chunk of createReadStream(absolutePath)) {
      bytesHashed += Buffer.byteLength(chunk);
      if (bytesHashed > remainingBytes) return null;
      contentHash.update(chunk);
    }
    return { hash: `file:${mode}:${contentHash.digest("hex")}`, bytesHashed };
  } catch {
    // Unreadable entry (permissions, races with the app): the worktree cannot
    // be sealed, which the caller reports as worktreeSealFailed evidence.
    return null;
  }
}

function hasVerificationTripwireChange(changedFiles: string[]): boolean {
  // Only the verifier's own code counts. A bare "manifest" substring match
  // would uncertify innocent target-project diffs (public/manifest.json,
  // site.webmanifest, app manifests) that have nothing to do with the sealed
  // verification manifest.
  return changedFiles.some(
    (file) =>
      file.startsWith("core/verification") ||
      file.startsWith("core/verifier-identity") ||
      file.startsWith("core/__tests__/verification")
  );
}

function gitWorktreeSealMatches(before: GitInfo, after: GitInfo): boolean {
  return (
    before.sha === after.sha &&
    before.dirty === after.dirty &&
    before.dirtyDiffHash === after.dirtyDiffHash &&
    before.worktreeSealFailed === after.worktreeSealFailed
  );
}

function isDeclaredGeneratedArtifactChange(
  before: GitInfo,
  after: GitInfo,
  steps: DemoStep[],
  projectPath: string,
  verdicts: VerificationStepVerdict[],
  runId: string
): boolean {
  if (
    before.dirty ||
    !after.dirty ||
    before.sha !== after.sha ||
    before.worktreeSealFailed ||
    after.worktreeSealFailed ||
    after.dirtyFiles.length === 0
  ) {
    return false;
  }
  let lastMutatingStepIndex = -1;
  steps.forEach((step, index) => {
    if (step.automation !== undefined && step.automation.kind !== "file") {
      lastMutatingStepIndex = index;
    }
  });
  const declaredFiles = new Set(
    steps.flatMap((step, index) => {
      if (step.automation?.kind !== "file" || index <= lastMutatingStepIndex) return [];
      // The carve-out requires a content assertion: exists-only steps never
      // hash the file (privacy), so they cannot vouch for a generated
      // artifact's final bytes.
      const positivelyVerifiesFinalFile =
        step.automation.assert.length > 0 &&
        step.automation.assert.every((assertion) => assertion.type !== "notExists") &&
        step.automation.assert.some((assertion) =>
          ["contains", "notContains", "jsonPath"].includes(assertion.type)
        );
      return positivelyVerifiesFinalFile
        ? [step.automation.path.replaceAll("\\", "/").replace(/^\.\//, "")]
        : [];
    })
  );
  const untrackedFiles = new Set(after.untrackedFiles);
  return after.dirtyFiles.every((file) => {
    const normalized = file.replaceAll("\\", "/").replace(/^\.\//, "");
    if (!untrackedFiles.has(file) || !declaredFiles.has(normalized)) return false;
    try {
      const stats = lstatSync(resolve(projectPath, file));
      if (!stats.isFile() || stats.size > FILE_READ_LIMIT) return false;
      const step = steps.find(
        (candidate, index) =>
          index > lastMutatingStepIndex &&
          candidate.automation?.kind === "file" &&
          candidate.automation.assert.every((assertion) => assertion.type !== "notExists") &&
          candidate.automation.assert.some((assertion) =>
            ["contains", "notContains", "jsonPath"].includes(assertion.type)
          ) &&
          candidate.automation.path.replaceAll("\\", "/").replace(/^\.\//, "") === normalized
      );
      const verdict = step
        ? verdicts.find((candidate) => candidate.order === step.order)
        : undefined;
      const finalHash = hmac(
        readFileSync(resolve(projectPath, file), "utf-8"),
        `brain-dump:file:${runId}`
      );
      return verdict?.status === "passed" && verdict.verifiedFileHash === finalHash;
    } catch {
      return false;
    }
  });
}

async function runExecutableSteps(params: {
  projectPath: string;
  baseUrl?: string;
  bootCommand?: string[];
  bootCwd?: string;
  execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]>;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  steps: DemoStep[];
  runId: string;
}): Promise<{ boot: BootedApp | null; verdicts: VerificationStepVerdict[] }> {
  const needsApp = params.steps.some(stepNeedsApp);
  if (!needsApp) {
    const verdicts: VerificationStepVerdict[] = [];
    for (const step of params.steps) {
      verdicts.push(
        await runStep(
          step,
          params.runId,
          null,
          params.fetchImpl,
          params.projectPath,
          params.execFileNoThrow
        )
      );
    }
    return { boot: null, verdicts };
  }

  const demoBoot = readDemoAppBoot(params.steps);
  const bootCommand = params.bootCommand ?? demoBoot?.start;
  const bootCwd = params.bootCwd ?? demoBoot?.cwd;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let boot: BootedApp | null = null;
    try {
      boot = await bootApp({
        projectPath: params.projectPath,
        ...(params.baseUrl !== undefined ? { baseUrl: params.baseUrl } : {}),
        ...(bootCommand !== undefined ? { bootCommand } : {}),
        ...(bootCwd !== undefined ? { bootCwd } : {}),
        fetchImpl: params.fetchImpl,
        timeoutMs: params.timeoutMs,
      });
      // Only self-booted apps are cold; an external baseUrl is already warm.
      if (params.baseUrl === undefined) {
        await warmUpUiRoutes(params.steps, boot.baseUrl);
      }
      const verdicts: VerificationStepVerdict[] = [];
      for (const step of params.steps) {
        verdicts.push(
          await runStep(
            step,
            params.runId,
            boot.baseUrl,
            params.fetchImpl,
            params.projectPath,
            params.execFileNoThrow
          )
        );
      }
      return { boot, verdicts };
    } catch (error) {
      if (boot && !(error instanceof VerificationBootError)) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = new VerificationBootError(message, {
          port: boot.port,
          command: boot.command,
          cwd: boot.cwd,
          bootLog: boot.log(),
        });
      } else {
        lastError = error;
      }
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
  const failedAssertionIndexes: number[] = [];
  const failAssertion = (index: number, message: string): void => {
    failures.push(message);
    failedAssertionIndexes.push(index);
  };

  for (const [index, assertion] of step.automation.assert.entries()) {
    if (assertion.type === "status" && response.status !== assertion.expected) {
      failAssertion(index, `expected status ${assertion.expected}, got ${response.status}`);
    } else if (assertion.type === "bodyContains" && !body.includes(String(assertion.expected))) {
      failAssertion(index, `expected body to contain ${String(assertion.expected)}`);
    } else if (assertion.type === "jsonPath") {
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        failAssertion(index, "expected JSON body for jsonPath assertion");
        continue;
      }
      const actual = resolveJsonPath(json, String(assertion.expected).split("=")[0] ?? "");
      const expected = String(assertion.expected).includes("=")
        ? String(assertion.expected).split("=").slice(1).join("=")
        : assertion.expected;
      if (!valuesEqual(actual, expected)) {
        failAssertion(
          index,
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
    failedAssertionIndexes,
    request: { method: request.method, url, headers, body: request.body },
    response: { status: response.status, headers: responseHeaders, body },
  };
}

// A cold `vite dev` boot compiles SSR routes and optimizes browser deps on the
// first real page load, so the first UI step can exhaust its assertion timeout
// before any app content renders. Visit each unique UI route once with a real
// browser before the assertion clock starts. Best-effort by design: a route
// that is genuinely broken still fails visibly in its own step afterwards.
async function warmUpUiRoutes(steps: DemoStep[], baseUrl: string): Promise<void> {
  const routes: string[] = [];
  for (const step of steps) {
    if (step.automation?.kind !== "ui") continue;
    const route = step.automation.route;
    if (typeof route === "string" && !routes.includes(route)) routes.push(route);
  }
  if (routes.length === 0) return;

  let playwright: typeof import("@playwright/test");
  let browser: Awaited<ReturnType<typeof import("@playwright/test").chromium.launch>>;
  try {
    playwright = await import("@playwright/test");
    browser = await playwright.chromium.launch();
  } catch {
    // runUiStep imports and launches its own browser, so it surfaces the real
    // failure as its own skipped/failed verdict; an exception escaping here
    // would instead be mislabeled as a boot failure and burn a boot retry.
    return;
  }
  try {
    const page = await browser.newPage();
    // Shared budget: an unresponsive page must not burn the full nav timeout
    // once per route and invisibly delay the real assertions.
    const deadline = Date.now() + WARM_UP_TOTAL_BUDGET_MS;
    for (const route of routes) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      try {
        await page.goto(resolveAppUrl(route, baseUrl, "Warm-up route"), {
          waitUntil: "networkidle",
          timeout: Math.min(WARM_UP_NAV_TIMEOUT_MS, remainingMs),
        });
      } catch {
        // Slow or broken routes are still asserted (and fail visibly) in their step.
      }
    }
  } finally {
    try {
      await browser.close();
    } catch {
      // Best-effort teardown; a crashed browser has nothing left to close.
    }
  }
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
  const failedAssertionIndexes: number[] = [];
  const nonAssertionFailureKeys: string[] = [];
  const uiFailureKey = (type: string): string =>
    createHash("sha256")
      .update(
        stableJson({
          target: {
            kind: "ui",
            route: step.automation?.kind === "ui" ? step.automation.route : "",
            actions: step.automation?.kind === "ui" ? (step.automation.actions ?? []) : [],
          },
          failure: { type },
        })
      )
      .digest("hex");
  const failAssertion = (index: number, message: string): void => {
    failures.push(message);
    failedAssertionIndexes.push(index);
  };
  try {
    try {
      await page.addInitScript(
        ({ resultKey, splashShownKey }) => {
          const state = window as unknown as Record<string, BrowserSplashSkipResult>;
          try {
            sessionStorage.setItem(splashShownKey, "1");
            state[resultKey] = { ok: true };
          } catch (error) {
            state[resultKey] = {
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
        { resultKey: SPLASH_SKIP_RESULT_KEY, splashShownKey: SPLASH_SHOWN_KEY }
      );
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const splashSkipResult = await page.evaluate((resultKey) => {
        const state = window as unknown as Record<string, BrowserSplashSkipResult | undefined>;
        return state[resultKey] ?? { ok: false, error: "init script did not report a result" };
      }, SPLASH_SKIP_RESULT_KEY);
      if (!splashSkipResult.ok) {
        failures.push(
          `Brain Dump splash skip setup failed: ${splashSkipResult.error ?? "unknown"}`
        );
        nonAssertionFailureKeys.push(uiFailureKey("splash-skip-setup"));
      }
      // Text assertions pass against the SSR DOM underneath the splash
      // overlay, so without this wait a step can "pass" while the screenshot
      // shows only a spinner. A splash that never dismisses means the app
      // never hydrated — fail the step instead of certifying blank evidence.
      try {
        await page
          .locator(SPLASH_OVERLAY_SELECTOR)
          .waitFor({ state: "detached", timeout: SPLASH_DISMISS_TIMEOUT_MS });
      } catch {
        failures.push(
          `App splash overlay did not dismiss within ${SPLASH_DISMISS_TIMEOUT_MS}ms; the app never became interactive, so UI evidence would only show the splash screen.`
        );
        nonAssertionFailureKeys.push(uiFailureKey("splash-overlay-timeout"));
      }
      // Actions resolve multi-match selectors to the first element, mirroring
      // the assertion semantics below. A strict locator would fail a waitFor
      // on a prefix selector like [data-testid^='row-'] precisely when the
      // page rendered MORE data than required (observed: 26 populated
      // portfolio rows failing "wait for a portfolio row").
      for (const action of step.automation.actions ?? []) {
        if (action.act === "click")
          await page
            .locator(action.selector ?? "")
            .first()
            .click();
        if (action.act === "fill")
          await page
            .locator(action.selector ?? "")
            .first()
            .fill(action.value ?? "");
        if (action.act === "press") await page.keyboard.press(action.value ?? "Enter");
        if (action.act === "waitFor")
          await page
            .locator(action.selector ?? "body")
            .first()
            .waitFor();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`UI action failed: ${message}`);
      nonAssertionFailureKeys.push(uiFailureKey("ui-action"));
    }

    for (const [index, assertion] of step.automation.assert.entries()) {
      try {
        if (assertion.type === "visible") {
          const visible = await page
            .locator(assertion.selector ?? "body")
            .first()
            .isVisible();
          if (!visible) {
            failAssertion(index, `expected ${assertion.selector ?? "body"} to be visible`);
          }
        }
        if (assertion.type === "text") {
          await playwright
            .expect(page.locator(assertion.selector ?? "body").first())
            .toContainText(assertion.expected ?? "", { timeout: UI_ASSERTION_TIMEOUT_MS });
        }
        if (assertion.type === "url" && !page.url().includes(assertion.expected ?? "")) {
          failAssertion(index, `expected URL to contain ${assertion.expected}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failAssertion(index, `UI assertion failed: ${message}`);
      }
    }

    // Bring the asserted content into frame before capturing evidence. The
    // app shell scrolls inside nested overflow containers (body is h-screen
    // overflow-hidden), so fullPage screenshots only ever capture the
    // viewport: text asserted deep in a scroll container passes while the
    // screenshot shows just the top of the page.
    const textAssertion = step.automation.assert.find(
      (assertion) => assertion.type === "text" && (assertion.expected ?? "").length > 0
    );
    if (textAssertion) {
      try {
        const selector = textAssertion.selector ?? "body";
        const target =
          selector === "body"
            ? page.getByText(textAssertion.expected ?? "").first()
            : page.locator(selector).first();
        await target.scrollIntoViewIfNeeded({ timeout: SCROLL_INTO_VIEW_TIMEOUT_MS });
      } catch {
        // Best-effort framing: the assertions above already proved the content
        // exists in the DOM; the screenshot still captures the page as-is.
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
      failedAssertionIndexes,
      ...(nonAssertionFailureKeys.length > 0
        ? { failureKeys: [...new Set(nonAssertionFailureKeys)] }
        : {}),
    };
  } finally {
    await browser.close();
  }
}

async function runCommandStep(
  step: DemoStep,
  runId: string,
  projectPath: string,
  execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]>
): Promise<VerificationStepVerdict> {
  if (!step.automation || step.automation.kind !== "command") {
    throw new ValidationError(`Step ${step.order} is missing command automation.`);
  }
  const start = Date.now();
  const automation = step.automation;
  validateNonShellArgv(
    automation.command.argv,
    `Step ${step.order} command automation argv`,
    readProjectVerifyCommandTemplates(projectPath)
  );
  const [command, ...args] = automation.command.argv;
  if (!command) {
    throw new ValidationError(`Step ${step.order} command automation argv must not be empty.`);
  }
  if (!Number.isSafeInteger(automation.command.timeoutMs) || automation.command.timeoutMs <= 0) {
    throw new ValidationError(`Step ${step.order} command automation timeoutMs must be positive.`);
  }
  if (automation.command.timeoutMs > DEMO_COMMAND_MAX_TIMEOUT_MS) {
    throw new ValidationError(
      `Step ${step.order} command automation timeoutMs must be at most ${DEMO_COMMAND_MAX_TIMEOUT_MS}ms.`
    );
  }
  if (
    !Number.isSafeInteger(automation.command.expectedExitCode) ||
    automation.command.expectedExitCode < 0
  ) {
    throw new ValidationError(
      `Step ${step.order} command automation expectedExitCode must be a non-negative integer.`
    );
  }

  const cwd = resolveProjectPath(
    projectPath,
    automation.command.cwd ?? ".",
    `Step ${step.order} command automation cwd`
  );
  assertRealPathInsideProject(projectPath, cwd, `Step ${step.order} command automation cwd`);
  const result = await execFileNoThrow(command, args, {
    cwd,
    env: commandAutomationEnv(),
    timeoutMs: automation.command.timeoutMs,
    maxBuffer: COMMAND_EXEC_BUFFER_LIMIT,
  });
  const stdout = truncate(result.stdout, COMMAND_OUTPUT_LIMIT);
  const stderr = truncate(result.stderr, COMMAND_OUTPUT_LIMIT);
  const failures: string[] = [];
  const failedAssertionIndexes: number[] = [];
  const nonAssertionFailureKeys: string[] = [];
  const failAssertion = (index: number, message: string): void => {
    failures.push(message);
    failedAssertionIndexes.push(index);
  };

  if (result.exitCode !== automation.command.expectedExitCode) {
    failures.push(
      `expected exit code ${automation.command.expectedExitCode}, got ${result.exitCode ?? "null"}`
    );
    nonAssertionFailureKeys.push(
      createHash("sha256")
        .update(
          stableJson({
            target: { kind: "command", command: automation.command },
            failure: { type: "exit-code", expected: automation.command.expectedExitCode },
          })
        )
        .digest("hex")
    );
  }
  for (const [index, assertion] of automation.assert.entries()) {
    if (assertion.type === "stdoutContains" && !result.stdout.includes(assertion.expected)) {
      failAssertion(index, `expected stdout to contain ${JSON.stringify(assertion.expected)}`);
    } else if (
      assertion.type === "stdoutNotContains" &&
      result.stdout.includes(assertion.expected)
    ) {
      failAssertion(index, `expected stdout not to contain ${JSON.stringify(assertion.expected)}`);
    } else if (assertion.type === "stderrContains" && !result.stderr.includes(assertion.expected)) {
      failAssertion(index, `expected stderr to contain ${JSON.stringify(assertion.expected)}`);
    } else if (
      assertion.type === "stderrNotContains" &&
      result.stderr.includes(assertion.expected)
    ) {
      failAssertion(index, `expected stderr not to contain ${JSON.stringify(assertion.expected)}`);
    }
  }

  const evidencePayload: Record<string, unknown> = {
    command: {
      argv: automation.command.argv,
      cwd: relative(resolve(projectPath), cwd) || ".",
      timeoutMs: automation.command.timeoutMs,
      expectedExitCode: automation.command.expectedExitCode,
    },
    result: {
      exitCode: result.exitCode,
      stdout,
      stderr,
      ...(result.error ? { error: result.error } : {}),
    },
    assertions: automation.assert,
    failures,
  };
  const evidence = writeEvidence(
    runId,
    `step-${step.order}-command.json`,
    stableJson(evidencePayload)
  );

  return {
    order: step.order,
    status: failures.length === 0 ? "passed" : "failed",
    message: failures.length === 0 ? "Command assertions passed." : failures.join("; "),
    durationMs: Date.now() - start,
    evidenceFiles: [evidence],
    failedAssertionIndexes,
    ...(nonAssertionFailureKeys.length > 0
      ? { failureKeys: [...new Set(nonAssertionFailureKeys)] }
      : {}),
  };
}

async function runFileStep(
  step: DemoStep,
  runId: string,
  projectPath: string
): Promise<VerificationStepVerdict> {
  if (!step.automation || step.automation.kind !== "file") {
    throw new ValidationError(`Step ${step.order} is missing file automation.`);
  }
  const start = Date.now();
  const automation = step.automation;
  const needsContent = automation.assert.some(
    (assertion) =>
      assertion.type === "contains" ||
      assertion.type === "notContains" ||
      assertion.type === "jsonPath"
  );
  validateSafeAutomationFilePath(automation.path, `Step ${step.order} file automation path`);
  const filePath = resolveProjectPath(
    projectPath,
    automation.path,
    `Step ${step.order} file automation path`
  );
  assertRealPathInsideProject(projectPath, filePath, `Step ${step.order} file automation path`);
  const exists = existsSync(filePath);
  const failures: string[] = [];
  const failedAssertionIndexes: number[] = [];
  const failAssertion = (index: number, message: string): void => {
    failures.push(message);
    failedAssertionIndexes.push(index);
  };
  let content: string | null = null;
  let size: number | null = null;
  let targetFileHash: string | null = null;
  let readError: string | null = null;

  if (exists) {
    try {
      const stat = statSync(filePath);
      size = stat.size;
      if (!stat.isFile()) {
        readError = `path ${automation.path} is not a regular file`;
      } else if (needsContent && size <= FILE_READ_LIMIT) {
        // Only content-asserting steps may read (and hash) the file: an
        // exists-only assertion must not snapshot file contents into
        // evidence, and the generated-artifact carve-out below requires a
        // content assertion for the same reason.
        content = readFileSync(filePath, "utf-8");
        targetFileHash = hmac(content, `brain-dump:file:${runId}`);
      }
    } catch (error) {
      readError = error instanceof Error ? error.message : String(error);
    }
  }

  for (const [index, assertion] of automation.assert.entries()) {
    if (assertion.type === "exists") {
      if (!exists) failAssertion(index, `expected file ${automation.path} to exist`);
      if (exists && readError !== null) {
        failAssertion(index, `could not inspect file ${automation.path}: ${readError}`);
      }
      continue;
    }
    if (assertion.type === "notExists") {
      if (exists) failAssertion(index, `expected file ${automation.path} not to exist`);
      continue;
    }
    if (!exists) {
      failAssertion(
        index,
        `expected file ${automation.path} to exist for ${assertion.type} assertion`
      );
      continue;
    }
    if (readError !== null) {
      failAssertion(index, `could not inspect file ${automation.path}: ${readError}`);
      continue;
    }
    if (size !== null && size > FILE_READ_LIMIT) {
      failAssertion(index, `file ${automation.path} is too large to inspect (${size} bytes)`);
      continue;
    }
    if (content === null) {
      failAssertion(index, `file ${automation.path} could not be read`);
      continue;
    }
    if (assertion.type === "contains" && !content.includes(assertion.expected)) {
      failAssertion(index, `expected file to contain ${JSON.stringify(assertion.expected)}`);
    } else if (assertion.type === "notContains" && content.includes(assertion.expected)) {
      failAssertion(index, `expected file not to contain ${JSON.stringify(assertion.expected)}`);
    } else if (assertion.type === "jsonPath") {
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        failAssertion(index, "expected JSON file for jsonPath assertion");
        continue;
      }
      const actual = resolveJsonPath(json, assertion.path);
      if (!valuesEqual(actual, assertion.expected)) {
        failAssertion(
          index,
          `expected jsonPath ${assertion.path} to equal ${JSON.stringify(assertion.expected)}, got ${JSON.stringify(actual)}`
        );
      }
    }
  }

  const evidencePayload: Record<string, unknown> = {
    file: {
      path: automation.path,
      exists,
      size,
      hash: targetFileHash,
      readError,
      snippet: needsContent && content !== null ? truncate(content, FILE_SNIPPET_LIMIT) : null,
    },
    assertions: automation.assert,
    failures,
  };
  const evidence = writeEvidence(
    runId,
    `step-${step.order}-file.json`,
    stableJson(evidencePayload)
  );

  return {
    order: step.order,
    status: failures.length === 0 ? "passed" : "failed",
    message: failures.length === 0 ? "File assertions passed." : failures.join("; "),
    durationMs: Date.now() - start,
    evidenceFiles: [evidence],
    failedAssertionIndexes,
    verifiedFileHash: targetFileHash,
  };
}

async function runStep(
  step: DemoStep,
  runId: string,
  baseUrl: string | null,
  fetchImpl: typeof fetch,
  projectPath: string,
  execFileNoThrow: NonNullable<VerifyTicketParams["execFileNoThrow"]>
): Promise<VerificationStepVerdict> {
  if (step.type === "manual") {
    return withAutomationKey(step, {
      order: step.order,
      status: "skipped",
      message: MANUAL_STEP_SKIP_MESSAGE,
      durationMs: 0,
      evidenceFiles: [],
    });
  }
  if (step.automation?.kind === "api") {
    if (baseUrl === null)
      throw new ValidationError(`Step ${step.order} API automation needs app boot.`);
    return withAutomationKey(step, await runApiStep(step, runId, baseUrl, fetchImpl));
  }
  if (step.automation?.kind === "ui") {
    if (baseUrl === null)
      throw new ValidationError(`Step ${step.order} UI automation needs app boot.`);
    return withAutomationKey(step, await runUiStep(step, runId, baseUrl));
  }
  if (step.automation?.kind === "command") {
    return withAutomationKey(step, await runCommandStep(step, runId, projectPath, execFileNoThrow));
  }
  if (step.automation?.kind === "file") {
    return withAutomationKey(step, await runFileStep(step, runId, projectPath));
  }
  throw new ValidationError(`Step ${step.order} has no executable automation spec.`);
}

function withAutomationKey(
  step: DemoStep,
  verdict: VerificationStepVerdict
): VerificationStepVerdict {
  const automation = step.automation;
  if (!automation) return verdict;
  let target: unknown;
  switch (automation.kind) {
    case "api":
      target = {
        kind: automation.kind,
        request: automation.request,
      };
      break;
    case "ui":
      target = {
        kind: automation.kind,
        route: automation.route,
        actions: (automation.actions ?? []).filter((action) => action.act !== "waitFor"),
      };
      break;
    case "command":
      target = {
        kind: automation.kind,
        command: automation.command,
      };
      break;
    case "file":
      target = {
        kind: automation.kind,
        path: automation.path,
      };
      break;
  }
  const assertionFailureKeys = (verdict.failedAssertionIndexes ?? [])
    .map((index) => automation.assert[index])
    .filter((assertion) => assertion !== undefined)
    .map((assertion) =>
      createHash("sha256").update(stableJson({ target, assertion })).digest("hex")
    );
  const failureKeys = [...new Set([...(verdict.failureKeys ?? []), ...assertionFailureKeys])];
  const { failedAssertionIndexes: _failedAssertionIndexes, ...sealedVerdict } = verdict;
  return {
    ...sealedVerdict,
    automationKind: automation.kind,
    automationKey: createHash("sha256").update(stableJson(target)).digest("hex"),
    ...(failureKeys.length > 0 ? { failureKeys: [...new Set(failureKeys)] } : {}),
  };
}

function summarizeStatus(verdicts: VerificationStepVerdict[]): VerificationRunStatus {
  if (verdicts.some((step) => step.status === "failed")) return "failed";
  if (verdicts.some((step) => step.status === "skipped")) return "uncertified";
  return "passed";
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
  const execFileNoThrow = params.execFileNoThrow ?? defaultExecFileNoThrow;
  const gitInfo = await getGitInfo(actualProjectPath, execFileNoThrow);
  const verifierGitInfo =
    resolve(actualProjectPath) === VERIFIER_CODE_ROOT
      ? gitInfo
      : await getGitInfo(VERIFIER_CODE_ROOT, execFileNoThrow);
  const identity = resolveVerifierIdentity(db, {
    ticketId: params.ticketId,
    provider: params.provider,
    executionSurface:
      params.executionSurface ?? (params.verificationJobLease ? "enqueue-drain" : "cli-direct"),
    workerId: params.verificationJobLease?.workerId,
    codeGitSha: verifierGitInfo.sha,
  });
  let boot: BootedApp | null = null;
  let failedBootInfo: FailedBootInfo | null = null;
  let verdicts: VerificationStepVerdict[] = [];
  let status = statusOverride ?? "infra_error";
  let executionFailed = false;

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
        ...(params.bootCwd !== undefined ? { bootCwd: params.bootCwd } : {}),
        execFileNoThrow,
        fetchImpl,
        timeoutMs,
        steps,
        runId,
      });
      boot = result.boot;
      verdicts = result.verdicts;
    }
  } catch (error) {
    executionFailed = true;
    if (error instanceof VerificationBootError) {
      failedBootInfo = error.bootInfo;
    }
    const message = error instanceof Error ? error.message : String(error);
    status = "infra_error";
    verdicts = [{ order: 0, status: "failed", message, durationMs: 0, evidenceFiles: [] }];
  } finally {
    await boot?.stop();
  }

  let evidenceGitInfo = gitInfo;
  if (!statusOverride) {
    const finalGitInfo = await getGitInfo(actualProjectPath, execFileNoThrow);
    const worktreeChanged = !gitWorktreeSealMatches(gitInfo, finalGitInfo);
    const declaredArtifactChange =
      worktreeChanged &&
      isDeclaredGeneratedArtifactChange(
        gitInfo,
        finalGitInfo,
        steps,
        actualProjectPath,
        verdicts,
        runId
      );
    evidenceGitInfo = declaredArtifactChange
      ? finalGitInfo
      : worktreeChanged
        ? {
            ...gitInfo,
            dirtyDiffHash: null,
            worktreeSealFailed: true,
            changedFiles: [...new Set([...gitInfo.changedFiles, ...finalGitInfo.changedFiles])],
          }
        : gitInfo;

    if (
      hasVerificationTripwireChange(gitInfo.changedFiles) ||
      hasVerificationTripwireChange(finalGitInfo.changedFiles)
    ) {
      verdicts.push({
        order: 0,
        status: "skipped",
        message: UNCERTIFIED_TRIPWIRE_MESSAGE,
        durationMs: 0,
        evidenceFiles: [],
      });
    }
    if (gitInfo.worktreeSealFailed || finalGitInfo.worktreeSealFailed) {
      verdicts.push({
        order: 0,
        status: "skipped",
        message: UNCERTIFIED_WORKTREE_INTEGRITY_MESSAGE,
        durationMs: 0,
        evidenceFiles: [],
      });
    } else if (worktreeChanged && !declaredArtifactChange) {
      verdicts.push({
        order: 0,
        status: "skipped",
        message: UNCERTIFIED_WORKTREE_CHANGED_MESSAGE,
        durationMs: 0,
        evidenceFiles: [],
      });
    }
    if (steps.some((step) => step.coverageRationale?.trim())) {
      verdicts.push({
        order: 0,
        status: "skipped",
        message: UNCERTIFIED_COVERAGE_RATIONALE_MESSAGE,
        durationMs: 0,
        evidenceFiles: [],
      });
    }
    status = executionFailed ? "infra_error" : summarizeStatus(verdicts);
  }

  const finishedAt = new Date().toISOString();
  const certified = status === "passed";
  const safeVerdicts = redactVerificationValue(verdicts) as VerificationStepVerdict[];
  const evidenceFiles = safeVerdicts.flatMap((step) => step.evidenceFiles);
  const manifestBase = {
    runId,
    ticketId: params.ticketId,
    round,
    status,
    certified,
    gitSha: evidenceGitInfo.sha,
    dirty: evidenceGitInfo.dirty,
    dirtyDiffHash: evidenceGitInfo.dirtyDiffHash,
    port:
      boot?.port ??
      failedBootInfo?.port ??
      (params.baseUrl ? Number(new URL(params.baseUrl).port || 80) : 0),
    bootCommand: boot?.command ?? failedBootInfo?.command ?? params.bootCommand ?? [],
    bootCwd:
      relative(actualProjectPath, boot?.cwd ?? failedBootInfo?.cwd ?? actualProjectPath) || ".",
    bootLog: redactSecrets(boot?.log() ?? failedBootInfo?.bootLog ?? ""),
    startedAt,
    finishedAt,
    stepVerdicts: safeVerdicts,
    evidenceFiles,
    verifier: identity,
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
    gitSha: evidenceGitInfo.sha,
    identity,
    startedAt,
    finishedAt,
  };
}

export async function verifyTicket(
  db: DbHandle,
  params: VerifyTicketParams
): Promise<VerificationRun> {
  if (params.verificationJobLease === undefined) {
    const activeLease = getActiveVerificationLease(db, params.ticketId);
    if (activeLease) {
      throw new ValidationError(
        `Cannot run verification directly for ticket ${params.ticketId}: automatic verification job ${activeLease.jobId} is leased by ${activeLease.leasedBy} until ${activeLease.leaseExpiresAt}. Wait for the worker to finish, or inspect with brain-dump verify status --ticket ${params.ticketId}.`
      );
    }
  }

  const demo = getDemoScriptRow(db, params.ticketId);
  const steps = parseSteps(demo);
  const run = await buildRun(db, params);
  const { epicAutoPr } = await settleVerificationLifecycle(db, {
    run,
    steps,
    identity: run.identity,
    ...(params.verificationJobLease !== undefined
      ? { verificationJobLease: params.verificationJobLease }
      : {}),
    ...(params.execFileNoThrow !== undefined ? { execFileNoThrow: params.execFileNoThrow } : {}),
  });
  if (epicAutoPr) {
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
    provider?: string | null;
    actor?: string | null;
    provider_source?: VerificationProviderSource | null;
    execution_surface?: VerificationExecutionSurface | null;
    worker_id?: string | null;
    code_git_sha?: string | null;
  }>;
  return rows.map(toVerificationRun);
}

/**
 * Audit-ready view of a stored verification run: integrity re-checked against
 * the sealed manifest, verifier identity resolved, and safe against corrupted
 * manifest JSON (reported as tampered instead of thrown).
 */
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

function runDurationMs(startedAt: string, finishedAt: string): number {
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) return 0;
  return Math.max(0, finished - started);
}

/**
 * The consolidated verification run read model. UI run history, CLI history
 * output, and MCP context all derive from this so every surface reports the
 * same evidence metadata and integrity state.
 */
export function listVerificationRunSummaries(
  db: DbHandle,
  ticketId: string
): VerificationRunSummary[] {
  getTicketRow(db, ticketId);
  const rows = db
    .prepare(
      `SELECT id, ticket_id, round, status, certified, manifest, git_sha,
              started_at, finished_at, provider, actor, provider_source,
              execution_surface, worker_id, code_git_sha
       FROM verification_runs WHERE ticket_id = ? ORDER BY round DESC`
    )
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
    provider: string | null;
    actor: string | null;
    provider_source: string | null;
    execution_surface: string | null;
    worker_id: string | null;
    code_git_sha: string | null;
  }>;

  return rows.map((row) => {
    const { manifest, integrityStatus } = computeManifestIntegrity({
      id: row.id,
      ticketId: row.ticket_id,
      round: row.round,
      status: row.status,
      certified: row.certified === 1,
      gitSha: row.git_sha,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      manifest: row.manifest,
    });

    return {
      id: row.id,
      ticketId: row.ticket_id,
      round: row.round,
      status: row.status as VerificationRunStatus,
      certified: row.certified === 1,
      integrityStatus,
      gitSha: row.git_sha,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: runDurationMs(row.started_at, row.finished_at),
      verifier: verifierFromLegacyRunColumns(
        {
          provider: row.provider,
          actor: row.actor,
          providerSource: row.provider_source,
          executionSurface: row.execution_surface,
          workerId: row.worker_id,
          codeGitSha: row.code_git_sha,
        },
        manifest
      ),
      manifest,
    };
  });
}

export const verificationTestInternals = {
  resolveJsonPath,
  summarizeStatus,
  hashEvidence,
  manifestHashFor,
  attachRunEvidenceAndReport,
  discoverBootCommand,
  getGitInfo,
  isDeclaredGeneratedArtifactChange,
  withAutomationKey,
};
