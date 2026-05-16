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
  UiLaunchProvider,
} from "./launch-provider-contract";
import {
  isDefaultOnlyLaunchProvider,
  type ConcreteLaunchModelSelection,
  type LaunchModelSelection,
} from "./launch-model-catalog";
import type { LaunchEpicInput, LaunchTicketInput } from "./ralph-launch/types";
import { RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS } from "./ui-launch-registry";

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
  modelSelection?: ConcreteLaunchModelSelection;
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

function concreteModelSelection(
  modelSelection: LaunchModelSelection | undefined
): ConcreteLaunchModelSelection | undefined {
  return modelSelection?.kind === "concrete" ? modelSelection : undefined;
}

interface ModelSelectionResolution {
  modelSelection?: ConcreteLaunchModelSelection;
  warnings: string[];
}

function resolveConcreteModelSelection(
  provider: UiLaunchProvider,
  modelSelection: LaunchModelSelection | undefined
): ModelSelectionResolution {
  const concreteSelection = concreteModelSelection(modelSelection);
  if (!concreteSelection) {
    return { warnings: [] };
  }

  if (isDefaultOnlyLaunchProvider(provider.id)) {
    return {
      warnings: [
        `${provider.display.label} does not have pricing-backed model choices yet. Launching with the provider's default model.`,
      ],
    };
  }

  return { modelSelection: concreteSelection, warnings: [] };
}

function withAdditionalWarnings(
  result: UiLaunchResult,
  warnings: readonly string[]
): UiLaunchResult {
  if (warnings.length === 0) {
    return result;
  }

  return {
    ...result,
    warnings: [...warnings, ...(result.warnings ?? [])],
  };
}

export function getDefaultRalphAutonomousProviderForWorkingMethod(
  workingMethod?: string | null
): RalphAutonomousUiLaunchProvider {
  const providerIdByWorkingMethod: Record<string, RalphAutonomousUiLaunchProvider["id"]> = {
    codex: "ralph-codex",
    "cursor-agent": "ralph-cursor-agent",
    "copilot-cli": "ralph-copilot",
    opencode: "ralph-opencode",
    pi: "ralph-pi",
  };
  const providerId = workingMethod ? providerIdByWorkingMethod[workingMethod] : undefined;

  return (
    RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS.find((provider) => provider.id === providerId) ??
    RALPH_AUTONOMOUS_UI_LAUNCH_PROVIDERS[0]!
  );
}

export async function dispatchInteractiveUiLaunch(
  provider: InteractiveUiLaunchProvider,
  context: InteractiveUiLaunchDispatchContext,
  dependencies: InteractiveLaunchDependencies = defaultInteractiveLaunchDependencies
): Promise<UiLaunchResult> {
  const ticketContext = await dependencies.getTicketContext(context.ticketId);
  const modelSelectionResolution = resolveConcreteModelSelection(provider, context.modelSelection);
  const payload: InteractiveTerminalPayload = {
    ticketId: context.ticketId,
    context: ticketContext.context,
    projectPath: context.projectPath ?? ticketContext.projectPath,
    preferredTerminal: context.preferredTerminal ?? null,
    projectName: ticketContext.projectName,
    epicName: ticketContext.epicName,
    ticketTitle: ticketContext.ticketTitle,
    ...(modelSelectionResolution.modelSelection
      ? { modelSelection: modelSelectionResolution.modelSelection }
      : {}),
  };

  let result: UiLaunchResult;
  switch (provider.launchMode) {
    case "claude-terminal":
      result = await dependencies.launchClaude(payload);
      break;
    case "codex-auto":
      result = await dependencies.launchCodex({ ...payload, launchMode: "auto" });
      break;
    case "codex-cli":
      result = await dependencies.launchCodex({ ...payload, launchMode: "cli" });
      break;
    case "codex-app":
      result = await dependencies.launchCodex({ ...payload, launchMode: "app" });
      break;
    case "vscode-editor":
      result = await dependencies.launchVSCode(payload);
      break;
    case "cursor-editor":
      result = await dependencies.launchCursor(payload);
      break;
    case "cursor-agent-terminal":
      result = await dependencies.launchCursorAgent(payload);
      break;
    case "copilot-cli":
      result = await dependencies.launchCopilot(payload);
      break;
    case "opencode-terminal":
      result = await dependencies.launchOpenCode(payload);
      break;
    case "pi-terminal":
      result = await dependencies.launchPi(payload);
      break;
  }

  return withAdditionalWarnings(result, modelSelectionResolution.warnings);
}

export async function dispatchRalphAutonomousUiLaunch(
  provider: RalphAutonomousUiLaunchProvider,
  context: RalphAutonomousUiLaunchDispatchContext,
  dependencies: RalphLaunchDependencies
): Promise<UiLaunchResult> {
  const modelSelectionResolution = resolveConcreteModelSelection(provider, context.modelSelection);

  if (context.kind === "ticket") {
    await dependencies.startTicketWorkflow({
      ticketId: context.ticketId,
      projectPath: context.projectPath ?? null,
    });

    const launchResult = await dependencies.launchTicketRalph({
      ticketId: context.ticketId,
      preferredTerminal: context.preferredTerminal ?? null,
      useSandbox: false,
      aiBackend: provider.aiBackend,
      ...(modelSelectionResolution.modelSelection
        ? { modelSelection: modelSelectionResolution.modelSelection }
        : {}),
      ...(provider.workingMethodOverride
        ? { workingMethodOverride: provider.workingMethodOverride }
        : {}),
    });

    return withAdditionalWarnings(launchResult, modelSelectionResolution.warnings);
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
    ...(modelSelectionResolution.modelSelection
      ? { modelSelection: modelSelectionResolution.modelSelection }
      : {}),
    ...(provider.workingMethodOverride
      ? { workingMethodOverride: provider.workingMethodOverride }
      : {}),
    ...(launchProfile ? { launchProfile } : {}),
  });

  return {
    ...launchResult,
    warnings: [
      ...modelSelectionResolution.warnings,
      ...workflowWarnings,
      ...(launchResult.warnings ?? []),
    ],
  };
}
