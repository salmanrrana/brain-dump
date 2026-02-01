/**
 * Shared workflow logic for starting ticket and epic work.
 *
 * This module bridges the gap between the UI launch functions (terminal.ts, ralph.ts)
 * and the MCP `start_ticket_work` / `start_epic_work` tools (mcp-server/tools/workflow.ts).
 *
 * The MCP tools handle the full workflow: git branch, status update, workflow state,
 * audit comments, compliance sessions, and rich context building.
 * The UI launch functions previously only updated the status.
 *
 * This module extracts the essential pre-launch steps so both UI and MCP paths
 * produce consistent audit trails and git state.
 */

import { db } from "../lib/db";
import {
  tickets,
  ticketWorkflowState,
  ticketComments,
  epicWorkflowState,
  epics,
} from "../lib/schema";
import { eq } from "drizzle-orm";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

// --- Git utilities (inlined from mcp-server/lib/git-utils.ts to avoid cross-package import) ---

interface GitCommandResult {
  success: boolean;
  output: string;
  error?: string;
}

function runGitCommand(command: string, cwd: string): GitCommandResult {
  try {
    const output = execSync(command, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return { success: true, output: output.trim() };
  } catch (error) {
    const err = error as { stderr?: string; message: string };
    return { success: false, output: "", error: err.stderr?.trim() || err.message };
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

function shortId(uuid: string): string {
  return uuid.substring(0, 8);
}

function generateBranchName(ticketId: string, ticketTitle: string): string {
  return `feature/${shortId(ticketId)}-${slugify(ticketTitle)}`;
}

function generateEpicBranchName(epicId: string, epicTitle: string): string {
  return `feature/epic-${shortId(epicId)}-${slugify(epicTitle)}`;
}

// --- Workflow result types ---

export interface StartTicketWorkflowResult {
  success: boolean;
  branchName?: string;
  branchCreated?: boolean;
  usingEpicBranch?: boolean;
  warnings: string[];
  error?: string;
}

/**
 * Execute the essential workflow steps when starting ticket work from the UI.
 *
 * This performs the same critical steps as the MCP `start_ticket_work` tool:
 * 1. Create/checkout git branch (ticket-specific or epic branch)
 * 2. Update ticket status to in_progress with branch_name
 * 3. Initialize ticket_workflow_state
 * 4. Post "Starting work" audit comment
 *
 * It does NOT handle MCP-specific concerns like telemetry self-logging,
 * attachment loading for LLM context, or rich context building — those
 * are the AI tool's responsibility when it runs inside Claude/OpenCode.
 */
export async function startTicketWorkflow(
  ticketId: string,
  projectPath: string
): Promise<StartTicketWorkflowResult> {
  const warnings: string[] = [];

  // 1. Verify project path exists
  if (!existsSync(projectPath)) {
    return {
      success: false,
      warnings,
      error: `Project directory not found: ${projectPath}`,
    };
  }

  // 2. Verify git repository
  const gitCheck = runGitCommand("git rev-parse --git-dir", projectPath);
  if (!gitCheck.success) {
    return {
      success: false,
      warnings,
      error: `Not a git repository: ${projectPath}. Initialize git first.`,
    };
  }

  // 3. Fetch ticket with project info
  const ticket = db
    .select({
      id: tickets.id,
      title: tickets.title,
      status: tickets.status,
      epicId: tickets.epicId,
      branchName: tickets.branchName,
    })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();

  if (!ticket) {
    return {
      success: false,
      warnings,
      error: `Ticket not found: ${ticketId}`,
    };
  }

  // 4. If already in_progress with a branch, skip branch creation
  if (ticket.status === "in_progress" && ticket.branchName) {
    return {
      success: true,
      branchName: ticket.branchName,
      branchCreated: false,
      usingEpicBranch: false,
      warnings: ["Ticket is already in progress."],
    };
  }

  // 5. Determine branch name (epic branch or ticket-specific)
  let branchName: string | undefined;
  let branchCreated = false;
  let usingEpicBranch = false;

  if (ticket.epicId) {
    // Check for existing epic branch
    const epicState = db
      .select()
      .from(epicWorkflowState)
      .where(eq(epicWorkflowState.epicId, ticket.epicId))
      .get();

    if (epicState?.epicBranchName) {
      // Epic has a branch — try to use it
      const epicBranchExists = runGitCommand(
        `git show-ref --verify --quiet refs/heads/${epicState.epicBranchName}`,
        projectPath
      );
      if (epicBranchExists.success) {
        branchName = epicState.epicBranchName;
        usingEpicBranch = true;

        const checkoutResult = runGitCommand(`git checkout ${branchName}`, projectPath);
        if (!checkoutResult.success) {
          warnings.push(`Failed to checkout epic branch: ${checkoutResult.error}`);
        }

        // Update epic workflow state to track current ticket
        const now = new Date().toISOString();
        db.update(epicWorkflowState)
          .set({ currentTicketId: ticketId, updatedAt: now })
          .where(eq(epicWorkflowState.epicId, ticket.epicId))
          .run();
      } else {
        warnings.push(
          `Epic branch ${epicState.epicBranchName} no longer exists. Creating ticket-specific branch instead.`
        );
      }
    } else {
      // Epic exists but no branch — auto-create epic branch
      const epic = db
        .select({ id: epics.id, title: epics.title })
        .from(epics)
        .where(eq(epics.id, ticket.epicId))
        .get();

      if (epic) {
        branchName = generateEpicBranchName(epic.id, epic.title);
        usingEpicBranch = true;

        const epicBranchExists = runGitCommand(
          `git show-ref --verify --quiet refs/heads/${branchName}`,
          projectPath
        );

        if (!epicBranchExists.success) {
          // Create epic branch from main/master
          let baseBranch = "main";
          const mainExists = runGitCommand(
            "git show-ref --verify --quiet refs/heads/main",
            projectPath
          );
          if (!mainExists.success) {
            const masterExists = runGitCommand(
              "git show-ref --verify --quiet refs/heads/master",
              projectPath
            );
            if (masterExists.success) baseBranch = "master";
          }

          runGitCommand(`git checkout ${baseBranch}`, projectPath);
          const createResult = runGitCommand(`git checkout -b ${branchName}`, projectPath);
          if (!createResult.success) {
            warnings.push(`Failed to create epic branch: ${createResult.error}`);
            branchName = undefined;
            usingEpicBranch = false;
          } else {
            branchCreated = true;
          }
        } else {
          const checkoutResult = runGitCommand(`git checkout ${branchName}`, projectPath);
          if (!checkoutResult.success) {
            warnings.push(`Failed to checkout epic branch: ${checkoutResult.error}`);
          }
        }

        // Create/update epic workflow state
        if (branchName && usingEpicBranch) {
          const now = new Date().toISOString();
          const existingState = db
            .select({ id: epicWorkflowState.id })
            .from(epicWorkflowState)
            .where(eq(epicWorkflowState.epicId, epic.id))
            .get();

          if (existingState) {
            db.update(epicWorkflowState)
              .set({
                epicBranchName: branchName,
                epicBranchCreatedAt: now,
                currentTicketId: ticketId,
                updatedAt: now,
              })
              .where(eq(epicWorkflowState.epicId, epic.id))
              .run();
          } else {
            db.insert(epicWorkflowState)
              .values({
                id: randomUUID(),
                epicId: epic.id,
                epicBranchName: branchName,
                epicBranchCreatedAt: now,
                currentTicketId: ticketId,
                createdAt: now,
                updatedAt: now,
              })
              .run();
          }
        }
      }
    }
  }

  // If not using epic branch, create ticket-specific branch
  if (!usingEpicBranch || !branchName) {
    branchName = generateBranchName(ticketId, ticket.title);
    usingEpicBranch = false;

    const branchExists = runGitCommand(
      `git show-ref --verify --quiet refs/heads/${branchName}`,
      projectPath
    );

    if (!branchExists.success) {
      // Determine base branch
      let baseBranch = "main";
      const mainExists = runGitCommand(
        "git show-ref --verify --quiet refs/heads/main",
        projectPath
      );
      if (!mainExists.success) {
        const masterExists = runGitCommand(
          "git show-ref --verify --quiet refs/heads/master",
          projectPath
        );
        if (masterExists.success) baseBranch = "master";
      }

      runGitCommand(`git checkout ${baseBranch}`, projectPath);
      const createResult = runGitCommand(`git checkout -b ${branchName}`, projectPath);
      if (!createResult.success) {
        warnings.push(`Failed to create branch ${branchName}: ${createResult.error}`);
        // Fall through — status update and comment still happen even without branch
      } else {
        branchCreated = true;
      }
    } else {
      const checkoutResult = runGitCommand(`git checkout ${branchName}`, projectPath);
      if (!checkoutResult.success) {
        warnings.push(`Failed to checkout branch ${branchName}: ${checkoutResult.error}`);
      }
    }
  }

  // 6. Update ticket status and branch name
  const now = new Date().toISOString();
  try {
    db.update(tickets)
      .set({
        status: "in_progress",
        branchName: branchName,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticketId))
      .run();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      warnings,
      error: `Failed to update ticket status: ${errMsg}`,
    };
  }

  // 7. Create or reset workflow state
  try {
    const existingState = db
      .select({ id: ticketWorkflowState.id })
      .from(ticketWorkflowState)
      .where(eq(ticketWorkflowState.ticketId, ticketId))
      .get();

    if (!existingState) {
      db.insert(ticketWorkflowState)
        .values({
          id: randomUUID(),
          ticketId,
          currentPhase: "implementation",
          reviewIteration: 0,
          findingsCount: 0,
          findingsFixed: 0,
          demoGenerated: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } else {
      db.update(ticketWorkflowState)
        .set({
          currentPhase: "implementation",
          reviewIteration: 0,
          findingsCount: 0,
          findingsFixed: 0,
          demoGenerated: false,
          updatedAt: now,
        })
        .where(eq(ticketWorkflowState.ticketId, ticketId))
        .run();
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    warnings.push(`Workflow state tracking failed: ${errMsg}`);
  }

  // 8. Post "Starting work" audit comment
  try {
    const commentContent = usingEpicBranch
      ? `Started work on ticket. Branch: \`${branchName}\` (epic branch)`
      : `Started work on ticket. Branch: \`${branchName}\``;

    db.insert(ticketComments)
      .values({
        id: randomUUID(),
        ticketId,
        content: commentContent,
        author: "brain-dump",
        type: "progress",
      })
      .run();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    warnings.push(`Failed to post starting comment: ${errMsg}`);
  }

  return {
    success: true,
    branchName,
    branchCreated,
    usingEpicBranch,
    warnings,
  };
}

// --- Epic Workflow ---

export interface StartEpicWorkflowResult {
  success: boolean;
  branchName?: string;
  branchCreated?: boolean;
  warnings: string[];
  error?: string;
}

/**
 * Execute the essential workflow steps when starting epic work from the UI.
 *
 * This performs the same critical steps as the MCP `start_epic_work` tool:
 * 1. Create/checkout epic git branch
 * 2. Initialize epic_workflow_state
 * 3. Post "Starting work" audit comment
 */
export async function startEpicWorkflow(
  epicId: string,
  projectPath: string
): Promise<StartEpicWorkflowResult> {
  const warnings: string[] = [];

  // 1. Verify project path exists
  if (!existsSync(projectPath)) {
    return {
      success: false,
      warnings,
      error: `Project directory not found: ${projectPath}`,
    };
  }

  // 2. Verify git repository
  const gitCheck = runGitCommand("git rev-parse --git-dir", projectPath);
  if (!gitCheck.success) {
    return {
      success: false,
      warnings,
      error: `Not a git repository: ${projectPath}. Initialize git first.`,
    };
  }

  // 3. Fetch epic with project info
  const epic = db
    .select({
      id: epics.id,
      title: epics.title,
    })
    .from(epics)
    .where(eq(epics.id, epicId))
    .get();

  if (!epic) {
    return {
      success: false,
      warnings,
      error: `Epic not found: ${epicId}`,
    };
  }

  // 4. Generate epic branch name
  const branchName = generateEpicBranchName(epic.id, epic.title);
  let branchCreated = false;

  // 5. Check if branch already exists
  const branchExists = runGitCommand(
    `git show-ref --verify --quiet refs/heads/${branchName}`,
    projectPath
  );

  if (!branchExists.success) {
    // Determine base branch
    let baseBranch = "main";
    const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", projectPath);
    if (!mainExists.success) {
      const masterExists = runGitCommand(
        "git show-ref --verify --quiet refs/heads/master",
        projectPath
      );
      if (masterExists.success) baseBranch = "master";
    }

    // Create epic branch from base branch
    runGitCommand(`git checkout ${baseBranch}`, projectPath);
    const createResult = runGitCommand(`git checkout -b ${branchName}`, projectPath);
    if (!createResult.success) {
      warnings.push(`Failed to create epic branch: ${createResult.error}`);
      // Fall through — workflow state still gets created even without branch
    } else {
      branchCreated = true;
    }
  } else {
    // Branch exists, checkout to it
    const checkoutResult = runGitCommand(`git checkout ${branchName}`, projectPath);
    if (!checkoutResult.success) {
      warnings.push(`Failed to checkout epic branch: ${checkoutResult.error}`);
    }
  }

  // 6. Create or reset epic workflow state
  const now = new Date().toISOString();
  try {
    const existingState = db
      .select({ id: epicWorkflowState.id })
      .from(epicWorkflowState)
      .where(eq(epicWorkflowState.epicId, epicId))
      .get();

    if (!existingState) {
      db.insert(epicWorkflowState)
        .values({
          id: randomUUID(),
          epicId,
          epicBranchName: branchName,
          epicBranchCreatedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    } else {
      db.update(epicWorkflowState)
        .set({
          epicBranchName: branchName,
          epicBranchCreatedAt: now,
          updatedAt: now,
        })
        .where(eq(epicWorkflowState.epicId, epicId))
        .run();
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    warnings.push(`Workflow state tracking failed: ${errMsg}`);
  }

  // 7. Post "Starting work" audit comment would go here, but epics don't have direct comments
  // Instead, this is tracked in the epic_workflow_state

  return {
    success: true,
    branchName,
    branchCreated,
    warnings,
  };
}
