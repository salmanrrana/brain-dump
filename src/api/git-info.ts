import { createServerFn } from "@tanstack/react-start";
import { existsSync } from "fs";
import { runGitCommand } from "../../core/git-utils";
import { createLogger } from "../lib/logger";

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
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

// Server Function: Get Git Project Info
export const getGitProjectInfo = createServerFn({ method: "GET" })
  .inputValidator((projectPath: string) => projectPath)
  .handler(async ({ data: projectPath }): Promise<GitProjectInfo> => {
    const result: GitProjectInfo = {
      lastCommit: null,
      recentCommits: [],
      branch: null,
      hasUncommittedChanges: false,
    };

    try {
      // Check if it's a git repository
      const gitDirExists = existsSync(`${projectPath}/.git`);
      if (!gitDirExists) {
        logger.info(`Not a git repository: ${projectPath}`);
        return result;
      }

      // Get current branch
      const branchResult = runGitCommand("git rev-parse --abbrev-ref HEAD", projectPath);
      if (branchResult.success) {
        result.branch = branchResult.output;
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
      const message = err instanceof Error ? err.message : String(err);
      logger.error("getGitProjectInfo error", new Error(message));
    }

    return result;
  });
