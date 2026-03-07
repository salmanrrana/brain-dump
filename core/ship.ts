import { execFile } from "child_process";
import { EpicNotFoundError, TicketNotFoundError } from "./errors.ts";
import type {
  DbHandle,
  ExecFileNoThrowOptions,
  ExecFileNoThrowResult,
  GitStatusEntry,
  PullRequestRef,
  ResolvedEpicShipScope,
  ResolvedShipScope,
  ResolvedTicketShipScope,
  ShipScopeType,
} from "./types.ts";

export const DEMO_STEPS_SENTINEL = "<!-- brain-dump:demo-steps -->";

interface TicketShipScopeRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  project_name: string;
  project_path: string;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: "draft" | "open" | "merged" | "closed" | null;
  epic_id: string | null;
}

interface EpicShipScopeRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
  project_name: string;
  project_path: string;
  epic_branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: "draft" | "open" | "merged" | "closed" | null;
}

function normalizeGitPath(rawPath: string): { path: string; originalPath?: string } {
  const trimmedPath = rawPath.trim();
  const renameParts = trimmedPath.split(" -> ");

  if (renameParts.length !== 2) {
    return { path: trimmedPath };
  }

  return {
    originalPath: renameParts[0]!.trim(),
    path: renameParts[1]!.trim(),
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveTicketShipScope(db: DbHandle, scopeId: string): ResolvedTicketShipScope {
  const row = db
    .prepare(
      `SELECT
         t.id,
         t.title,
         t.description,
         t.project_id,
         p.name AS project_name,
         p.path AS project_path,
         t.branch_name,
         t.pr_number,
         t.pr_url,
         t.pr_status,
         t.epic_id
       FROM tickets t
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`
    )
    .get(scopeId) as TicketShipScopeRow | undefined;

  if (!row) {
    throw new TicketNotFoundError(scopeId);
  }

  return {
    scopeType: "ticket",
    scopeId: row.id,
    ticketId: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    projectName: row.project_name,
    projectPath: row.project_path,
    branchName: row.branch_name,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prStatus: row.pr_status,
    epicId: row.epic_id,
  };
}

function resolveEpicShipScope(db: DbHandle, scopeId: string): ResolvedEpicShipScope {
  const row = db
    .prepare(
      `SELECT
         e.id,
         e.title,
         e.description,
         e.project_id,
         p.name AS project_name,
         p.path AS project_path,
         ews.epic_branch_name,
         ews.pr_number,
         ews.pr_url,
         ews.pr_status
       FROM epics e
       JOIN projects p ON p.id = e.project_id
       LEFT JOIN epic_workflow_state ews ON ews.epic_id = e.id
       WHERE e.id = ?`
    )
    .get(scopeId) as EpicShipScopeRow | undefined;

  if (!row) {
    throw new EpicNotFoundError(scopeId);
  }

  const ticketIds = db
    .prepare("SELECT id FROM tickets WHERE epic_id = ? ORDER BY position ASC, created_at ASC")
    .all(scopeId) as Array<{ id: string }>;

  return {
    scopeType: "epic",
    scopeId: row.id,
    epicId: row.id,
    title: row.title,
    description: row.description,
    projectId: row.project_id,
    projectName: row.project_name,
    projectPath: row.project_path,
    branchName: row.epic_branch_name,
    prNumber: row.pr_number,
    prUrl: row.pr_url,
    prStatus: row.pr_status,
    ticketIds: ticketIds.map((ticket) => ticket.id),
  };
}

export async function execFileNoThrow(
  command: string,
  args: string[],
  options: ExecFileNoThrowOptions = {}
): Promise<ExecFileNoThrowResult> {
  return await new Promise((resolve) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        maxBuffer: options.maxBuffer,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            success: true,
            stdout,
            stderr,
            exitCode: 0,
          });
          return;
        }

        const execError = error as NodeJS.ErrnoException & {
          code?: number | string;
        };

        resolve({
          success: false,
          stdout,
          stderr,
          exitCode: typeof execError.code === "number" ? execError.code : null,
          error: execError.message,
        });
      }
    );
  });
}

export function resolveShipScope(
  db: DbHandle,
  params: { scopeType: ShipScopeType; scopeId: string }
): ResolvedShipScope {
  return params.scopeType === "ticket"
    ? resolveTicketShipScope(db, params.scopeId)
    : resolveEpicShipScope(db, params.scopeId);
}

export function parseGitStatusShortOutput(output: string): GitStatusEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter(Boolean)
    .map((line) => {
      const statusCode = line.slice(0, 2);
      const rawPath = line.slice(3);
      const normalizedPath = normalizeGitPath(rawPath);

      return {
        path: normalizedPath.path,
        status: statusCode === "??" ? "??" : statusCode.replace(/ /g, ""),
        indexStatus: statusCode[0] ?? " ",
        workingTreeStatus: statusCode[1] ?? " ",
        ...(normalizedPath.originalPath ? { originalPath: normalizedPath.originalPath } : {}),
      };
    });
}

export function parseCommitHashFromOutput(output: string): string | null {
  const bracketMatch = output.match(/\[[^\]]*?([0-9a-f]{7,40})\]/i);
  if (bracketMatch?.[1]) {
    return bracketMatch[1];
  }

  const fallbackMatch = output.match(/\b([0-9a-f]{7,40})\b/i);
  return fallbackMatch?.[1] ?? null;
}

export function parsePullRequestRef(output: string): PullRequestRef | null {
  const matches = [...output.matchAll(/(https?:\/\/\S+\/pull\/(\d+))/gi)];
  const lastMatch = matches[matches.length - 1];

  if (!lastMatch?.[1] || !lastMatch[2]) {
    return null;
  }

  return {
    url: lastMatch[1],
    number: Number(lastMatch[2]),
  };
}

export function replaceSentinelBlock(
  body: string,
  replacement: string,
  sentinel = DEMO_STEPS_SENTINEL
): string {
  if (!body.includes(sentinel)) {
    return body;
  }

  const normalizedReplacement = replacement.trim();
  const replacementBlock = normalizedReplacement
    ? `${sentinel}\n${normalizedReplacement}\n`
    : `${sentinel}\n`;
  const sentinelPattern = new RegExp(`${escapeRegExp(sentinel)}[\\s\\S]*?(?=\\n##\\s|$)`);

  return body.replace(sentinelPattern, replacementBlock);
}
