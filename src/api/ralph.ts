import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import {
  tickets,
  epics,
  projects,
  ralphSessions,
  epicWorkflowState,
  type RalphSessionState,
} from "../lib/schema";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import { safeJsonParse } from "../lib/utils";

// Extracted modules
import { generateEnhancedPRD } from "../lib/prd-extraction";
import { generateVSCodeContext, writeVSCodeContext } from "../lib/vscode-context";
import {
  generateRalphScript,
  validateDockerSetup,
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_TIMEOUT_SECONDS,
} from "../lib/docker-sandbox";
import { launchInVSCode, launchInTerminal } from "../lib/terminal-launcher";
import { createWorktree } from "../lib/worktree-manager";
import { getDockerHostEnvValue } from "./docker-utils";

export const launchRalphForTicket = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
      aiBackend?: "claude" | "opencode";
    }) => data
  )
  .handler(async ({ data }) => {
    const {
      ticketId,
      maxIterations,
      preferredTerminal,
      useSandbox = false,
      aiBackend = "claude",
    } = data;
    const { writeFileSync, mkdirSync, existsSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");
    const { settings } = await import("../lib/schema");
    const { eq: eqSettings } = await import("drizzle-orm");

    const appSettings = db.select().from(settings).where(eqSettings(settings.id, "default")).get();
    const timeoutSeconds = appSettings?.ralphTimeout ?? DEFAULT_TIMEOUT_SECONDS;
    const effectiveMaxIterations = maxIterations ?? appSettings?.ralphMaxIterations ?? 10;

    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();

    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    const project = db.select().from(projects).where(eq(projects.id, ticket.projectId)).get();

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    if (!existsSync(project.path)) {
      return { success: false, message: `Project directory not found: ${project.path}` };
    }

    let sshWarnings: string[] | undefined;
    let dockerHostEnv: string | null = null;
    if (useSandbox) {
      const dockerResult = await validateDockerSetup();
      if (!dockerResult.success) {
        return dockerResult;
      }
      sshWarnings = dockerResult.warnings;
      dockerHostEnv = await getDockerHostEnvValue();
    }

    const plansDir = join(project.path, "plans");
    mkdirSync(plansDir, { recursive: true });

    const prd = generateEnhancedPRD(project.name, project.path, [ticket]);
    const prdPath = join(plansDir, "prd.json");
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    const ralphScript = generateRalphScript(
      project.path,
      effectiveMaxIterations,
      useSandbox,
      DEFAULT_RESOURCE_LIMITS,
      timeoutSeconds,
      dockerHostEnv,
      useSandbox
        ? {
            projectId: project.id,
            projectName: project.name,
          }
        : undefined,
      aiBackend
    );
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = join(scriptDir, `ralph-${useSandbox ? "docker-" : ""}${randomUUID()}.sh`);
    writeFileSync(scriptPath, ralphScript, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    db.update(tickets).set({ status: "in_progress" }).where(eq(tickets.id, ticketId)).run();

    const workingMethod = project.workingMethod || "auto";
    console.log(
      `[brain-dump] Ralph ticket launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
    );

    if (workingMethod === "vscode") {
      console.log(`[brain-dump] Using VS Code launch path for single ticket`);

      const contextContent = generateVSCodeContext(prd);
      const contextResult = await writeVSCodeContext(project.path, contextContent);

      if (!contextResult.success) {
        db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
        return contextResult;
      }

      console.log(`[brain-dump] Created Ralph context file: ${contextResult.path}`);

      const launchResult = await launchInVSCode(project.path, contextResult.path);

      if (!launchResult.success) {
        db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
        return launchResult;
      }

      return {
        success: true,
        message: `Opened VS Code with Ralph context for ticket "${ticket.title}". Check .claude/ralph-context.md for instructions.`,
        launchMethod: "vscode" as const,
        contextFile: contextResult.path,
        warnings: sshWarnings,
      };
    }

    console.log(`[brain-dump] Using terminal launch path for single ticket`);
    const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);

    if (!launchResult.success) {
      return launchResult;
    }

    return {
      success: true,
      message: `Launched Ralph in ${launchResult.terminal}`,
      terminalUsed: launchResult.terminal,
      launchMethod: "terminal" as const,
      warnings: sshWarnings,
    };
  });

export const launchRalphForEpic = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      epicId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
      aiBackend?: "claude" | "opencode";
    }) => data
  )
  .handler(async ({ data }) => {
    const {
      epicId,
      maxIterations,
      preferredTerminal,
      useSandbox = false,
      aiBackend = "claude",
    } = data;
    const { writeFileSync, mkdirSync, existsSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");
    const { settings } = await import("../lib/schema");
    const { eq: eqSettings } = await import("drizzle-orm");

    const appSettings = db.select().from(settings).where(eqSettings(settings.id, "default")).get();
    const timeoutSeconds = appSettings?.ralphTimeout ?? DEFAULT_TIMEOUT_SECONDS;
    const effectiveMaxIterations = maxIterations ?? appSettings?.ralphMaxIterations ?? 10;

    // OPTIMIZATION: Single JOIN query instead of 3 separate SELECTs
    const epicData = db
      .select({
        epic: epics,
        project: projects,
        workflowState: epicWorkflowState,
      })
      .from(epics)
      .innerJoin(projects, eq(epics.projectId, projects.id))
      .leftJoin(epicWorkflowState, eq(epicWorkflowState.epicId, epics.id))
      .where(eq(epics.id, epicId))
      .get();

    if (!epicData) {
      return { success: false, message: "Epic not found" };
    }

    const { epic, project, workflowState: existingState } = epicData;

    if (!existsSync(project.path)) {
      return { success: false, message: `Project directory not found: ${project.path}` };
    }

    let workingDirectory = project.path;
    let worktreeCreated = false;
    let worktreePath: string | null = null;

    if (epic.isolationMode === "worktree") {
      console.log(`[brain-dump] Epic ${epicId} uses worktree isolation mode`);

      if (existingState?.worktreePath && existsSync(existingState.worktreePath)) {
        console.log(`[brain-dump] Using existing worktree at: ${existingState.worktreePath}`);
        workingDirectory = existingState.worktreePath;
        worktreePath = existingState.worktreePath;
      } else {
        console.log(`[brain-dump] Creating new worktree for epic ${epicId}`);

        const epicSlug = epic.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .substring(0, 30);

        const epicShortId = epic.id.substring(0, 8);
        const branchName = `feature/epic-${epicShortId}-${epicSlug}`;

        const result = createWorktree({
          projectPath: project.path,
          branchName,
          epicId: epic.id,
          epicTitle: epic.title,
          mainRepoPath: project.path,
        });

        if (!result.success) {
          return {
            success: false,
            message: result.error || "Failed to create worktree",
          };
        }

        workingDirectory = result.worktreePath!;
        worktreePath = result.worktreePath!;
        worktreeCreated = true;
      }

      console.log(`[brain-dump] Working directory set to: ${workingDirectory}`);
    }

    let sshWarnings: string[] | undefined;
    let dockerHostEnv: string | null = null;
    if (useSandbox) {
      const dockerResult = await validateDockerSetup();
      if (!dockerResult.success) {
        return dockerResult;
      }
      sshWarnings = dockerResult.warnings;
      dockerHostEnv = await getDockerHostEnvValue();
    }

    const epicTickets = db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.epicId, epicId),
          inArray(tickets.status, ["backlog", "ready", "in_progress", "ai_review", "human_review"])
        )
      )
      .all();

    if (epicTickets.length === 0) {
      return { success: false, message: "No pending tickets in this epic" };
    }

    const plansDir = join(project.path, "plans");
    mkdirSync(plansDir, { recursive: true });

    const prd = generateEnhancedPRD(
      project.name,
      project.path,
      epicTickets,
      epic.title,
      epic.description ?? undefined
    );
    const prdPath = join(plansDir, "prd.json");
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    const ralphScript = generateRalphScript(
      workingDirectory,
      effectiveMaxIterations,
      useSandbox,
      DEFAULT_RESOURCE_LIMITS,
      timeoutSeconds,
      dockerHostEnv,
      useSandbox
        ? {
            projectId: project.id,
            projectName: project.name,
            epicId: epic.id,
            epicTitle: epic.title,
          }
        : undefined,
      aiBackend
    );
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = join(
      scriptDir,
      `ralph-epic-${useSandbox ? "docker-" : ""}${randomUUID()}.sh`
    );
    writeFileSync(scriptPath, ralphScript, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    // OPTIMIZATION: Batch update + transaction for atomicity
    const ticketIdsToUpdate = epicTickets
      .filter((t) => t.status === "backlog" || t.status === "ready")
      .map((t) => t.id);

    // OPTIMIZATION: Atomic transaction - either all succeed or all rollback
    db.transaction(() => {
      // Update worktree state if applicable
      if (epic.isolationMode === "worktree" && worktreePath) {
        const now = new Date().toISOString();
        const worktreeStateUpdate = {
          worktreePath: worktreePath,
          worktreeCreatedAt: worktreeCreated ? now : (existingState?.worktreeCreatedAt ?? now),
          worktreeStatus: "active" as const,
          updatedAt: now,
        };

        if (existingState) {
          db.update(epicWorkflowState)
            .set(worktreeStateUpdate)
            .where(eq(epicWorkflowState.epicId, epicId))
            .run();
        } else {
          db.insert(epicWorkflowState)
            .values({
              id: randomUUID(),
              epicId: epicId,
              ...worktreeStateUpdate,
              createdAt: now,
            })
            .run();
        }
      }

      // Batch update tickets to in_progress
      if (ticketIdsToUpdate.length > 0) {
        db.update(tickets)
          .set({ status: "in_progress" })
          .where(inArray(tickets.id, ticketIdsToUpdate))
          .run();
      }
    });

    const workingMethod = project.workingMethod || "auto";
    console.log(
      `[brain-dump] Ralph launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
    );

    if (workingMethod === "vscode") {
      console.log(`[brain-dump] Using VS Code launch path`);

      const contextContent = generateVSCodeContext(prd);
      const contextResult = await writeVSCodeContext(workingDirectory, contextContent);

      if (!contextResult.success) {
        // OPTIMIZATION: Batch rollback instead of N+1 queries
        if (ticketIdsToUpdate.length > 0) {
          db.update(tickets)
            .set({ status: "ready" }) // Rollback to previous state
            .where(inArray(tickets.id, ticketIdsToUpdate))
            .run();
        }
        return contextResult;
      }

      console.log(`[brain-dump] Created Ralph context file: ${contextResult.path}`);

      const launchResult = await launchInVSCode(workingDirectory, contextResult.path);

      if (!launchResult.success) {
        // OPTIMIZATION: Batch rollback instead of N+1 queries
        if (ticketIdsToUpdate.length > 0) {
          db.update(tickets)
            .set({ status: "ready" }) // Rollback to previous state
            .where(inArray(tickets.id, ticketIdsToUpdate))
            .run();
        }
        return launchResult;
      }

      return {
        success: true,
        message: `Opened VS Code with Ralph context for ${epicTickets.length} tickets. Check .claude/ralph-context.md for instructions.`,
        launchMethod: "vscode" as const,
        contextFile: contextResult.path,
        ticketCount: epicTickets.length,
        warnings: sshWarnings,
        worktreePath: worktreePath,
      };
    }

    console.log(
      `[brain-dump] Using terminal launch path${worktreePath ? ` (worktree: ${worktreePath})` : ""}`
    );
    const launchResult = await launchInTerminal(workingDirectory, scriptPath, preferredTerminal);

    if (!launchResult.success) {
      return launchResult;
    }

    return {
      success: true,
      message: `Launched Ralph for ${epicTickets.length} tickets in ${launchResult.terminal}${worktreePath ? ` (worktree: ${worktreePath})` : ""}`,
      terminalUsed: launchResult.terminal,
      launchMethod: "terminal" as const,
      ticketCount: epicTickets.length,
      warnings: sshWarnings,
      worktreePath: worktreePath,
    };
  });

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ActiveRalphSession {
  id: string;
  ticketId: string;
  projectId: string;
  currentState: RalphSessionState;
  startedAt: string;
  stateHistory: Array<{
    state: string;
    timestamp: string;
    metadata?: Record<string, JsonValue> | undefined;
  }> | null;
}

export const getActiveRalphSession = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => ticketId)
  .handler(async ({ data: ticketId }): Promise<ActiveRalphSession | null> => {
    const session = db
      .select({
        id: ralphSessions.id,
        ticketId: ralphSessions.ticketId,
        projectId: tickets.projectId,
        currentState: ralphSessions.currentState,
        startedAt: ralphSessions.startedAt,
        stateHistory: ralphSessions.stateHistory,
      })
      .from(ralphSessions)
      .innerJoin(tickets, eq(ralphSessions.ticketId, tickets.id))
      .where(and(eq(ralphSessions.ticketId, ticketId), isNull(ralphSessions.completedAt)))
      .orderBy(desc(ralphSessions.startedAt))
      .limit(1)
      .get();

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      ticketId: session.ticketId,
      projectId: session.projectId,
      currentState: session.currentState as RalphSessionState,
      startedAt: session.startedAt,
      stateHistory: safeJsonParse(session.stateHistory, null),
    };
  });

export const getActiveRalphSessions = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, ActiveRalphSession>> => {
    const sessions = db
      .select({
        id: ralphSessions.id,
        ticketId: ralphSessions.ticketId,
        projectId: tickets.projectId,
        currentState: ralphSessions.currentState,
        startedAt: ralphSessions.startedAt,
        stateHistory: ralphSessions.stateHistory,
      })
      .from(ralphSessions)
      .innerJoin(tickets, eq(ralphSessions.ticketId, tickets.id))
      .where(isNull(ralphSessions.completedAt))
      .orderBy(desc(ralphSessions.startedAt))
      .all();

    const result: Record<string, ActiveRalphSession> = {};
    for (const session of sessions) {
      if (!result[session.ticketId]) {
        result[session.ticketId] = {
          id: session.id,
          ticketId: session.ticketId,
          projectId: session.projectId,
          currentState: session.currentState as RalphSessionState,
          startedAt: session.startedAt,
          stateHistory: safeJsonParse(session.stateHistory, null),
        };
      }
    }

    return result;
  }
);
