import type {
  InteractiveLaunchProviderId as CoreInteractiveLaunchProviderId,
  ProviderId,
  RalphAutonomousLaunchProviderId,
} from "../../core/providers.ts";
import {
  INTERACTIVE_LAUNCH_PROVIDER_IDS,
  PROJECT_WORKING_METHOD_PROVIDER_IDS,
  RALPH_AUTONOMOUS_PROVIDER_IDS,
} from "../../core/providers.ts";
import type { RalphAiBackend } from "../api/ralph-script";
import type { LaunchModelSelection } from "./launch-model-catalog";
import type { RalphWorkingMethod } from "./ralph-launch/types";

/**
 * Shared UI launch provider contract.
 *
 * This module intentionally defines provider identity, presentation metadata, availability,
 * and dispatch context shapes separately from any specific screen layout. Components can
 * render cards, split buttons, menus, or grouped lists while consuming the same provider ids
 * and dispatch parameters.
 */

export type LaunchProviderIconKey = "sparkles" | "bot" | "code" | "terminal" | "monitor" | "github";

export type LaunchProviderGroup =
  | "interactive"
  | "autonomous"
  | "focused-review"
  | "project-environment";

export type InteractiveLaunchProviderId = CoreInteractiveLaunchProviderId;
export type RalphAutonomousProviderId = RalphAutonomousLaunchProviderId;

export type UiLaunchProviderId = InteractiveLaunchProviderId | RalphAutonomousProviderId;

export interface LaunchProviderRuntimeAvailability {
  providerId: UiLaunchProviderId;
  installed: boolean;
  mode?: "cli" | "app";
  detail?: string;
  error?: string;
}

export type UiLaunchContextKind =
  | "ticket"
  | "epic-next-ticket"
  | "epic"
  | "focused-review"
  | "project-environment";

export interface LaunchProviderDisplayMetadata {
  label: string;
  description: string;
  iconKey: LaunchProviderIconKey;
  iconColor: string;
  group: LaunchProviderGroup;
  order: number;
  recommended?: boolean;
}

export interface LaunchProviderAvailability {
  supportedContexts: UiLaunchContextKind[];
  disabled?: boolean;
  disabledReason?: string;
}

export interface BaseUiLaunchProvider<ProviderId extends UiLaunchProviderId> {
  id: ProviderId;
  display: LaunchProviderDisplayMetadata;
  availability: LaunchProviderAvailability;
}

export type InteractiveLaunchMode =
  | "claude-terminal"
  | "codex-auto"
  | "codex-cli"
  | "codex-app"
  | "vscode-editor"
  | "cursor-editor"
  | "cursor-agent-terminal"
  | "copilot-cli"
  | "opencode-terminal"
  | "pi-terminal";

export interface InteractiveUiLaunchProvider extends BaseUiLaunchProvider<InteractiveLaunchProviderId> {
  providerKind: "interactive";
  launchMode: InteractiveLaunchMode;
}

export interface RalphAutonomousUiLaunchProvider extends BaseUiLaunchProvider<RalphAutonomousProviderId> {
  providerKind: "ralph-autonomous";
  aiBackend: RalphAiBackend;
  workingMethodOverride?: RalphWorkingMethod;
}

export type UiLaunchProvider = InteractiveUiLaunchProvider | RalphAutonomousUiLaunchProvider;

export interface BaseUiLaunchDispatchContext {
  projectPath?: string | null;
  preferredTerminal?: string | null;
  useSandbox?: boolean;
  modelSelection?: LaunchModelSelection;
  reviewerProvider?: RalphAutonomousUiLaunchProvider;
  reviewerModelSelection?: LaunchModelSelection;
}

export interface TicketUiLaunchDispatchContext extends BaseUiLaunchDispatchContext {
  kind: "ticket";
  ticketId: string;
}

export interface EpicNextTicketUiLaunchDispatchContext extends BaseUiLaunchDispatchContext {
  kind: "epic-next-ticket";
  epicId: string;
  ticketId: string;
}

export interface EpicUiLaunchDispatchContext extends BaseUiLaunchDispatchContext {
  kind: "epic";
  epicId: string;
}

export interface FocusedReviewUiLaunchDispatchContext extends BaseUiLaunchDispatchContext {
  kind: "focused-review";
  epicId: string;
  selectedTicketIds: string[];
  steeringPrompt?: string | null;
}

export type InteractiveUiLaunchDispatchContext =
  | TicketUiLaunchDispatchContext
  | EpicNextTicketUiLaunchDispatchContext;

export type RalphAutonomousUiLaunchDispatchContext =
  | TicketUiLaunchDispatchContext
  | EpicUiLaunchDispatchContext
  | FocusedReviewUiLaunchDispatchContext;

export type UiLaunchDispatchContext =
  | InteractiveUiLaunchDispatchContext
  | RalphAutonomousUiLaunchDispatchContext;

export interface UiLaunchDispatchRequest<
  Provider extends UiLaunchProvider = UiLaunchProvider,
  Context extends UiLaunchDispatchContext = UiLaunchDispatchContext,
> {
  provider: Provider;
  context: Context;
}

export type ProjectWorkingMethodProviderId = "auto" | ProviderId;

export interface ProjectWorkingMethodProvider {
  id: ProjectWorkingMethodProviderId;
  display: LaunchProviderDisplayMetadata;
}

export {
  INTERACTIVE_LAUNCH_PROVIDER_IDS,
  PROJECT_WORKING_METHOD_PROVIDER_IDS,
  RALPH_AUTONOMOUS_PROVIDER_IDS,
};
