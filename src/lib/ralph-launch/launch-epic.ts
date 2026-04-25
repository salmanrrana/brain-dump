import { randomUUID } from "crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { and, eq, inArray } from "drizzle-orm";
import {
  addEpicReviewRunAuditComments,
  createEpicReviewRun,
  createRealGitOperations,
  GitError,
  startWork,
  updateEpicReviewRun,
  updateEpicReviewRunTicketLink,
} from "../../../core/index.ts";
import {
  generateEnhancedPRD,
  generateVSCodeContext,
  writeVSCodeContext,
} from "../../api/ralph-prompts";
import {
  DEFAULT_RESOURCE_LIMITS,
  DEFAULT_TIMEOUT_SECONDS,
  generateRalphScript,
} from "../../api/ralph-script";
import {
  launchInCopilotCli,
  launchInCursor,
  launchInTerminal,
  launchInVSCode,
  validateDockerSetup,
} from "../../api/ralph-launchers";
import { epics, projects, settings, tickets } from "../schema";
import { getHumanRequestedChangesByTicketId } from "./change-request-context";
import type {
  EpicLaunchPreparation,
  LaunchEpicInput,
  RalphEpicLaunchProfile,
  RalphLaunchDb,
  RalphLaunchDependencies,
  TicketRecord,
} from "./types";

const coreGit = createRealGitOperations();

const WORKING_METHOD_LABELS: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  "copilot-cli": "Copilot CLI",
};

function sanitizeArtifactSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function buildReviewLaunchArtifactPaths(
  epicReviewRunId: string,
  ticketId: string
): {
  prdRelativePath: string;
  contextRelativePath: string;
} {
  const safeTicketId = sanitizeArtifactSegment(ticketId);
  return {
    prdRelativePath: `plans/review-runs/${epicReviewRunId}/${safeTicketId}.json`,
    contextRelativePath: `.claude/review-runs/${epicReviewRunId}/${safeTicketId}.md`,
  };
}

export function prepareEpicLaunch(
  epicTickets: TicketRecord[],
  launchProfile?: RalphEpicLaunchProfile,
  epicReviewRunId?: string
): { success: true; preparation: EpicLaunchPreparation } | { success: false; message: string } {
  if (!launchProfile || launchProfile.type !== "review") {
    return {
      success: true,
      preparation: {
        promptProfile: { type: "implementation" },
        prdTickets: epicTickets,
        startsImplementationWorkflow: true,
        reviewLaunches: [],
      },
    };
  }

  if (launchProfile.selectedTicketIds.length === 0) {
    return {
      success: false,
      message: "Focused review launch requires at least one selected ticket.",
    };
  }

  const seenTicketIds = new Set<string>();
  const selectedTickets: TicketRecord[] = [];

  for (const selectedTicketId of launchProfile.selectedTicketIds) {
    if (seenTicketIds.has(selectedTicketId)) {
      return {
        success: false,
        message: `Focused review launch received duplicate ticket selection: ${selectedTicketId}`,
      };
    }

    seenTicketIds.add(selectedTicketId);

    const selectedTicket = epicTickets.find((ticket) => ticket.id === selectedTicketId);
    if (!selectedTicket) {
      return {
        success: false,
        message: `Selected review ticket does not belong to this epic: ${selectedTicketId}`,
      };
    }

    selectedTickets.push(selectedTicket);
  }

  const reviewLaunches = selectedTickets.map((selectedTicket) => {
    const artifactPaths = buildReviewLaunchArtifactPaths(
      epicReviewRunId ?? "focused-review-run",
      selectedTicket.id
    );

    return {
      ticket: selectedTicket,
      prdRelativePath: artifactPaths.prdRelativePath,
      contextRelativePath: artifactPaths.contextRelativePath,
      promptProfile: {
        type: "review" as const,
        selectedTicket: {
          id: selectedTicket.id,
          title: selectedTicket.title,
        },
        steeringPrompt: launchProfile.steeringPrompt ?? null,
        prdRelativePath: artifactPaths.prdRelativePath,
      },
    };
  });

  const firstLaunch = reviewLaunches[0];
  if (!firstLaunch) {
    return {
      success: false,
      message: "Focused review launch requires at least one selected ticket.",
    };
  }

  return {
    success: true,
    preparation: {
      promptProfile: firstLaunch.promptProfile,
      prdTickets: selectedTickets,
      startsImplementationWorkflow: false,
      reviewLaunches,
    },
  };
}

export async function launchRalphForEpicCore(
  db: RalphLaunchDb,
  input: LaunchEpicInput,
  dependencies: RalphLaunchDependencies = {}
): Promise<
  | {
      success: false;
      message: string;
      warnings?: string[] | undefined;
    }
  | {
      success: true;
      message: string;
      launchMethod: "vscode" | "cursor" | "copilot-cli" | "terminal";
      warnings?: string[] | undefined;
      contextFile?: string | undefined;
      terminalUsed?: string | undefined;
      ticketCount?: number | undefined;
    }
> {
  const sqlite = dependencies.sqlite ?? (await import("../db")).sqlite;
  const {
    epicId,
    maxIterations,
    preferredTerminal,
    useSandbox = false,
    aiBackend = "claude",
    workingMethodOverride,
    launchProfile,
  } = input;

  const appSettings = db.select().from(settings).where(eq(settings.id, "default")).get();
  const timeoutSeconds = appSettings?.ralphTimeout ?? DEFAULT_TIMEOUT_SECONDS;
  const effectiveMaxIterations = maxIterations ?? appSettings?.ralphMaxIterations ?? 10;

  const epic = db.select().from(epics).where(eq(epics.id, epicId)).get();
  if (!epic) {
    return { success: false, message: "Epic not found" };
  }

  const project = db.select().from(projects).where(eq(projects.id, epic.projectId)).get();
  if (!project) {
    return { success: false, message: "Project not found" };
  }

  if (!existsSync(project.path)) {
    return { success: false, message: `Project directory not found: ${project.path}` };
  }

  let sshWarnings: string[] | undefined;
  let dockerHostEnv: string | null = null;
  if (useSandbox) {
    if (aiBackend !== "claude") {
      return {
        success: false,
        message: `Ralph Docker mode currently supports Claude only. Use native mode for ${aiBackend}.`,
      };
    }

    const dockerResult = await validateDockerSetup();
    if (!dockerResult.success) {
      return dockerResult;
    }

    sshWarnings = dockerResult.warnings;
    const { getDockerHostEnvValue } = await import("../../api/docker-utils");
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

  let epicReviewRunId: string | null = null;
  if (launchProfile?.type === "review") {
    try {
      const run = createEpicReviewRun(sqlite, {
        epicId: epic.id,
        selectedTicketIds: launchProfile.selectedTicketIds,
        launchMode: "focused-review",
        provider: aiBackend,
        steeringPrompt: launchProfile.steeringPrompt ?? null,
      });
      addEpicReviewRunAuditComments(sqlite, run.id);
      epicReviewRunId = run.id;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to create focused review run",
      };
    }
  }

  const launchPreparation = prepareEpicLaunch(
    epicTickets,
    launchProfile,
    epicReviewRunId ?? undefined
  );
  if (!launchPreparation.success) {
    if (epicReviewRunId) {
      updateEpicReviewRun(sqlite, {
        epicReviewRunId,
        status: "failed",
        summary: launchPreparation.message,
        completedAt: new Date().toISOString(),
      });
    }
    return launchPreparation;
  }

  const { promptProfile, prdTickets, startsImplementationWorkflow, reviewLaunches } =
    launchPreparation.preparation;
  const launchedTicketCount = prdTickets.length;
  const workingMethod = workingMethodOverride || project.workingMethod || "auto";

  if (reviewLaunches.length > 0 && epicReviewRunId) {
    const runStartedAt = new Date().toISOString();
    updateEpicReviewRun(sqlite, {
      epicReviewRunId,
      status: "running",
      startedAt: runStartedAt,
      summary: `Launching focused review for ${reviewLaunches.length} ticket${reviewLaunches.length === 1 ? "" : "s"}.`,
    });

    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });

    let firstContextPath: string | undefined;
    let firstTerminalUsed: string | undefined;
    let successfulLaunchCount = 0;
    const failureMessages: string[] = [];

    for (const reviewLaunch of reviewLaunches) {
      const humanRequestedChanges = getHumanRequestedChangesByTicketId(sqlite, [
        reviewLaunch.ticket.id,
      ]);
      const ticketPrd = generateEnhancedPRD(
        project.name,
        project.path,
        [reviewLaunch.ticket],
        epic.title,
        epic.description ?? undefined,
        humanRequestedChanges
      );
      const ticketPrdPath = join(project.path, reviewLaunch.prdRelativePath);
      mkdirSync(dirname(ticketPrdPath), { recursive: true });
      writeFileSync(ticketPrdPath, JSON.stringify(ticketPrd, null, 2));

      const launchedAt = new Date().toISOString();

      if (
        workingMethod === "vscode" ||
        workingMethod === "cursor" ||
        workingMethod === "copilot-cli"
      ) {
        const contextContent = generateVSCodeContext(ticketPrd, reviewLaunch.promptProfile);
        const contextResult = await writeVSCodeContext(
          project.path,
          contextContent,
          reviewLaunch.contextRelativePath
        );

        if (!contextResult.success) {
          failureMessages.push(`${reviewLaunch.ticket.title}: ${contextResult.message}`);
          updateEpicReviewRunTicketLink(sqlite, {
            epicReviewRunId,
            ticketId: reviewLaunch.ticket.id,
            status: "failed",
            summary: contextResult.message,
            completedAt: launchedAt,
          });
          continue;
        }

        if (!firstContextPath) {
          firstContextPath = contextResult.path;
        }

        let launchResult;
        if (workingMethod === "vscode") {
          launchResult = await launchInVSCode(project.path, contextResult.path);
        } else if (workingMethod === "cursor") {
          launchResult = await launchInCursor(project.path, contextResult.path);
        } else {
          launchResult = await launchInCopilotCli(
            project.path,
            contextResult.path,
            preferredTerminal
          );
        }

        if (!launchResult.success) {
          failureMessages.push(`${reviewLaunch.ticket.title}: ${launchResult.message}`);
          updateEpicReviewRunTicketLink(sqlite, {
            epicReviewRunId,
            ticketId: reviewLaunch.ticket.id,
            status: "failed",
            summary: launchResult.message,
            completedAt: launchedAt,
          });
          continue;
        }

        successfulLaunchCount += 1;
        updateEpicReviewRunTicketLink(sqlite, {
          epicReviewRunId,
          ticketId: reviewLaunch.ticket.id,
          status: "running",
          summary:
            workingMethod === "copilot-cli"
              ? `Focused review opened in ${"terminal" in launchResult ? launchResult.terminal : "your terminal"}.`
              : `Focused review context opened in ${workingMethod === "vscode" ? "VS Code" : "Cursor"}.`,
          startedAt: launchedAt,
        });

        if (workingMethod === "copilot-cli" && "terminal" in launchResult && !firstTerminalUsed) {
          firstTerminalUsed = String(launchResult.terminal);
        }

        continue;
      }

      const reviewScript = generateRalphScript(
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
              epicId: epic.id,
              epicTitle: epic.title,
            }
          : undefined,
        aiBackend,
        reviewLaunch.promptProfile
      );
      const reviewScriptPath = join(
        scriptDir,
        `ralph-epic-review-${useSandbox ? "docker-" : ""}${sanitizeArtifactSegment(reviewLaunch.ticket.id)}-${randomUUID()}.sh`
      );
      writeFileSync(reviewScriptPath, reviewScript, { mode: 0o700 });
      chmodSync(reviewScriptPath, 0o700);

      const launchResult = await launchInTerminal(
        project.path,
        reviewScriptPath,
        preferredTerminal
      );
      if (!launchResult.success) {
        failureMessages.push(`${reviewLaunch.ticket.title}: ${launchResult.message}`);
        updateEpicReviewRunTicketLink(sqlite, {
          epicReviewRunId,
          ticketId: reviewLaunch.ticket.id,
          status: "failed",
          summary: launchResult.message,
          completedAt: launchedAt,
        });
        continue;
      }

      successfulLaunchCount += 1;
      if (!firstTerminalUsed) {
        firstTerminalUsed = launchResult.terminal;
      }
      updateEpicReviewRunTicketLink(sqlite, {
        epicReviewRunId,
        ticketId: reviewLaunch.ticket.id,
        status: "running",
        summary: `Focused review launched in ${launchResult.terminal}.`,
        startedAt: launchedAt,
      });
    }

    const failedLaunchCount = reviewLaunches.length - successfulLaunchCount;
    const runSummary =
      failedLaunchCount === 0
        ? `Launched focused review for ${successfulLaunchCount} ticket${successfulLaunchCount === 1 ? "" : "s"}.`
        : `Launched focused review for ${successfulLaunchCount} of ${reviewLaunches.length} ticket${reviewLaunches.length === 1 ? "" : "s"}. Failed launches: ${failureMessages.join(" | ")}`;

    updateEpicReviewRun(sqlite, {
      epicReviewRunId,
      status: successfulLaunchCount === 0 ? "failed" : "running",
      summary: runSummary,
      completedAt: successfulLaunchCount === 0 ? new Date().toISOString() : null,
    });

    if (successfulLaunchCount === 0) {
      return {
        success: false,
        message: runSummary,
        warnings: sshWarnings,
      };
    }

    if (workingMethod === "copilot-cli") {
      const terminalLabel = firstTerminalUsed ?? "your terminal";
      return {
        success: true,
        message: `Opening Copilot CLI in ${terminalLabel} for ${successfulLaunchCount} focused review ticket${successfulLaunchCount === 1 ? "" : "s"}. Review run: ${epicReviewRunId}.${failedLaunchCount > 0 ? ` ${failedLaunchCount} launch${failedLaunchCount === 1 ? "" : "es"} failed.` : ""}`,
        launchMethod: "copilot-cli",
        contextFile: firstContextPath,
        terminalUsed: firstTerminalUsed,
        ticketCount: successfulLaunchCount,
        warnings: sshWarnings,
      };
    }

    if (workingMethod === "vscode" || workingMethod === "cursor") {
      const methodLabel = workingMethod === "vscode" ? "VS Code" : "Cursor";
      return {
        success: true,
        message: `Opened ${methodLabel} with isolated focused review contexts for ${successfulLaunchCount} ticket${successfulLaunchCount === 1 ? "" : "s"}. Review run: ${epicReviewRunId}.${failedLaunchCount > 0 ? ` ${failedLaunchCount} launch${failedLaunchCount === 1 ? "" : "es"} failed.` : ""}`,
        launchMethod: workingMethod,
        contextFile: firstContextPath,
        ticketCount: successfulLaunchCount,
        warnings: sshWarnings,
      };
    }

    return {
      success: true,
      message: `Launched Ralph for ${successfulLaunchCount} focused review ticket${successfulLaunchCount === 1 ? "" : "s"} in ${firstTerminalUsed ?? "your terminal"}. Review run: ${epicReviewRunId}.${failedLaunchCount > 0 ? ` ${failedLaunchCount} launch${failedLaunchCount === 1 ? "" : "es"} failed.` : ""}`,
      terminalUsed: firstTerminalUsed,
      launchMethod: "terminal",
      ticketCount: successfulLaunchCount,
      warnings: sshWarnings,
    };
  }

  const plansDir = join(project.path, "plans");
  mkdirSync(plansDir, { recursive: true });

  const humanRequestedChanges = getHumanRequestedChangesByTicketId(
    sqlite,
    prdTickets.map((ticket) => ticket.id)
  );
  const prd = generateEnhancedPRD(
    project.name,
    project.path,
    prdTickets,
    epic.title,
    epic.description ?? undefined,
    humanRequestedChanges
  );
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
          epicId: epic.id,
          epicTitle: epic.title,
        }
      : undefined,
    aiBackend,
    promptProfile
  );
  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });
  const scriptPath = join(scriptDir, `ralph-epic-${useSandbox ? "docker-" : ""}${randomUUID()}.sh`);
  writeFileSync(scriptPath, ralphScript, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  if (startsImplementationWorkflow) {
    const firstTicket = epicTickets.find(
      (ticket) => ticket.status === "backlog" || ticket.status === "ready"
    );
    if (firstTicket) {
      try {
        startWork(sqlite, firstTicket.id, coreGit);
      } catch (error) {
        if (error instanceof GitError) {
          console.warn(
            `[brain-dump] Git not available for first ticket, skipping branch creation: ${error.message}`
          );
        } else {
          throw error;
        }
      }
    }

    for (const ticket of epicTickets) {
      if (
        ticket.id !== firstTicket?.id &&
        (ticket.status === "backlog" || ticket.status === "ready")
      ) {
        db.update(tickets).set({ status: "in_progress" }).where(eq(tickets.id, ticket.id)).run();
      }
    }
  }

  console.log(
    `[brain-dump] Ralph ${promptProfile.type} launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
  );

  if (workingMethod === "vscode" || workingMethod === "cursor" || workingMethod === "copilot-cli") {
    const methodLabel = WORKING_METHOD_LABELS[workingMethod] ?? workingMethod;
    console.log(`[brain-dump] Using ${methodLabel} launch path`);

    const contextContent = generateVSCodeContext(prd, promptProfile);
    const contextResult = await writeVSCodeContext(project.path, contextContent);
    if (!contextResult.success) {
      if (startsImplementationWorkflow) {
        for (const ticket of epicTickets) {
          db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticket.id)).run();
        }
      }
      return contextResult;
    }

    console.log(`[brain-dump] Created Ralph context file: ${contextResult.path}`);

    let launchResult;
    if (workingMethod === "vscode") {
      launchResult = await launchInVSCode(project.path, contextResult.path);
    } else if (workingMethod === "cursor") {
      launchResult = await launchInCursor(project.path, contextResult.path);
    } else {
      launchResult = await launchInCopilotCli(project.path, contextResult.path, preferredTerminal);
    }

    if (!launchResult.success) {
      if (startsImplementationWorkflow) {
        for (const ticket of epicTickets) {
          db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticket.id)).run();
        }
      }
      return launchResult;
    }

    if (workingMethod === "copilot-cli") {
      const terminalUsed = "terminal" in launchResult ? String(launchResult.terminal) : undefined;
      const terminalLabel = terminalUsed ?? "your terminal";
      return {
        success: true,
        message: `Opening Copilot CLI in ${terminalLabel} for ${launchedTicketCount} ticket${launchedTicketCount === 1 ? "" : "s"}. If no window appears, check that ${terminalLabel} is running.`,
        launchMethod: "copilot-cli",
        contextFile: contextResult.path,
        terminalUsed,
        ticketCount: launchedTicketCount,
        warnings: sshWarnings,
      };
    }

    return {
      success: true,
      message: `Opened ${methodLabel} with Ralph context for ${launchedTicketCount} ticket${launchedTicketCount === 1 ? "" : "s"}. Check .claude/ralph-context.md for instructions.`,
      launchMethod: workingMethod,
      contextFile: contextResult.path,
      ticketCount: launchedTicketCount,
      warnings: sshWarnings,
    };
  }

  console.log("[brain-dump] Using terminal launch path");
  const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);
  if (!launchResult.success) {
    return launchResult;
  }

  return {
    success: true,
    message: `Launched Ralph for ${launchedTicketCount} ticket${launchedTicketCount === 1 ? "" : "s"} in ${launchResult.terminal}.`,
    terminalUsed: launchResult.terminal,
    launchMethod: "terminal",
    ticketCount: launchedTicketCount,
    warnings: sshWarnings,
  };
}
