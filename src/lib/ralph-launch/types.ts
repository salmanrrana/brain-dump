import type { RalphPromptProfile, RalphReviewPromptProfile } from "../../api/ralph-prompts";
import type { RalphAiBackend } from "../../api/ralph-script";
import type { ConcreteLaunchModelSelection } from "../launch-model-catalog";

export type { RalphReviewerConfig } from "../../api/ralph-script";

export type RalphLaunchDb = typeof import("../db").db;
export type RalphLaunchSqlite = typeof import("../db").sqlite;
export type TicketRecord = typeof import("../schema").tickets.$inferSelect;

export type RalphWorkingMethod =
  | "auto"
  | "claude-code"
  | "vscode"
  | "opencode"
  | "cursor"
  | "cursor-agent"
  | "copilot-cli"
  | "codex"
  | "pi";

export interface RalphImplementationLaunchProfile {
  type?: "implementation";
}

export interface RalphReviewLaunchProfile {
  type: "review";
  selectedTicketIds: string[];
  steeringPrompt?: string | null;
}

export type RalphEpicLaunchProfile = RalphImplementationLaunchProfile | RalphReviewLaunchProfile;

export interface PreparedReviewLaunch {
  ticket: TicketRecord;
  promptProfile: RalphReviewPromptProfile;
  prdRelativePath: string;
  contextRelativePath: string;
}

export interface EpicLaunchPreparation {
  promptProfile: RalphPromptProfile;
  prdTickets: TicketRecord[];
  startsImplementationWorkflow: boolean;
  reviewLaunches: PreparedReviewLaunch[];
}

export interface LaunchTicketInput {
  ticketId: string;
  maxIterations?: number;
  preferredTerminal?: string | null;
  useSandbox?: boolean;
  aiBackend?: RalphAiBackend;
  workingMethodOverride?: RalphWorkingMethod;
  modelSelection?: ConcreteLaunchModelSelection;
  /** Fresh-eyes reviewer backend for the ai_review phase (default: same as implementer). */
  reviewerAiBackend?: RalphAiBackend;
  /** Model for the reviewer backend (default: the reviewer provider's own default model). */
  reviewerModelSelection?: ConcreteLaunchModelSelection;
}

export interface LaunchEpicInput {
  epicId: string;
  maxIterations?: number;
  preferredTerminal?: string | null;
  useSandbox?: boolean;
  aiBackend?: RalphAiBackend;
  workingMethodOverride?: RalphWorkingMethod;
  modelSelection?: ConcreteLaunchModelSelection;
  launchProfile?: RalphEpicLaunchProfile;
  /** Fresh-eyes reviewer backend for the ai_review phase (default: same as implementer). */
  reviewerAiBackend?: RalphAiBackend;
  /** Model for the reviewer backend (default: the reviewer provider's own default model). */
  reviewerModelSelection?: ConcreteLaunchModelSelection;
}

export interface RalphLaunchDependencies {
  sqlite?: RalphLaunchSqlite;
}
