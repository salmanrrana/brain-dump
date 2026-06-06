import { existsSync } from "fs";
import { join } from "path";
import { EpicNotFoundError, TicketNotFoundError } from "./errors.ts";
import { safeJsonParse } from "./json.ts";
import { execFileNoThrow } from "./ship.ts";
import type { Commit, DbHandle, ExecFileNoThrowOptions, ExecFileNoThrowResult } from "./types.ts";

const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 8 * 1024 * 1024;
const PATCH_MAX_BUFFER = 16 * 1024 * 1024;

export type CodeChangeScope = { type: "ticket"; id: string } | { type: "epic"; id: string };

export type CodeChangeSourceKind =
  | "linked_commit"
  | "ticket_branch"
  | "ticket_pr"
  | "epic_branch"
  | "epic_pr"
  | "unavailable";

export type CodeChangeStateKind =
  | "available"
  | "metadata_only"
  | "no_linked_changes"
  | "missing_git_repo"
  | "missing_commit"
  | "missing_branch"
  | "git_command_failed"
  | "invalid_selection";

export interface CodeChangeState {
  kind: CodeChangeStateKind;
  message: string;
  command?: string;
  stderr?: string;
}

export interface CodeChangeSource {
  id: string;
  kind: CodeChangeSourceKind;
  label: string;
  state: CodeChangeState;
  commitHash?: string;
  commitMessage?: string;
  branchName?: string;
  prNumber?: number;
  prUrl?: string;
  prStatus?: string | null;
}

export interface CodeChangeFileSummary {
  path: string;
  previousPath?: string;
  additions: number;
  deletions: number;
  binary: boolean;
  status: string;
  sourceIds: string[];
}

export interface TicketCodeChangeGroup {
  ticketId: string;
  title: string;
  status: string;
  sources: CodeChangeSource[];
  files: CodeChangeFileSummary[];
  totals: {
    files: number;
    additions: number;
    deletions: number;
  };
  state: CodeChangeState;
}

export interface CodeChangeSummaryResult {
  scope: CodeChangeScope;
  project: {
    id: string;
    name: string;
  };
  groups: TicketCodeChangeGroup[];
  totals: {
    files: number;
    additions: number;
    deletions: number;
  };
  state: CodeChangeState;
}

export interface CodeChangePatch {
  sourceId: string;
  sourceLabel: string;
  patch: string;
}

export interface CodeChangePatchResult {
  scope: CodeChangeScope;
  ticketId?: string;
  filePath?: string;
  patches: CodeChangePatch[];
  state: CodeChangeState;
}

export interface CodeChangeDeps {
  db: DbHandle;
  execFileNoThrow: (
    command: string,
    args: string[],
    options?: ExecFileNoThrowOptions
  ) => Promise<ExecFileNoThrowResult>;
}

interface TicketCodeChangeRow {
  id: string;
  title: string;
  status: string;
  project_id: string;
  project_name: string;
  project_path: string;
  epic_id: string | null;
  linked_commits: string | null;
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
}

interface EpicCodeChangeRow {
  id: string;
  title: string;
  project_id: string;
  project_name: string;
  project_path: string;
  epic_branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_status: string | null;
}

interface SourceWithFiles {
  source: CodeChangeSource;
  files: CodeChangeFileSummary[];
}

export const defaultCodeChangeDeps: Omit<CodeChangeDeps, "db"> = {
  execFileNoThrow,
};

function availableState(message = "Code changes are available."): CodeChangeState {
  return { kind: "available", message };
}

function metadataOnlyState(message: string): CodeChangeState {
  return { kind: "metadata_only", message };
}

function unavailableState(
  kind: Exclude<CodeChangeStateKind, "available" | "metadata_only">,
  message: string
): CodeChangeState {
  return { kind, message };
}

function gitFailureState(command: string, result: ExecFileNoThrowResult): CodeChangeState {
  const stderr = result.stderr.trim();

  return {
    kind: "git_command_failed",
    message: stderr || result.error || `${command} failed`,
    command,
    ...(stderr ? { stderr } : {}),
  };
}

function getTicketRowsForScope(
  db: DbHandle,
  scope: CodeChangeScope
): {
  project: { id: string; name: string; path: string };
  tickets: TicketCodeChangeRow[];
  epic?: EpicCodeChangeRow;
} {
  if (scope.type === "ticket") {
    const ticket = db
      .prepare(
        `SELECT
           t.id,
           t.title,
           t.status,
           t.project_id,
           p.name AS project_name,
           p.path AS project_path,
           t.epic_id,
           t.linked_commits,
           t.branch_name,
           t.pr_number,
           t.pr_url,
           t.pr_status
         FROM tickets t
         JOIN projects p ON p.id = t.project_id
         WHERE t.id = ?`
      )
      .get(scope.id) as TicketCodeChangeRow | undefined;

    if (!ticket) {
      throw new TicketNotFoundError(scope.id);
    }

    return {
      project: { id: ticket.project_id, name: ticket.project_name, path: ticket.project_path },
      tickets: [ticket],
    };
  }

  const epic = db
    .prepare(
      `SELECT
         e.id,
         e.title,
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
    .get(scope.id) as EpicCodeChangeRow | undefined;

  if (!epic) {
    throw new EpicNotFoundError(scope.id);
  }

  const tickets = db
    .prepare(
      `SELECT
         t.id,
         t.title,
         t.status,
         t.project_id,
         p.name AS project_name,
         p.path AS project_path,
         t.epic_id,
         t.linked_commits,
         t.branch_name,
         t.pr_number,
         t.pr_url,
         t.pr_status
       FROM tickets t
       JOIN projects p ON p.id = t.project_id
       WHERE t.epic_id = ?
       ORDER BY t.position ASC, t.created_at ASC`
    )
    .all(scope.id) as TicketCodeChangeRow[];

  return {
    project: { id: epic.project_id, name: epic.project_name, path: epic.project_path },
    tickets,
    epic,
  };
}

function hasGitRepo(projectPath: string): boolean {
  return existsSync(join(projectPath, ".git"));
}

async function runGit(
  deps: CodeChangeDeps,
  projectPath: string,
  args: string[],
  maxBuffer = GIT_MAX_BUFFER
): Promise<ExecFileNoThrowResult> {
  return await deps.execFileNoThrow("git", args, {
    cwd: projectPath,
    timeoutMs: GIT_TIMEOUT_MS,
    maxBuffer,
  });
}

async function resolveBaseBranch(
  deps: CodeChangeDeps,
  projectPath: string
): Promise<string | null> {
  const main = await runGit(deps, projectPath, ["rev-parse", "--verify", "main"]);
  if (main.success) {
    return "main";
  }

  const master = await runGit(deps, projectPath, ["rev-parse", "--verify", "master"]);
  return master.success ? "master" : null;
}

function parseNameStatusOutput(
  output: string
): Map<string, { status: string; previousPath?: string }> {
  const statuses = new Map<string, { status: string; previousPath?: string }>();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split("\t");
    const rawStatus = parts[0] ?? "M";
    const status = rawStatus[0] ?? "M";

    if ((status === "R" || status === "C") && parts[1] && parts[2]) {
      statuses.set(parts[2], { status, previousPath: parts[1] });
      continue;
    }

    if (parts[1]) {
      statuses.set(parts[1], { status });
    }
  }

  return statuses;
}

function normalizeNumstatPath(rawPath: string): { path: string; previousPath?: string } {
  const trimmed = rawPath.trim();
  const braceMatch = trimmed.match(/^(.*?)\{(.+?) => (.+?)\}(.*)$/);
  if (braceMatch) {
    const prefix = braceMatch[1] ?? "";
    const oldPart = braceMatch[2] ?? "";
    const newPart = braceMatch[3] ?? "";
    const suffix = braceMatch[4] ?? "";
    return {
      previousPath: `${prefix}${oldPart}${suffix}`,
      path: `${prefix}${newPart}${suffix}`,
    };
  }

  const arrowParts = trimmed.split(" => ");
  if (arrowParts.length === 2) {
    return {
      previousPath: arrowParts[0]!.trim(),
      path: arrowParts[1]!.trim(),
    };
  }

  return { path: trimmed };
}

function parseNumstatOutput(
  numstatOutput: string,
  statusOutput: string,
  sourceId: string
): CodeChangeFileSummary[] {
  const statusByPath = parseNameStatusOutput(statusOutput);
  const summaries = new Map<string, CodeChangeFileSummary>();

  for (const line of numstatOutput.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const parts = trimmed.split("\t");
    if (parts.length < 3) {
      continue;
    }

    const [rawAdditions, rawDeletions, ...pathParts] = parts;
    const normalizedPath = normalizeNumstatPath(pathParts.join("\t"));
    const statusInfo = statusByPath.get(normalizedPath.path);
    const binary = rawAdditions === "-" && rawDeletions === "-";
    const additions = binary ? 0 : Number.parseInt(rawAdditions ?? "0", 10) || 0;
    const deletions = binary ? 0 : Number.parseInt(rawDeletions ?? "0", 10) || 0;
    const previousPath = normalizedPath.previousPath ?? statusInfo?.previousPath;
    const key = `${normalizedPath.path}\0${previousPath ?? ""}`;

    summaries.set(key, {
      path: normalizedPath.path,
      ...(previousPath ? { previousPath } : {}),
      additions,
      deletions,
      binary,
      status: statusInfo?.status ?? (previousPath ? "R" : "M"),
      sourceIds: [sourceId],
    });
  }

  return [...summaries.values()];
}

async function readCommitSource(
  deps: CodeChangeDeps,
  ticketId: string,
  projectPath: string,
  commit: Commit
): Promise<SourceWithFiles> {
  const sourceId = `ticket:${ticketId}:commit:${commit.hash}`;
  const sourceBase = {
    id: sourceId,
    kind: "linked_commit" as const,
    label: `Commit ${commit.hash.slice(0, 8)}`,
    commitHash: commit.hash,
    commitMessage: commit.message,
  };

  const verifyResult = await runGit(deps, projectPath, [
    "cat-file",
    "-e",
    "--end-of-options",
    `${commit.hash}^{commit}`,
  ]);
  if (!verifyResult.success) {
    return {
      source: {
        ...sourceBase,
        state: unavailableState(
          "missing_commit",
          `Linked commit ${commit.hash} is not available in this repository.`
        ),
      },
      files: [],
    };
  }

  const [numstatResult, statusResult] = await Promise.all([
    runGit(deps, projectPath, [
      "show",
      "--numstat",
      "--format=",
      "--find-renames",
      "--end-of-options",
      commit.hash,
    ]),
    runGit(deps, projectPath, [
      "show",
      "--name-status",
      "--format=",
      "--find-renames",
      "--end-of-options",
      commit.hash,
    ]),
  ]);

  if (!numstatResult.success) {
    return {
      source: { ...sourceBase, state: gitFailureState("git show --numstat", numstatResult) },
      files: [],
    };
  }

  if (!statusResult.success) {
    return {
      source: { ...sourceBase, state: gitFailureState("git show --name-status", statusResult) },
      files: [],
    };
  }

  return {
    source: { ...sourceBase, state: availableState() },
    files: parseNumstatOutput(numstatResult.stdout, statusResult.stdout, sourceId),
  };
}

async function readBranchSource(
  deps: CodeChangeDeps,
  params: {
    ticketId: string;
    projectPath: string;
    branchName: string;
    kind: "ticket_branch" | "epic_branch";
  }
): Promise<SourceWithFiles> {
  const sourceId = `ticket:${params.ticketId}:branch:${params.branchName}`;
  const sourceBase = {
    id: sourceId,
    kind: params.kind,
    label: `Branch ${params.branchName}`,
    branchName: params.branchName,
  };

  const verifyResult = await runGit(deps, params.projectPath, [
    "rev-parse",
    "--verify",
    "--end-of-options",
    params.branchName,
  ]);
  if (!verifyResult.success) {
    return {
      source: {
        ...sourceBase,
        state: unavailableState(
          "missing_branch",
          `Branch ${params.branchName} is not available in this repository.`
        ),
      },
      files: [],
    };
  }

  const baseBranch = await resolveBaseBranch(deps, params.projectPath);
  if (!baseBranch) {
    return {
      source: {
        ...sourceBase,
        state: unavailableState(
          "missing_branch",
          "Neither main nor master is available for branch comparison."
        ),
      },
      files: [],
    };
  }

  const range = `${baseBranch}...${params.branchName}`;
  const [numstatResult, statusResult] = await Promise.all([
    runGit(deps, params.projectPath, [
      "diff",
      "--numstat",
      "--find-renames",
      "--end-of-options",
      range,
    ]),
    runGit(deps, params.projectPath, [
      "diff",
      "--name-status",
      "--find-renames",
      "--end-of-options",
      range,
    ]),
  ]);

  if (!numstatResult.success) {
    return {
      source: { ...sourceBase, state: gitFailureState("git diff --numstat", numstatResult) },
      files: [],
    };
  }

  if (!statusResult.success) {
    return {
      source: { ...sourceBase, state: gitFailureState("git diff --name-status", statusResult) },
      files: [],
    };
  }

  return {
    source: { ...sourceBase, state: availableState() },
    files: parseNumstatOutput(numstatResult.stdout, statusResult.stdout, sourceId),
  };
}

function buildPrSource(
  ticketId: string,
  ticket: TicketCodeChangeRow,
  kind: "ticket_pr" | "epic_pr"
): CodeChangeSource | null {
  if (ticket.pr_number === null && !ticket.pr_url) {
    return null;
  }

  const label = ticket.pr_number === null ? "Pull request" : `PR #${ticket.pr_number}`;
  return {
    id: `ticket:${ticketId}:pr:${ticket.pr_number ?? ticket.pr_url ?? "metadata"}`,
    kind,
    label,
    state: metadataOnlyState(
      "Pull request metadata is available; file summaries come from linked commits or branches."
    ),
    ...(ticket.pr_number !== null ? { prNumber: ticket.pr_number } : {}),
    ...(ticket.pr_url ? { prUrl: ticket.pr_url } : {}),
    prStatus: ticket.pr_status,
  };
}

function mergeFileSummaries(files: CodeChangeFileSummary[]): CodeChangeFileSummary[] {
  const merged = new Map<string, CodeChangeFileSummary>();

  for (const file of files) {
    const key = `${file.path}\0${file.previousPath ?? ""}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...file, sourceIds: [...file.sourceIds] });
      continue;
    }

    existing.additions += file.additions;
    existing.deletions += file.deletions;
    existing.binary = existing.binary || file.binary;
    existing.status = existing.status === file.status ? existing.status : "M";
    existing.sourceIds = [...new Set([...existing.sourceIds, ...file.sourceIds])];
  }

  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function getGroupState(
  sources: CodeChangeSource[],
  files: CodeChangeFileSummary[]
): CodeChangeState {
  if (files.length > 0) {
    return availableState(`${files.length} changed file${files.length === 1 ? "" : "s"} found.`);
  }

  const unavailableSource = sources.find(
    (source) => source.state.kind !== "metadata_only" && source.state.kind !== "available"
  );
  if (unavailableSource) {
    return unavailableSource.state;
  }

  if (sources.some((source) => source.state.kind === "metadata_only")) {
    return metadataOnlyState("Only metadata sources are available for this ticket.");
  }

  return unavailableState(
    "no_linked_changes",
    "No linked commits, branch, or pull request metadata is available for this ticket."
  );
}

function createTotals(files: CodeChangeFileSummary[]): {
  files: number;
  additions: number;
  deletions: number;
} {
  return files.reduce(
    (totals, file) => ({
      files: totals.files + 1,
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 }
  );
}

async function buildTicketGroup(
  deps: CodeChangeDeps,
  ticket: TicketCodeChangeRow,
  projectPath: string,
  options: {
    epicBranchName?: string | null;
    epicPr?: Pick<EpicCodeChangeRow, "pr_number" | "pr_url" | "pr_status">;
  }
): Promise<TicketCodeChangeGroup> {
  const linkedCommits = safeJsonParse<Commit[]>(ticket.linked_commits, []);
  const sourceResults = await Promise.all(
    linkedCommits.map((commit) => readCommitSource(deps, ticket.id, projectPath, commit))
  );

  if (ticket.branch_name) {
    sourceResults.push(
      await readBranchSource(deps, {
        ticketId: ticket.id,
        projectPath,
        branchName: ticket.branch_name,
        kind: "ticket_branch",
      })
    );
  }

  if (options.epicBranchName) {
    sourceResults.push(
      await readBranchSource(deps, {
        ticketId: ticket.id,
        projectPath,
        branchName: options.epicBranchName,
        kind: "epic_branch",
      })
    );
  }

  const sources = sourceResults.map((result) => result.source);
  const prSource = buildPrSource(ticket.id, ticket, "ticket_pr");
  if (prSource) {
    sources.push(prSource);
  }

  if (options.epicPr && (options.epicPr.pr_number !== null || options.epicPr.pr_url)) {
    sources.push({
      id: `ticket:${ticket.id}:epic-pr:${options.epicPr.pr_number ?? options.epicPr.pr_url ?? "metadata"}`,
      kind: "epic_pr",
      label:
        options.epicPr.pr_number === null
          ? "Epic pull request"
          : `Epic PR #${options.epicPr.pr_number}`,
      state: metadataOnlyState(
        "Epic pull request metadata is available; file summaries come from linked commits or branches."
      ),
      ...(options.epicPr.pr_number !== null ? { prNumber: options.epicPr.pr_number } : {}),
      ...(options.epicPr.pr_url ? { prUrl: options.epicPr.pr_url } : {}),
      prStatus: options.epicPr.pr_status,
    });
  }

  const files = mergeFileSummaries(sourceResults.flatMap((result) => result.files));

  return {
    ticketId: ticket.id,
    title: ticket.title,
    status: ticket.status,
    sources,
    files,
    totals: createTotals(files),
    state: getGroupState(sources, files),
  };
}

function getSummaryState(groups: TicketCodeChangeGroup[]): CodeChangeState {
  if (groups.length === 0) {
    return unavailableState("no_linked_changes", "No tickets are available in this scope.");
  }

  if (groups.some((group) => group.files.length > 0)) {
    return availableState("Code changes are available for this scope.");
  }

  const firstUnavailable = groups.find(
    (group) => group.state.kind !== "metadata_only" && group.state.kind !== "available"
  );
  return (
    firstUnavailable?.state ??
    metadataOnlyState("Only metadata sources are available for this scope.")
  );
}

export async function getCodeChangeSummary(
  scope: CodeChangeScope,
  deps: CodeChangeDeps
): Promise<CodeChangeSummaryResult> {
  const { project, tickets, epic } = getTicketRowsForScope(deps.db, scope);

  if (!hasGitRepo(project.path)) {
    const state = unavailableState(
      "missing_git_repo",
      `Project path ${project.path} is not a git repository.`
    );
    const groups = tickets.map((ticket) => ({
      ticketId: ticket.id,
      title: ticket.title,
      status: ticket.status,
      sources: [
        {
          id: `ticket:${ticket.id}:unavailable:missing-git-repo`,
          kind: "unavailable" as const,
          label: "Git repository unavailable",
          state,
        },
      ],
      files: [],
      totals: createTotals([]),
      state,
    }));

    return {
      scope,
      project: { id: project.id, name: project.name },
      groups,
      totals: createTotals([]),
      state,
    };
  }

  const groupOptions = {
    ...(epic?.epic_branch_name ? { epicBranchName: epic.epic_branch_name } : {}),
    ...(epic
      ? {
          epicPr: {
            pr_number: epic.pr_number,
            pr_url: epic.pr_url,
            pr_status: epic.pr_status,
          },
        }
      : {}),
  };
  const groups = await Promise.all(
    tickets.map((ticket) => buildTicketGroup(deps, ticket, project.path, groupOptions))
  );

  return {
    scope,
    project: { id: project.id, name: project.name },
    groups,
    totals: createTotals(mergeFileSummaries(groups.flatMap((group) => group.files))),
    state: getSummaryState(groups),
  };
}

function parseSourceId(
  sourceId: string
):
  | { ticketId: string; kind: "commit"; value: string }
  | { ticketId: string; kind: "branch"; value: string }
  | null {
  const commitMatch = sourceId.match(/^ticket:(.+):commit:(.+)$/);
  if (commitMatch?.[1] && commitMatch[2]) {
    return { ticketId: commitMatch[1], kind: "commit", value: commitMatch[2] };
  }

  const branchMatch = sourceId.match(/^ticket:(.+):branch:(.+)$/);
  if (branchMatch?.[1] && branchMatch[2]) {
    return { ticketId: branchMatch[1], kind: "branch", value: branchMatch[2] };
  }

  return null;
}

function validatePatchSelection(
  groups: TicketCodeChangeGroup[],
  sourceId: string | undefined,
  ticketId: string | undefined
): CodeChangeSource[] {
  const scopedGroups = ticketId ? groups.filter((group) => group.ticketId === ticketId) : groups;
  if (scopedGroups.length === 0) {
    return [];
  }

  const sources = scopedGroups.flatMap((group) => group.sources);
  return sourceId ? sources.filter((source) => source.id === sourceId) : sources;
}

async function readPatchForSource(
  deps: CodeChangeDeps,
  projectPath: string,
  source: CodeChangeSource,
  filePath?: string
): Promise<CodeChangePatch | CodeChangeState> {
  const parsed = parseSourceId(source.id);
  if (!parsed) {
    return unavailableState(
      "invalid_selection",
      `Source ${source.id} does not support patch retrieval.`
    );
  }

  let args: string[];
  if (parsed.kind === "commit") {
    args = ["show", "--format=", "--find-renames", "--end-of-options", parsed.value];
  } else {
    const baseBranch = await resolveBaseBranch(deps, projectPath);
    if (!baseBranch) {
      return unavailableState(
        "missing_branch",
        "Neither main nor master is available for branch comparison."
      );
    }
    args = ["diff", "--find-renames", `${baseBranch}...${parsed.value}`];
  }

  if (filePath) {
    args.push("--", filePath);
  }

  const result = await runGit(deps, projectPath, args, PATCH_MAX_BUFFER);
  if (!result.success) {
    return gitFailureState(`git ${args.slice(0, 2).join(" ")}`, result);
  }

  return {
    sourceId: source.id,
    sourceLabel: source.label,
    patch: result.stdout,
  };
}

function createPatchResult(input: {
  scope: CodeChangeScope;
  ticketId: string | undefined;
  filePath: string | undefined;
  patches: CodeChangePatch[];
  state: CodeChangeState;
}): CodeChangePatchResult {
  return {
    scope: input.scope,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    ...(input.filePath ? { filePath: input.filePath } : {}),
    patches: input.patches,
    state: input.state,
  };
}

export async function getCodeChangePatch(
  input: {
    scope: CodeChangeScope;
    ticketId?: string;
    sourceId?: string;
    filePath?: string;
  },
  deps: CodeChangeDeps
): Promise<CodeChangePatchResult> {
  const summaryContext = getTicketRowsForScope(deps.db, input.scope);
  if (!hasGitRepo(summaryContext.project.path)) {
    return createPatchResult({
      scope: input.scope,
      ticketId: input.ticketId,
      filePath: input.filePath,
      patches: [],
      state: unavailableState(
        "missing_git_repo",
        `Project path ${summaryContext.project.path} is not a git repository.`
      ),
    });
  }

  const summary = await getCodeChangeSummary(input.scope, deps);
  const selectedSources = validatePatchSelection(
    summary.groups,
    input.sourceId,
    input.ticketId
  ).filter((source) => source.state.kind === "available");

  if (selectedSources.length === 0) {
    return createPatchResult({
      scope: input.scope,
      ticketId: input.ticketId,
      filePath: input.filePath,
      patches: [],
      state: unavailableState(
        "invalid_selection",
        "No available patch source matched the selected ticket/source."
      ),
    });
  }

  const patchResults = await Promise.all(
    selectedSources.map((source) =>
      readPatchForSource(deps, summaryContext.project.path, source, input.filePath)
    )
  );
  const firstState = patchResults.find((result): result is CodeChangeState => "kind" in result);
  const patches = patchResults.filter((result): result is CodeChangePatch => "patch" in result);

  return createPatchResult({
    scope: input.scope,
    ticketId: input.ticketId,
    filePath: input.filePath,
    patches,
    state:
      patches.length > 0
        ? availableState("Patch data is available.")
        : (firstState ?? unavailableState("invalid_selection", "No patch data is available.")),
  });
}
