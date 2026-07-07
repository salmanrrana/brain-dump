import { createProviderRalphUploader, normalizeAttachmentProvider } from "./attachment-types.ts";
import type { DbHandle } from "./types.ts";

export type VerificationExecutionSurface =
  | "boot-drain"
  | "enqueue-drain"
  | "resident-poller"
  | "cli-direct";

export type VerificationProviderSource =
  | "explicit"
  | "session"
  | "telemetry"
  | "environment"
  | "unknown";

export interface VerifierIdentity {
  provider: string;
  actor: `${string} ralph`;
  providerSource: VerificationProviderSource;
  executionSurface: VerificationExecutionSurface;
  workerId: string | null;
  codeGitSha: string | null;
}

interface ResolveVerifierIdentityParams {
  ticketId: string;
  provider?: string | null | undefined;
  executionSurface: VerificationExecutionSurface;
  workerId?: string | null | undefined;
  codeGitSha?: string | null | undefined;
}

function normalizeProvider(value: string | null | undefined): string | null {
  const provider = normalizeAttachmentProvider(value);
  return provider === "unknown" ? null : provider;
}

function providerFromSessionMetadata(db: DbHandle, ticketId: string): string | null {
  const rows = db
    .prepare(
      `SELECT state_history
       FROM ralph_sessions
       WHERE ticket_id = ?
       ORDER BY completed_at IS NULL DESC, started_at DESC, rowid DESC
       LIMIT 3`
    )
    .all(ticketId) as Array<{ state_history: string | null }>;

  for (const row of rows) {
    if (!row.state_history) continue;
    try {
      const history = JSON.parse(row.state_history) as unknown;
      if (!Array.isArray(history)) continue;
      for (const entry of [...history].reverse()) {
        if (!entry || typeof entry !== "object") continue;
        const metadata = (entry as { metadata?: unknown }).metadata;
        if (!metadata || typeof metadata !== "object") continue;
        const record = metadata as Record<string, unknown>;
        for (const key of ["provider", "aiBackend", "environment"]) {
          const provider = normalizeProvider(typeof record[key] === "string" ? record[key] : null);
          if (provider) return provider;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function providerFromTelemetry(db: DbHandle, ticketId: string): string | null {
  const row = db
    .prepare(
      `SELECT environment
       FROM telemetry_sessions
       WHERE ticket_id = ? AND environment IS NOT NULL AND environment != 'unknown'
       ORDER BY ended_at IS NULL DESC, started_at DESC, rowid DESC
       LIMIT 1`
    )
    .get(ticketId) as { environment: string | null } | undefined;
  return normalizeProvider(row?.environment ?? null);
}

function providerFromEnvironment(): string | null {
  for (const key of ["BRAIN_DUMP_RALPH_PROVIDER", "BRAIN_DUMP_PROVIDER"]) {
    const provider = normalizeProvider(process.env[key]);
    if (provider) return provider;
  }

  if (process.env.OPENCODE) return "opencode";
  if (process.env.CURSOR_AGENT) return "cursor-agent";
  if (process.env.COPILOT_CLI) return "copilot";
  if (process.env.CODEX) return "codex";
  if (process.env.CURSOR) return "cursor";
  if (process.env.PI) return "pi";
  if (process.env.CLAUDE_CODE || process.env.CLAUDE_CODE_ENTRYPOINT) return "claude";
  return null;
}

function resolveProvider(
  db: DbHandle,
  params: ResolveVerifierIdentityParams
): { provider: string; source: VerificationProviderSource } {
  const explicit = normalizeProvider(params.provider ?? null);
  if (explicit) return { provider: explicit, source: "explicit" };

  const session = providerFromSessionMetadata(db, params.ticketId);
  if (session) return { provider: session, source: "session" };

  const telemetry = providerFromTelemetry(db, params.ticketId);
  if (telemetry) return { provider: telemetry, source: "telemetry" };

  const environment = providerFromEnvironment();
  if (environment) return { provider: environment, source: "environment" };

  return { provider: "unknown", source: "unknown" };
}

export function resolveVerifierIdentity(
  db: DbHandle,
  params: ResolveVerifierIdentityParams
): VerifierIdentity {
  const { provider, source } = resolveProvider(db, params);
  return {
    provider,
    actor: createProviderRalphUploader(provider),
    providerSource: source,
    executionSurface: params.executionSurface,
    workerId: params.workerId ?? null,
    codeGitSha: params.codeGitSha ?? null,
  };
}
