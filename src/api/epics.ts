import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import {
  epics,
  projects,
  tickets,
  epicWorkflowState,
  reviewFindings,
  epicReviewRuns,
  epicReviewRunTickets,
  demoScripts,
} from "../lib/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { ensureExists } from "../lib/utils";
import { createLogger } from "../lib/logger";
import { autoExtractLearnings, gatherEpicAnalysisContext } from "../../core/index";

const log = createLogger("epics-api");

export interface EpicLearningEntry {
  ticketId: string;
  ticketTitle: string;
  learnings: Array<{
    type: "pattern" | "anti-pattern" | "tool-usage" | "workflow";
    description: string;
    suggestedUpdate?: {
      file: string;
      section: string;
      content: string;
    };
  }>;
  appliedAt: string;
}

export interface EpicInsightEntry {
  category: "frequent-actions" | "skills" | "plugins" | "agents" | "project-docs";
  title: string;
  description: string;
}

export interface EpicDetailResult {
  epic: {
    id: string;
    title: string;
    description: string | null;
    projectId: string;
    color: string | null;
    createdAt: string;
  };
  project: {
    id: string;
    name: string;
    path: string;
    color: string | null;
  };
  tickets: Array<{
    id: string;
    title: string;
    status: string;
    priority: string | null;
    isBlocked: boolean | null;
    blockedReason: string | null;
    branchName: string | null;
    prNumber: number | null;
    prUrl: string | null;
    prStatus: string | null;
  }>;
  ticketsByStatus: Record<string, number>;
  workflowState: {
    id: string;
    ticketsTotal: number;
    ticketsDone: number;
    currentTicketId: string | null;
    learnings: EpicLearningEntry[];
    insights: EpicInsightEntry[];
    analyzedAt: string | null;
    epicBranchName: string | null;
    prNumber: number | null;
    prUrl: string | null;
    prStatus: string | null;
  } | null;
  findingsSummary: {
    critical: number;
    major: number;
    minor: number;
    suggestion: number;
    fixed: number;
    total: number;
  };
  criticalFindings: Array<{
    id: string;
    ticketId: string;
    ticketTitle: string;
    category: string;
    agent: string;
    description: string;
    filePath: string | null;
    lineNumber: number | null;
    status: string;
    createdAt: string;
    fixedAt: string | null;
  }>;
  reviewRuns: Array<{
    id: string;
    status: string;
    launchMode: string;
    provider: string | null;
    steeringPrompt: string | null;
    summary: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    selectedTickets: Array<{
      id: string;
      title: string;
      status: string;
      summary: string | null;
    }>;
    findingsTotal: number;
    findingsFixed: number;
    demoGenerated: boolean;
  }>;
}

// Types
export interface CreateEpicInput {
  title: string;
  description?: string;
  projectId: string;
  color?: string;
}

export interface UpdateEpicInput {
  title?: string;
  description?: string;
  color?: string;
}

// Get all epics for a project
export const getEpicsByProject = createServerFn({ method: "GET" })
  .inputValidator((projectId: string) => {
    if (!projectId) {
      throw new Error("Project ID is required");
    }
    return projectId;
  })
  .handler(async ({ data: projectId }) => {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    ensureExists(project, "Project", projectId);
    return db
      .select()
      .from(epics)
      .where(eq(epics.projectId, projectId))
      .orderBy(desc(epics.createdAt))
      .all();
  });

// Create a new epic
export const createEpic = createServerFn({ method: "POST" })
  .inputValidator((input: CreateEpicInput) => {
    if (!input.title || input.title.trim().length === 0) {
      throw new Error("Epic title is required");
    }
    if (!input.projectId) {
      throw new Error("Project ID is required");
    }
    return input;
  })
  .handler(async ({ data: input }) => {
    // Verify project exists
    const project = db.select().from(projects).where(eq(projects.id, input.projectId)).get();
    ensureExists(project, "Project", input.projectId);

    const id = randomUUID();
    const newEpic = {
      id,
      title: input.title.trim(),
      description: input.description?.trim() ?? null,
      projectId: input.projectId,
      color: input.color ?? null,
    };

    db.insert(epics).values(newEpic).run();

    return db.select().from(epics).where(eq(epics.id, id)).get();
  });

// Update an epic
export const updateEpic = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string; updates: UpdateEpicInput }) => {
    if (!input.id) {
      throw new Error("Epic ID is required");
    }
    return input;
  })
  .handler(async ({ data: { id, updates } }) => {
    const existing = db.select().from(epics).where(eq(epics.id, id)).get();
    ensureExists(existing, "Epic", id);

    const updateData: Partial<typeof epics.$inferInsert> = {};
    if (updates.title !== undefined) updateData.title = updates.title.trim();
    if (updates.description !== undefined)
      updateData.description = updates.description?.trim() ?? null;
    if (updates.color !== undefined) updateData.color = updates.color;

    if (Object.keys(updateData).length > 0) {
      db.update(epics).set(updateData).where(eq(epics.id, id)).run();
    }

    return db.select().from(epics).where(eq(epics.id, id)).get();
  });

// Delete an epic with dry-run preview support
// Note: Tickets are NOT deleted, just unlinked (epic_id set to null via FK constraint)
export interface DeleteEpicInput {
  epicId: string;
  confirm?: boolean;
}

export interface UnlinkedTicket {
  id: string;
  title: string;
  status: string;
}

export interface DeleteEpicPreview {
  preview: true;
  epic: {
    id: string;
    title: string;
    description: string | null;
    projectId: string;
  };
  ticketsToUnlink: UnlinkedTicket[];
}

export interface DeleteEpicResult {
  deleted: true;
  epic: {
    id: string;
    title: string;
  };
  ticketsUnlinked: number;
}

export const deleteEpic = createServerFn({ method: "POST" })
  .inputValidator((input: DeleteEpicInput) => {
    if (!input.epicId) {
      throw new Error("Epic ID is required");
    }
    return input;
  })
  .handler(
    async ({
      data: { epicId, confirm = false },
    }): Promise<DeleteEpicPreview | DeleteEpicResult> => {
      const epicResult = db.select().from(epics).where(eq(epics.id, epicId)).get();
      const epic = ensureExists(epicResult, "Epic", epicId);

      // Get tickets that would be unlinked (not deleted)
      const ticketsToUnlink = db
        .select({
          id: tickets.id,
          title: tickets.title,
          status: tickets.status,
        })
        .from(tickets)
        .where(eq(tickets.epicId, epicId))
        .all();

      // Dry-run: return preview of what would be affected
      if (!confirm) {
        return {
          preview: true,
          epic: {
            id: epic.id,
            title: epic.title,
            description: epic.description,
            projectId: epic.projectId,
          },
          ticketsToUnlink,
        };
      }

      // Actually delete (tickets get unlinked via FK onDelete: "set null")
      // Use transaction for atomicity
      try {
        sqlite.transaction(() => {
          // Explicitly unlink tickets (even though FK would handle it)
          db.update(tickets)
            .set({ epicId: null, updatedAt: new Date().toISOString() })
            .where(eq(tickets.epicId, epicId))
            .run();
          // Delete the epic
          db.delete(epics).where(eq(epics.id, epicId)).run();
        })();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message.includes("SQLITE_BUSY")) {
          throw new Error(
            "Failed to delete epic: The database is busy. Please try again in a moment."
          );
        }
        throw new Error(`Failed to delete epic: ${message}`);
      }

      return {
        deleted: true,
        epic: {
          id: epic.id,
          title: epic.title,
        },
        ticketsUnlinked: ticketsToUnlink.length,
      };
    }
  );

// Get epic detail with all related data for the Epic Detail page
export const getEpicDetail = createServerFn({ method: "GET" })
  .inputValidator((epicId: string) => {
    if (!epicId) {
      throw new Error("Epic ID is required");
    }
    return epicId;
  })
  .handler(async ({ data: epicId }): Promise<EpicDetailResult> => {
    // Fetch epic
    const epicResult = db.select().from(epics).where(eq(epics.id, epicId)).get();
    const epic = ensureExists(epicResult, "Epic", epicId);

    // Fetch project
    const projectResult = db.select().from(projects).where(eq(projects.id, epic.projectId)).get();
    const project = ensureExists(projectResult, "Project", epic.projectId);

    // Fetch tickets for this epic
    const epicTickets = db
      .select({
        id: tickets.id,
        title: tickets.title,
        status: tickets.status,
        priority: tickets.priority,
        isBlocked: tickets.isBlocked,
        blockedReason: tickets.blockedReason,
        branchName: tickets.branchName,
        prNumber: tickets.prNumber,
        prUrl: tickets.prUrl,
        prStatus: tickets.prStatus,
      })
      .from(tickets)
      .where(eq(tickets.epicId, epicId))
      .all();

    const criticalFindings = db
      .select({
        id: reviewFindings.id,
        ticketId: reviewFindings.ticketId,
        ticketTitle: tickets.title,
        category: reviewFindings.category,
        agent: reviewFindings.agent,
        description: reviewFindings.description,
        filePath: reviewFindings.filePath,
        lineNumber: reviewFindings.lineNumber,
        status: reviewFindings.status,
        createdAt: reviewFindings.createdAt,
        fixedAt: reviewFindings.fixedAt,
      })
      .from(reviewFindings)
      .innerJoin(tickets, eq(reviewFindings.ticketId, tickets.id))
      .where(and(eq(tickets.epicId, epicId), eq(reviewFindings.severity, "critical")))
      .orderBy(desc(reviewFindings.createdAt))
      .all();

    const findingsCounts = db
      .select({
        severity: reviewFindings.severity,
        status: reviewFindings.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(reviewFindings)
      .innerJoin(tickets, eq(reviewFindings.ticketId, tickets.id))
      .where(eq(tickets.epicId, epicId))
      .groupBy(reviewFindings.severity, reviewFindings.status)
      .all();

    const findingsSummary: EpicDetailResult["findingsSummary"] = {
      critical: 0,
      major: 0,
      minor: 0,
      suggestion: 0,
      fixed: 0,
      total: 0,
    };

    for (const row of findingsCounts) {
      findingsSummary.total += row.count;

      if (row.status === "fixed") {
        findingsSummary.fixed += row.count;
      }

      const severity = row.severity as keyof EpicDetailResult["findingsSummary"];
      if (severity in findingsSummary && severity !== "fixed" && severity !== "total") {
        findingsSummary[severity] += row.count;
      }
    }

    const reviewRunRows = db
      .select({
        id: epicReviewRuns.id,
        status: epicReviewRuns.status,
        launchMode: epicReviewRuns.launchMode,
        provider: epicReviewRuns.provider,
        steeringPrompt: epicReviewRuns.steeringPrompt,
        summary: epicReviewRuns.summary,
        createdAt: epicReviewRuns.createdAt,
        startedAt: epicReviewRuns.startedAt,
        completedAt: epicReviewRuns.completedAt,
        ticketId: epicReviewRunTickets.ticketId,
        ticketTitle: tickets.title,
        ticketStatus: tickets.status,
        ticketRunStatus: epicReviewRunTickets.status,
        ticketRunSummary: epicReviewRunTickets.summary,
      })
      .from(epicReviewRuns)
      .leftJoin(epicReviewRunTickets, eq(epicReviewRunTickets.epicReviewRunId, epicReviewRuns.id))
      .leftJoin(tickets, eq(tickets.id, epicReviewRunTickets.ticketId))
      .where(eq(epicReviewRuns.epicId, epicId))
      .orderBy(desc(epicReviewRuns.createdAt), epicReviewRunTickets.position)
      .all();

    const reviewRunIds = Array.from(new Set(reviewRunRows.map((row) => row.id)));
    const findingsByRun =
      reviewRunIds.length === 0
        ? []
        : db
            .select({
              epicReviewRunId: reviewFindings.epicReviewRunId,
              status: reviewFindings.status,
              count: sql<number>`COUNT(*)`,
            })
            .from(reviewFindings)
            .where(inArray(reviewFindings.epicReviewRunId, reviewRunIds))
            .groupBy(reviewFindings.epicReviewRunId, reviewFindings.status)
            .all();
    const demoByRun =
      reviewRunIds.length === 0
        ? []
        : db
            .select({
              epicReviewRunId: demoScripts.epicReviewRunId,
              count: sql<number>`COUNT(*)`,
            })
            .from(demoScripts)
            .where(inArray(demoScripts.epicReviewRunId, reviewRunIds))
            .groupBy(demoScripts.epicReviewRunId)
            .all();

    const reviewRunMap = new Map<string, EpicDetailResult["reviewRuns"][number]>();
    for (const row of reviewRunRows) {
      const existing = reviewRunMap.get(row.id);
      if (existing) {
        if (row.ticketId && row.ticketTitle) {
          existing.selectedTickets.push({
            id: row.ticketId,
            title: row.ticketTitle,
            status:
              row.ticketRunStatus === "running" &&
              (row.ticketStatus === "human_review" || row.ticketStatus === "done")
                ? "completed"
                : (row.ticketRunStatus ?? "queued"),
            summary: row.ticketRunSummary,
          });
        }
        continue;
      }

      reviewRunMap.set(row.id, {
        id: row.id,
        status: row.status,
        launchMode: row.launchMode,
        provider: row.provider,
        steeringPrompt: row.steeringPrompt,
        summary: row.summary,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        selectedTickets:
          row.ticketId && row.ticketTitle
            ? [
                {
                  id: row.ticketId,
                  title: row.ticketTitle,
                  status:
                    row.ticketRunStatus === "running" &&
                    (row.ticketStatus === "human_review" || row.ticketStatus === "done")
                      ? "completed"
                      : (row.ticketRunStatus ?? "queued"),
                  summary: row.ticketRunSummary,
                },
              ]
            : [],
        findingsTotal: 0,
        findingsFixed: 0,
        demoGenerated: false,
      });
    }

    for (const row of findingsByRun) {
      if (!row.epicReviewRunId) {
        continue;
      }

      const reviewRun = reviewRunMap.get(row.epicReviewRunId);
      if (!reviewRun) {
        continue;
      }

      reviewRun.findingsTotal += row.count;
      if (row.status === "fixed") {
        reviewRun.findingsFixed += row.count;
      }
    }

    for (const row of demoByRun) {
      if (!row.epicReviewRunId) {
        continue;
      }

      const reviewRun = reviewRunMap.get(row.epicReviewRunId);
      if (reviewRun) {
        reviewRun.demoGenerated = row.count > 0;
      }
    }

    // Compute ticketsByStatus
    const ticketsByStatus: Record<string, number> = {};
    for (const ticket of epicTickets) {
      ticketsByStatus[ticket.status] = (ticketsByStatus[ticket.status] ?? 0) + 1;
    }

    // Fetch workflow state (may not exist)
    const workflowStateResult = db
      .select()
      .from(epicWorkflowState)
      .where(eq(epicWorkflowState.epicId, epicId))
      .get();

    let workflowState: EpicDetailResult["workflowState"] = null;

    if (workflowStateResult) {
      // Parse learnings JSON with try/catch fallback to empty array
      let parsedLearnings: EpicLearningEntry[] = [];
      if (workflowStateResult.learnings) {
        try {
          parsedLearnings = JSON.parse(workflowStateResult.learnings);
        } catch (err) {
          log.error(
            `Failed to parse epic learnings JSON for epic ${epicId}`,
            err instanceof Error ? err : new Error(String(err))
          );
          parsedLearnings = [];
        }
      }

      let parsedInsights: EpicInsightEntry[] = [];
      if (workflowStateResult.insights) {
        try {
          parsedInsights = JSON.parse(workflowStateResult.insights);
        } catch (err) {
          log.error(
            `Failed to parse epic insights JSON for epic ${epicId}`,
            err instanceof Error ? err : new Error(String(err))
          );
          parsedInsights = [];
        }
      }

      workflowState = {
        id: workflowStateResult.id,
        ticketsTotal: workflowStateResult.ticketsTotal ?? 0,
        ticketsDone: workflowStateResult.ticketsDone ?? 0,
        currentTicketId: workflowStateResult.currentTicketId,
        learnings: parsedLearnings,
        insights: parsedInsights,
        analyzedAt: parsedInsights.length > 0 ? workflowStateResult.updatedAt : null,
        epicBranchName: workflowStateResult.epicBranchName,
        prNumber: workflowStateResult.prNumber,
        prUrl: workflowStateResult.prUrl,
        prStatus: workflowStateResult.prStatus,
      };
    }

    return {
      epic: {
        id: epic.id,
        title: epic.title,
        description: epic.description,
        projectId: epic.projectId,
        color: epic.color,
        createdAt: epic.createdAt,
      },
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        color: project.color,
      },
      tickets: epicTickets,
      ticketsByStatus,
      workflowState,
      findingsSummary,
      criticalFindings,
      reviewRuns: Array.from(reviewRunMap.values()),
    };
  });

// Trigger auto-extraction of learnings from completed tickets in an epic
export const triggerAutoLearnings = createServerFn({ method: "POST" })
  .inputValidator((input: { epicId: string }) => {
    if (!input.epicId) {
      throw new Error("Epic ID is required");
    }
    return input;
  })
  .handler(async ({ data: { epicId } }) => {
    return autoExtractLearnings(sqlite, epicId);
  });

// Launch AI analysis session for epic learnings
export const launchEpicAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: { epicId: string; preferredTerminal?: string | null }) => {
    if (!input.epicId) throw new Error("Epic ID is required");
    return input;
  })
  .handler(async ({ data: { epicId, preferredTerminal } }) => {
    const { existsSync } = await import("fs");
    // exec is used here to fire-and-forget a terminal window process.
    // The command is built by buildTerminalCommand from validated internal values,
    // not from user input — same pattern as launchClaudeInTerminal.
    const { exec } = await import("child_process");

    const context = gatherEpicAnalysisContext(sqlite, epicId);

    if (!existsSync(context.projectPath)) {
      return {
        success: false,
        message: `Project directory not found: ${context.projectPath}`,
      };
    }

    // Import terminal utilities
    const { detectTerminal, isTerminalAvailable, buildTerminalCommand } =
      await import("./terminal-utils");

    // Determine terminal
    let terminal: string | null = null;
    if (preferredTerminal) {
      const result = await isTerminalAvailable(preferredTerminal);
      if (result.available) terminal = preferredTerminal;
    }
    if (!terminal) terminal = await detectTerminal();

    if (!terminal) {
      return {
        success: false,
        message: "No supported terminal emulator found.",
      };
    }

    // Create launch script
    const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID: uuid } = await import("crypto");

    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });

    const scriptPath = join(scriptDir, `epic-analysis-${uuid()}.sh`);

    // Escape for bash double quotes
    const safePath = context.projectPath.replace(/[\\"$`!]/g, "\\$&");
    const safeTitle = context.epicTitle.replace(/[\\"$`!]/g, "\\$&");

    const script = `#!/bin/bash
set -e

cd "${safePath}"

# Save analysis prompt to a temp file
PROMPT_FILE="/tmp/brain-dump-epic-analysis-${epicId}.md"
cat > "$PROMPT_FILE" << 'BRAIN_DUMP_ANALYSIS_EOF_8a4c1d3e'
${context.prompt}
BRAIN_DUMP_ANALYSIS_EOF_8a4c1d3e

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;35m🔬 Brain Dump - Epic Analysis\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Epic:\\033[0m ${safeTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safePath}"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Launch Claude with the analysis prompt
claude --dangerously-skip-permissions "$PROMPT_FILE"

# Cleanup
rm -f "$PROMPT_FILE"

echo ""
echo -e "\\033[0;35m✅ Epic analysis session ended.\\033[0m"
exec bash
`;

    writeFileSync(scriptPath, script, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    const windowTitle = `[Epic Analysis] ${context.epicTitle}`;
    const terminalCommand = buildTerminalCommand(
      terminal,
      context.projectPath,
      scriptPath,
      windowTitle
    );

    try {
      exec(terminalCommand, (error) => {
        if (error) console.error("Terminal launch error:", error);
      });

      return {
        success: true,
        message: `Launched epic analysis in ${terminal}`,
        terminalUsed: terminal,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  });
