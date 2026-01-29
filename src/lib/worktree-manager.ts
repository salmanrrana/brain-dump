/**
 * Git worktree management for epic isolation.
 * Handles creation, validation, and cleanup of worktree directories.
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "fs";
import { join, dirname, basename } from "path";
import { z } from "zod";

export interface WorktreeCreationResult {
  success: boolean;
  worktreePath?: string;
  message?: string;
  error?: string;
}

export interface WorktreeOptions {
  projectPath: string;
  branchName: string;
  epicId: string;
  epicTitle: string;
  mainRepoPath?: string;
}

/**
 * P2 FIX: Path validation schema to prevent path traversal.
 */
const projectPathSchema = z
  .string()
  .min(1, "Project path is required")
  .refine((path) => !path.includes(".."), "Path traversal not allowed")
  .refine((path) => path.startsWith("/"), "Must be absolute path");

/**
 * Create a git worktree for epic isolation.
 * P1 FIX: Granular error handling for different failure modes.
 * P2 FIX: Windows-compatible directory permissions.
 *
 * @param options - Worktree creation options
 * @returns Result with worktree path or error details
 */
export function createWorktree(options: WorktreeOptions): WorktreeCreationResult {
  const { projectPath, branchName, epicId, epicTitle, mainRepoPath } = options;

  // P2 FIX: Validate project path
  const pathValidation = projectPathSchema.safeParse(projectPath);
  if (!pathValidation.success) {
    return {
      success: false,
      error: `Invalid project path: ${pathValidation.error.message}`,
    };
  }

  // Generate worktree path
  const projectName = basename(projectPath);
  const epicShortId = epicId.substring(0, 8);
  const epicSlug = epicTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 30);

  const worktreeName = epicSlug
    ? `${projectName}-epic-${epicShortId}-${epicSlug}`
    : `${projectName}-epic-${epicShortId}`;

  const worktreePath = join(dirname(projectPath), worktreeName);

  // Check if worktree path already exists
  if (existsSync(worktreePath)) {
    return {
      success: false,
      worktreePath,
      error: `Worktree directory already exists: ${worktreePath}`,
    };
  }

  // Create worktree using git
  try {
    execFileSync("git", ["worktree", "add", worktreePath, "-b", branchName], {
      cwd: projectPath,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch (gitError: unknown) {
    // P1 FIX: Granular error handling
    if (gitError && typeof gitError === "object") {
      const error = gitError as { code?: string; message?: string; stderr?: string };

      // Case 1: Git command not found (spawn failure)
      if (error.code === "ENOENT") {
        return {
          success: false,
          error: "Git not found. Please install git and ensure it's in your PATH.",
        };
      }

      // Case 2: Git command executed but returned error
      const errorMessage = error.message || String(gitError);
      const stderr = error.stderr || "";

      // Case 2a: Branch already exists
      if (errorMessage.includes("already exists") || stderr.includes("already exists")) {
        // Try with a unique suffix
        const uniqueBranchName = `${branchName}-${Date.now()}`;
        try {
          execFileSync("git", ["worktree", "add", worktreePath, "-b", uniqueBranchName], {
            cwd: projectPath,
            encoding: "utf-8",
            stdio: "pipe",
          });
          console.log(`[brain-dump] Created worktree with unique branch: ${uniqueBranchName}`);
          // Continue to setup below
        } catch (retryError) {
          return {
            success: false,
            error: `Failed to create worktree even with unique branch name: ${retryError instanceof Error ? retryError.message : String(retryError)}`,
          };
        }
      } else {
        // Case 2b: Other git errors (permission, invalid repo, etc.)
        console.error(`[brain-dump] Git worktree creation failed: ${errorMessage}`);
        if (stderr) {
          console.error(`[brain-dump] Git stderr: ${stderr}`);
        }

        return {
          success: false,
          error: `Git worktree creation failed: ${errorMessage}${stderr ? `\n${stderr}` : ""}`,
        };
      }
    }

    return {
      success: false,
      error: `Unexpected error creating worktree: ${gitError instanceof Error ? gitError.message : String(gitError)}`,
    };
  }

  // Create .claude directory in worktree
  const claudeDir = join(worktreePath, ".claude");

  // P2 FIX: Windows-compatible directory creation
  const mkdirOptions: { recursive: boolean; mode?: number } = {
    recursive: true,
  };
  if (process.platform !== "win32") {
    mkdirOptions.mode = 0o700;
  }

  try {
    mkdirSync(claudeDir, mkdirOptions);
  } catch (mkdirError) {
    console.error(
      `[brain-dump] Failed to create .claude directory: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`
    );
    // Non-fatal - continue
  }

  // Create ralph-state.json in worktree
  const ralphStatePath = join(claudeDir, "ralph-state.json");
  const ralphState = {
    sessionId: "", // Will be populated when session starts
    ticketId: "",
    currentState: "idle",
    isolationMode: "worktree",
    worktreePath: worktreePath,
    mainRepoPath: mainRepoPath || projectPath,
    createdAt: new Date().toISOString(),
  };

  try {
    writeFileSync(ralphStatePath, JSON.stringify(ralphState, null, 2), "utf-8");

    // P2 FIX: Set file permissions (POSIX only)
    if (process.platform !== "win32") {
      chmodSync(ralphStatePath, 0o600);
    }
  } catch (writeError) {
    console.error(
      `[brain-dump] Failed to write ralph-state.json: ${writeError instanceof Error ? writeError.message : String(writeError)}`
    );
    // Non-fatal - continue
  }

  console.log(`[brain-dump] Created worktree at ${worktreePath}`);

  return {
    success: true,
    worktreePath,
    message: `Worktree created successfully at ${worktreePath}`,
  };
}

/**
 * Check if a directory is a valid git worktree.
 */
export function isWorktree(path: string): boolean {
  if (!existsSync(path)) return false;

  try {
    const result = execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: path,
      encoding: "utf-8",
      stdio: "pipe",
    });

    return result.includes(path);
  } catch {
    return false;
  }
}
