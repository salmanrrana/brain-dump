import { createServerFn } from "@tanstack/react-start";
import { existsSync } from "fs";
import { join } from "path";
import { runGitCommand } from "../../core/git-utils";
import { createLogger } from "../lib/logger";
import { toErrorMessage } from "./errors";

const logger = createLogger("git-info");

// Type Definitions
export interface Commit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitProjectInfo {
  lastCommit: Commit | null;
  recentCommits: Commit[];
  branch: string | null;
  hasUncommittedChanges: boolean;
  remoteUrl: string | null;
}

// Helper: Parse git log line
function parseCommitLine(line: string): Commit | null {
  const parts = line.split("|");
  if (parts.length < 4) return null;

  return {
    hash: parts[0] || "",
    message: parts[1] || "",
    author: parts[2] || "",
    date: parts[3] || "",
  };
}

// Helper: Format git date to human-readable
function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${pluralize(diffMins, "minute")} ago`;
    if (diffHours < 24) return `${pluralize(diffHours, "hour")} ago`;
    if (diffDays < 7) return `${pluralize(diffDays, "day")} ago`;

    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

// Server Function: Get Paginated Git Commits
export interface GitCommitsPage {
  commits: Commit[];
  hasMore: boolean;
  nextSkip: number;
}

export const getGitCommits = createServerFn({ method: "GET" })
  .inputValidator((input: { projectPath: string; limit: number; skip: number }) => {
    if (!input.projectPath || typeof input.projectPath !== "string") {
      throw new Error("projectPath is required");
    }
    return input;
  })
  .handler(async ({ data: { projectPath, limit, skip } }): Promise<GitCommitsPage> => {
    try {
      const gitDirExists = existsSync(join(projectPath, ".git"));
      if (!gitDirExists) {
        return { commits: [], hasMore: false, nextSkip: skip };
      }

      // Fetch one extra to detect if there are more
      const result = runGitCommand(
        `git log --skip=${skip} -${limit + 1} --format="%H|%s|%an|%ai"`,
        projectPath
      );

      if (!result.success) {
        return { commits: [], hasMore: false, nextSkip: skip };
      }

      const lines = result.output.split("\n").filter((l) => l.trim());
      const hasMore = lines.length > limit;
      const commits = lines
        .slice(0, limit)
        .map((line) => parseCommitLine(line))
        .filter((c): c is Commit => c !== null)
        .map((c) => ({ ...c, date: formatDate(c.date) }));

      return { commits, hasMore, nextSkip: skip + limit };
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      logger.error("getGitCommits error", new Error(message));
      throw new Error(`Unable to read git history: ${message}`);
    }
  });

// Type Definitions: Commit File Stats
export interface CommitFileStat {
  filename: string;
  insertions: number;
  deletions: number;
  isBinary: boolean;
}

export interface CommitFileStatsResult {
  files: CommitFileStat[];
  totalInsertions: number;
  totalDeletions: number;
}

// Server Function: Get Commit File Stats (lazy-loaded on expand)
export const getCommitFileStats = createServerFn({ method: "GET" })
  .inputValidator((input: { projectPath: string; hash: string }) => {
    if (!input.projectPath || typeof input.projectPath !== "string") {
      throw new Error("projectPath is required");
    }
    if (!input.hash || !/^[0-9a-f]{4,40}$/i.test(input.hash)) {
      throw new Error("Invalid commit hash");
    }
    return input;
  })
  .handler(async ({ data: { projectPath, hash } }): Promise<CommitFileStatsResult> => {
    try {
      const gitDirExists = existsSync(join(projectPath, ".git"));
      if (!gitDirExists) {
        return { files: [], totalInsertions: 0, totalDeletions: 0 };
      }

      const result = runGitCommand(`git show --numstat --format="" ${hash}`, projectPath);

      if (!result.success) {
        throw new Error(result.error ?? "git show failed");
      }

      const files: CommitFileStat[] = [];
      let totalInsertions = 0;
      let totalDeletions = 0;

      for (const line of result.output.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split("\t");
        if (parts.length < 3) continue;

        const [ins, del, filename] = parts;
        const isBinary = ins === "-" && del === "-";
        const insertions = isBinary ? 0 : parseInt(ins!, 10) || 0;
        const deletions = isBinary ? 0 : parseInt(del!, 10) || 0;

        files.push({ filename: filename!, insertions, deletions, isBinary });
        totalInsertions += insertions;
        totalDeletions += deletions;
      }

      return { files, totalInsertions, totalDeletions };
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      logger.error("getCommitFileStats error", new Error(message));
      throw new Error(`Unable to read commit file stats: ${message}`);
    }
  });

// Server Function: Get Git Project Info
export const getGitProjectInfo = createServerFn({ method: "GET" })
  .inputValidator((projectPath: string) => {
    if (!projectPath || typeof projectPath !== "string") {
      throw new Error("projectPath is required");
    }
    return projectPath;
  })
  .handler(async ({ data: projectPath }): Promise<GitProjectInfo> => {
    const result: GitProjectInfo = {
      lastCommit: null,
      recentCommits: [],
      branch: null,
      hasUncommittedChanges: false,
      remoteUrl: null,
    };

    try {
      // Check if it's a git repository
      const gitDirExists = existsSync(join(projectPath, ".git"));
      if (!gitDirExists) {
        logger.info(`Not a git repository: ${projectPath}`);
        return result;
      }

      // Get current branch
      const branchResult = runGitCommand("git rev-parse --abbrev-ref HEAD", projectPath);
      if (branchResult.success) {
        result.branch = branchResult.output;
      }

      // Get remote URL
      const remoteResult = runGitCommand("git remote get-url origin", projectPath);
      if (remoteResult.success && remoteResult.output) {
        const remote = remoteResult.output.trim();
        const match = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
        if (match) {
          result.remoteUrl = `https://github.com/${match[1]}`;
        }
      }

      // Get last commit
      const lastCommitResult = runGitCommand('git log -1 --format="%H|%s|%an|%ai"', projectPath);
      if (lastCommitResult.success && lastCommitResult.output) {
        const commit = parseCommitLine(lastCommitResult.output);
        if (commit) {
          result.lastCommit = {
            ...commit,
            date: formatDate(commit.date),
          };
        }
      }

      // Get recent commits (last 10)
      const recentCommitsResult = runGitCommand(
        'git log -10 --format="%H|%s|%an|%ai"',
        projectPath
      );
      if (recentCommitsResult.success) {
        const lines = recentCommitsResult.output.split("\n").filter((l) => l.trim());
        result.recentCommits = lines
          .map((line) => parseCommitLine(line))
          .filter((c): c is Commit => c !== null)
          .map((c) => ({
            ...c,
            date: formatDate(c.date),
          }));
      }

      // Check for uncommitted changes
      const statusResult = runGitCommand("git status --porcelain", projectPath);
      if (statusResult.success) {
        result.hasUncommittedChanges = statusResult.output.length > 0;
      }
    } catch (err: unknown) {
      const message = toErrorMessage(err);
      if (message.includes("Not a git repository")) {
        logger.error("getGitProjectInfo error - not a git repository", new Error(message));
        throw new Error(
          "Not a git repository. Initialize with 'git init' or select a valid project path."
        );
      }
      logger.error("getGitProjectInfo error", new Error(message));
      throw new Error(`Unable to read git history: ${message}`);
    }

    return result;
  });
