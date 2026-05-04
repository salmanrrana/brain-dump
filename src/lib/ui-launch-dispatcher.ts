import {
  launchClaudeInTerminal,
  launchCodexInTerminal,
  launchCopilotInTerminal,
  launchCursorAgentInTerminal,
  launchCursorInTerminal,
  launchOpenCodeInTerminal,
  launchPiInTerminal,
  launchVSCodeInTerminal,
} from "../api/terminal";
import { startEpicWorkflowFn, startTicketWorkflowFn } from "../api/workflow-server-fns";
import { getEpicContext, getTicketContext } from "../api/context";
import type {
  InteractiveUiLaunchDispatchContext,
  InteractiveUiLaunchProvider,
  RalphAutonomousUiLaunchDispatchContext,
  RalphAutonomousUiLaunchProvider,
} from "./launch-provider-contract";
import type { LaunchEpicInput, LaunchTicketInput } from "./ralph-launch/types";

export interface TicketLaunchContextResult {
  context: string;
  projectPath: string;
  projectName: string;
  epicName: string | null;
  ticketTitle: string;
}

export interface UiLaunchResult {
  success: boolean;
  message: string;
  warnings?: string[] | undefined;
  terminalUsed?: string | undefined;
  launchMethod?: "vscode" | "cursor" | "copilot-cli" | "terminal" | undefined;
  contextFile?: string | undefined;
}

export interface InteractiveLaunchDependencies {
  getTicketContext: (ticketId: string) => Promise<TicketLaunchContextResult>;
  launchClaude: (payload: InteractiveTerminalPayload) => Promise<UiLaunchResult>;
  launchCodex: (
    payload: InteractiveTerminalPayload & { launchMode: "auto" | "cli" | "app" }
  ) => Promise<UiLaunchResult>;
  launchVSCode: (payload: InteractiveTerminalPayload) => Promise<UiLaunchResult>;
  launchCursor: (payload: InteractiveTerminalPayload) => Promise<UiLaunchResult>;
  launchCursorAgent: (payload: InteractiveTerminalPayload) => Promise<UiLaunchResult>;
  launchCopilot: (payload: InteractiveTerminalPayload) => Promise<UiLaunchResult>;
  launchOpenCode: (payload: InteractiveTerminalPayload) => Promise<UiLaunchResult>;
  launchPi: (payload: InteractiveTerminalPayload) => Promise<UiLaunchResult>;
}

export interface RalphLaunchDependencies {
  startTicketWorkflow: (payload: {
    ticketId: string;
    projectPath?: string | null;
  }) => Promise<UiLaunchResult>;
  startEpicWorkflow: (payload: {
    epicId: string;
    projectPath?: string | null;
  }) => Promise<UiLaunchResult>;
  launchTicketRalph: (payload: LaunchTicketInput) => Promise<UiLaunchResult>;
  launchEpicRalph: (payload: LaunchEpicInput) => Promise<UiLaunchResult>;
}

export interface InteractiveTerminalPayload {
  ticketId: string;
  context: string;
  projectPath: string;
  preferredTerminal?: string | null;
  projectName: string;
  epicName: string | null;
  ticketTitle: string;
}

export const defaultInteractiveLaunchDependencies: InteractiveLaunchDependencies = {
  getTicketContext: async (ticketId) => getTicketContext({ data: ticketId }),
  launchClaude: async (payload) => launchClaudeInTerminal({ data: payload }),
  launchCodex: async (payload) => launchCodexInTerminal({ data: payload }),
  launchVSCode: async (payload) => launchVSCodeInTerminal({ data: payload }),
  launchCursor: async (payload) => launchCursorInTerminal({ data: payload }),
  launchCursorAgent: async (payload) => launchCursorAgentInTerminal({ data: payload }),
  launchCopilot: async (payload) => launchCopilotInTerminal({ data: payload }),
  launchOpenCode: async (payload) => launchOpenCodeInTerminal({ data: payload }),
  launchPi: async (payload) => launchPiInTerminal({ data: payload }),
};

export const defaultRalphLaunchDependencies: Pick<
  RalphLaunchDependencies,
  "startTicketWorkflow" | "startEpicWorkflow"
> = {
  startTicketWorkflow: async (payload) => {
    const result = await startTicketWorkflowFn({
      data: { ticketId: payload.ticketId, projectPath: payload.projectPath ?? "" },
    });

    return {
      success: result.success,
      message: result.success
        ? "Ticket workflow initialized for launch."
        : (result.error ?? "Ticket workflow initialization failed."),
      warnings: result.warnings,
    };
  },
  startEpicWorkflow: async (payload) => {
    const projectPath =
      payload.projectPath ?? (await getEpicContext({ data: payload.epicId })).projectPath;
    const result = await startEpicWorkflowFn({
      data: { epicId: payload.epicId, projectPath },
    });

    return {
      success: result.success,
      message: result.success
        ? "Epic workflow initialized for launch."
        : (result.error ?? "Epic workflow initialization failed."),
      warnings: result.warnings,
    };
  },
};

export async function dispatchInteractiveUiLaunch(
  provider: InteractiveUiLaunchProvider,
  context: InteractiveUiLaunchDispatchContext,
  dependencies: InteractiveLaunchDependencies = defaultInteractiveLaunchDependencies
): Promise<UiLaunchResult> {
  const ticketContext = await dependencies.getTicketContext(context.ticketId);
  const payload: InteractiveTerminalPayload = {
    ticketId: context.ticketId,
    context: ticketContext.context,
    projectPath: context.projectPath ?? ticketContext.projectPath,
    preferredTerminal: context.preferredTerminal ?? null,
    projectName: ticketContext.projectName,
    epicName: ticketContext.epicName,
    ticketTitle: ticketContext.ticketTitle,
  };

  switch (provider.launchMode) {
    case "claude-terminal":
      return dependencies.launchClaude(payload);
    case "codex-auto":
      return dependencies.launchCodex({ ...payload, launchMode: "auto" });
    case "codex-cli":
      return dependencies.launchCodex({ ...payload, launchMode: "cli" });
    case "codex-app":
      return dependencies.launchCodex({ ...payload, launchMode: "app" });
    case "vscode-editor":
      return dependencies.launchVSCode(payload);
    case "cursor-editor":
      return dependencies.launchCursor(payload);
    case "cursor-agent-terminal":
      return dependencies.launchCursorAgent(payload);
    case "copilot-cli":
      return dependencies.launchCopilot(payload);
    case "opencode-terminal":
      return dependencies.launchOpenCode(payload);
    case "pi-terminal":
      return dependencies.launchPi(payload);
  }
}

export async function dispatchRalphAutonomousUiLaunch(
  provider: RalphAutonomousUiLaunchProvider,
  context: RalphAutonomousUiLaunchDispatchContext,
  dependencies: RalphLaunchDependencies
): Promise<UiLaunchResult> {
  if (context.kind === "ticket") {
    await dependencies.startTicketWorkflow({
      ticketId: context.ticketId,
      projectPath: context.projectPath ?? null,
    });

    return dependencies.launchTicketRalph({
      ticketId: context.ticketId,
      preferredTerminal: context.preferredTerminal ?? null,
      useSandbox: false,
      aiBackend: provider.aiBackend,
      ...(provider.workingMethodOverride
        ? { workingMethodOverride: provider.workingMethodOverride }
        : {}),
    });
  }

  const workflowResult =
    context.kind === "epic"
      ? await dependencies.startEpicWorkflow({
          epicId: context.epicId,
          projectPath: context.projectPath ?? null,
        })
      : undefined;
  const workflowWarnings = workflowResult
    ? [
        ...(!workflowResult.success
          ? [`Branch setup skipped: ${workflowResult.message}. Launching on the current branch.`]
          : []),
        ...(workflowResult.warnings ?? []),
      ]
    : [];

  const launchProfile =
    context.kind === "focused-review"
      ? {
          type: "review" as const,
          selectedTicketIds: context.selectedTicketIds,
          steeringPrompt: context.steeringPrompt ?? null,
        }
      : undefined;

  const launchResult = await dependencies.launchEpicRalph({
    epicId: context.epicId,
    preferredTerminal: context.preferredTerminal ?? null,
    useSandbox: context.useSandbox ?? false,
    aiBackend: provider.aiBackend,
    ...(provider.workingMethodOverride
      ? { workingMethodOverride: provider.workingMethodOverride }
      : {}),
    ...(launchProfile ? { launchProfile } : {}),
  });

  return {
    ...launchResult,
    warnings: [...workflowWarnings, ...(launchResult.warnings ?? [])],
  };
}
