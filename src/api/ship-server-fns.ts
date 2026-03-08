import type { Stats } from "fs";
import { stat as statFile } from "fs/promises";
import { join } from "path";
import { createServerFn } from "@tanstack/react-start";
import {
  CoreError,
  execFileNoThrow,
  parseGitStatusShortOutput,
  resolveShipScope,
  type DbHandle,
  type ExecFileNoThrowResult,
  type ShipScopeType,
} from "../../core/index.ts";
import { sqlite } from "../lib/db";

const REVIEW_MARKER_PATH = join(".claude", ".review-completed");
const REVIEW_MARKER_MAX_AGE_MS = 5 * 60 * 1000;
const PROTECTED_BRANCHES = new Set(["main", "master", "develop"]);

export interface ShipPrepInput {
  ticketId?: string;
  epicId?: string;
}

export interface ShipPrepChangedFile {
  path: string;
  status: string;
}

export interface ShipPrepScopeRef {
  type: ShipScopeType;
  id: string;
  title: string;
}

export interface ShipPrepData {
  changedFiles: ShipPrepChangedFile[];
  currentBranch: string;
  isSafeToShip: boolean;
  reviewMarkerFresh: boolean;
  ghAvailable: boolean;
  remoteConfigured: boolean;
  inferredScope: ShipPrepScopeRef | null;
}

export type ShipPrepResult = ({ success: true } & ShipPrepData) | { success: false; error: string };

export interface ShipPrepDeps {
  db: DbHandle;
  execFileNoThrow: (
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxBuffer?: number }
  ) => Promise<ExecFileNoThrowResult>;
  stat: (path: string) => Promise<Pick<Stats, "mtimeMs">>;
  now: () => number;
}

function resolveShipPrepScopeInput(input: ShipPrepInput): {
  scopeType: ShipScopeType;
  scopeId: string;
} {
  const hasTicketId = typeof input.ticketId === "string" && input.ticketId.length > 0;
  const hasEpicId = typeof input.epicId === "string" && input.epicId.length > 0;

  if (hasTicketId === hasEpicId) {
    throw new Error("Provide exactly one of ticketId or epicId");
  }

  if (hasTicketId) {
    return {
      scopeType: "ticket",
      scopeId: input.ticketId!,
    };
  }

  return {
    scopeType: "epic",
    scopeId: input.epicId!,
  };
}

function getCommandError(
  description: string,
  result: ExecFileNoThrowResult,
  fallback: string
): Error {
  const detail = result.stderr.trim() || result.error || fallback;
  return new Error(`${description}: ${detail}`);
}

export async function isReviewMarkerFresh(
  projectPath: string,
  deps: Pick<ShipPrepDeps, "stat" | "now">
): Promise<boolean> {
  try {
    const markerStat = await deps.stat(join(projectPath, REVIEW_MARKER_PATH));
    return deps.now() - markerStat.mtimeMs <= REVIEW_MARKER_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export async function getShipPrepData(
  input: ShipPrepInput,
  deps: ShipPrepDeps
): Promise<ShipPrepData> {
  const scopeInput = resolveShipPrepScopeInput(input);
  const scope = resolveShipScope(deps.db, scopeInput);
  const commandOptions = { cwd: scope.projectPath };

  const [statusResult, branchResult, ghResult, remoteResult, reviewMarkerFresh] = await Promise.all(
    [
      deps.execFileNoThrow("git", ["status", "--short"], commandOptions),
      deps.execFileNoThrow("git", ["branch", "--show-current"], commandOptions),
      deps.execFileNoThrow("which", ["gh"]),
      deps.execFileNoThrow("git", ["remote"], commandOptions),
      isReviewMarkerFresh(scope.projectPath, deps),
    ]
  );

  if (!statusResult.success) {
    throw getCommandError("Unable to inspect changed files", statusResult, "git status failed");
  }

  if (!branchResult.success) {
    throw getCommandError("Unable to determine current branch", branchResult, "git branch failed");
  }

  if (!remoteResult.success) {
    throw getCommandError("Unable to inspect git remotes", remoteResult, "git remote failed");
  }

  const currentBranch = branchResult.stdout.trim();

  return {
    changedFiles: parseGitStatusShortOutput(statusResult.stdout).map((entry) => ({
      path: entry.path,
      status: entry.status,
    })),
    currentBranch,
    isSafeToShip: !PROTECTED_BRANCHES.has(currentBranch),
    reviewMarkerFresh,
    ghAvailable: ghResult.success && ghResult.stdout.trim().length > 0,
    remoteConfigured: remoteResult.stdout.trim().length > 0,
    inferredScope: {
      type: scope.scopeType,
      id: scope.scopeId,
      title: scope.title,
    },
  };
}

const defaultShipPrepDeps: ShipPrepDeps = {
  db: sqlite,
  execFileNoThrow,
  stat: statFile,
  now: () => Date.now(),
};

export const getShipPrep = createServerFn({ method: "POST" })
  .inputValidator((data: ShipPrepInput) => data)
  .handler(async ({ data }: { data: ShipPrepInput }): Promise<ShipPrepResult> => {
    try {
      const result = await getShipPrepData(data, defaultShipPrepDeps);
      return {
        success: true as const,
        ...result,
      };
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof CoreError
            ? error.message
            : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
