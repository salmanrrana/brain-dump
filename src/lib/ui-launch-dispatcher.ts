import { launchProviderInTerminal, type InteractiveTerminalProviderMode } from "../api/terminal";
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
  /** One seam for every interactive provider; providerId discriminates the flow. */
  launchProvider: (
    payload: InteractiveTerminalPayload & { providerId: InteractiveTerminalProviderMode }
  ) => Promise<UiLaunchResult>;
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
  launchProvider: async (payload) => launchProviderInTerminal({ data: payload }),
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

/**
 * Builds full Ralph launch dependencies from the transport calls a screen
 * already has (typically react-query mutations). Result shaping and the
 * "not available from this surface" stubs live here once instead of being
 * re-implemented per component.
 */
export function createRalphLaunchDependencies(
  transport: {
    launchTicket?: (payload: LaunchTicketInput) => Promise<{
      success: boolean;
      message: string;
      warnings?: string[] | undefined;
      terminalUsed?: string | undefined;
    }>;
    launchEpic?: (payload: LaunchEpicInput) => Promise<UiLaunchResult>;
  },
  surfaceLabel: string
): RalphLaunchDependencies {
  return {
    startTicketWorkflow: defaultRalphLaunchDependencies.startTicketWorkflow,
    startEpicWorkflow: defaultRalphLaunchDependencies.startEpicWorkflow,
    launchTicketRalph: async (payload) => {
      if (!transport.launchTicket) {
        return {
          success: false,
          message: `Ticket Ralph launch is not available from ${surfaceLabel}.`,
        };
      }
      const result = await transport.launchTicket(payload);
      return {
        success: result.success,
        message: result.message,
        ...(result.warnings ? { warnings: result.warnings } : {}),
        ...("terminalUsed" in result && result.terminalUsed
          ? { terminalUsed: result.terminalUsed }
          : {}),
      };
    },
    launchEpicRalph:
      transport.launchEpic ??
      (async () => ({
        success: false,
        message: `Epic Ralph launch is not available from ${surfaceLabel}.`,
      })),
  };
}

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

  const result = await dependencies.launchProvider({
    ...payload,
    providerId: provider.launchMode,
  });

  return withAdditionalWarnings(result, modelSelectionResolution.warnings);
}

export async function dispatchRalphAutonomousUiLaunch(
  provider: RalphAutonomousUiLaunchProvider,
  context: RalphAutonomousUiLaunchDispatchContext,
  dependencies: RalphLaunchDependencies
): Promise<UiLaunchResult> {
  const modelSelectionResolution = resolveConcreteModelSelection(provider, context.modelSelection);
  const reviewerModelSelectionResolution: ModelSelectionResolution = context.reviewerProvider
    ? resolveConcreteModelSelection(context.reviewerProvider, context.reviewerModelSelection)
    : { warnings: [] };
  const reviewerPayload = context.reviewerProvider
    ? {
        reviewerAiBackend: context.reviewerProvider.aiBackend,
        ...(reviewerModelSelectionResolution.modelSelection
          ? { reviewerModelSelection: reviewerModelSelectionResolution.modelSelection }
          : {}),
      }
    : {};

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
      ...reviewerPayload,
      ...(provider.workingMethodOverride
        ? { workingMethodOverride: provider.workingMethodOverride }
        : {}),
    });

    return withAdditionalWarnings(launchResult, [
      ...modelSelectionResolution.warnings,
      ...reviewerModelSelectionResolution.warnings,
    ]);
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
    ...reviewerPayload,
    ...(provider.workingMethodOverride
      ? { workingMethodOverride: provider.workingMethodOverride }
      : {}),
    ...(launchProfile ? { launchProfile } : {}),
  });

  return {
    ...launchResult,
    warnings: [
      ...modelSelectionResolution.warnings,
      ...reviewerModelSelectionResolution.warnings,
      ...workflowWarnings,
      ...(launchResult.warnings ?? []),
    ],
  };
}
