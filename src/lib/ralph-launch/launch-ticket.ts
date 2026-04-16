import { randomUUID } from "crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { eq } from "drizzle-orm";
import { createRealGitOperations, GitError, startWork } from "../../../core/index.ts";
import { getDockerHostEnvValue } from "../../api/docker-utils";
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
import { sqlite as defaultSqlite } from "../db";
import { projects, settings, tickets } from "../schema";
import type { LaunchTicketInput, RalphLaunchDb, RalphLaunchDependencies } from "./types";

const coreGit = createRealGitOperations();

const WORKING_METHOD_LABELS: Record<string, string> = {
  vscode: "VS Code",
  cursor: "Cursor",
  "copilot-cli": "Copilot CLI",
};

export async function launchRalphForTicketCore(
  db: RalphLaunchDb,
  input: LaunchTicketInput,
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
    }
> {
  const sqlite = dependencies.sqlite ?? defaultSqlite;
  const {
    ticketId,
    maxIterations,
    preferredTerminal,
    useSandbox = false,
    aiBackend = "claude",
    workingMethodOverride,
  } = input;

  const appSettings = db.select().from(settings).where(eq(settings.id, "default")).get();
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

  try {
    startWork(sqlite, ticketId, coreGit);
  } catch (error) {
    if (error instanceof GitError) {
      console.warn(`[brain-dump] Git not available, skipping branch creation: ${error.message}`);
      db.update(tickets).set({ status: "in_progress" }).where(eq(tickets.id, ticketId)).run();
    } else {
      throw error;
    }
  }

  const workingMethod = workingMethodOverride || project.workingMethod || "auto";
  console.log(
    `[brain-dump] Ralph ticket launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
  );

  if (workingMethod === "vscode" || workingMethod === "cursor" || workingMethod === "copilot-cli") {
    const methodLabel = WORKING_METHOD_LABELS[workingMethod] ?? workingMethod;
    console.log(`[brain-dump] Using ${methodLabel} launch path for single ticket`);

    const contextContent = generateVSCodeContext(prd);
    const contextResult = await writeVSCodeContext(project.path, contextContent);
    if (!contextResult.success) {
      db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
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
      db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
      return launchResult;
    }

    if (workingMethod === "copilot-cli") {
      const terminalUsed = "terminal" in launchResult ? String(launchResult.terminal) : undefined;
      const terminalLabel = terminalUsed ?? "your terminal";
      return {
        success: true,
        message: `Opening Copilot CLI in ${terminalLabel} for ticket "${ticket.title}". If no window appears, check that ${terminalLabel} is running.`,
        launchMethod: "copilot-cli",
        contextFile: contextResult.path,
        terminalUsed,
        warnings: sshWarnings,
      };
    }

    return {
      success: true,
      message: `Opened ${methodLabel} with Ralph context for ticket "${ticket.title}". Check .claude/ralph-context.md for instructions.`,
      launchMethod: workingMethod,
      contextFile: contextResult.path,
      warnings: sshWarnings,
    };
  }

  console.log("[brain-dump] Using terminal launch path for single ticket");
  const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);
  if (!launchResult.success) {
    return launchResult;
  }

  return {
    success: true,
    message: `Launched Ralph in ${launchResult.terminal}`,
    terminalUsed: launchResult.terminal,
    launchMethod: "terminal",
    warnings: sshWarnings,
  };
}
