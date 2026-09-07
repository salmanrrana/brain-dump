import { listCostModels } from "../../../core/cost.ts";
import { resolveReviewerSelection, type RalphAiBackend } from "../../../core/providers.ts";
import { preflightNativeAiBackend, type RalphReviewerConfig } from "../../api/ralph-script";
import type { ConcreteLaunchModelSelection } from "../launch-model-catalog";
import type { RalphLaunchSqlite, RalphWorkingMethod } from "./types";

interface ReviewerDefaults {
  provider?: string | null | undefined;
  model?: string | null | undefined;
}

interface ResolveLaunchReviewerInput {
  aiBackend: RalphAiBackend;
  reviewerAiBackend?: RalphAiBackend | undefined;
  reviewerModelSelection?: ConcreteLaunchModelSelection | undefined;
  projectDefaults: ReviewerDefaults;
  settingsDefaults: ReviewerDefaults;
  sqlite: RalphLaunchSqlite;
}

export function resolveLaunchReviewer({
  aiBackend,
  reviewerAiBackend,
  reviewerModelSelection,
  projectDefaults,
  settingsDefaults,
  sqlite,
}: ResolveLaunchReviewerInput):
  | { success: true; reviewer?: RalphReviewerConfig | undefined }
  | { success: false; message: string } {
  if (reviewerAiBackend || reviewerModelSelection) {
    return {
      success: true,
      reviewer: {
        aiBackend: reviewerAiBackend ?? aiBackend,
        ...(reviewerModelSelection ? { modelSelection: reviewerModelSelection } : {}),
      },
    };
  }

  const provider = projectDefaults.provider ?? settingsDefaults.provider;
  const model = projectDefaults.model ?? settingsDefaults.model;
  if (!provider) {
    if (model) {
      return {
        success: false,
        message: "Default reviewer model requires a default reviewer provider.",
      };
    }
    return { success: true };
  }

  try {
    const resolved = resolveReviewerSelection(provider, model ?? undefined, listCostModels(sqlite));
    return {
      success: true,
      reviewer: {
        aiBackend: resolved.aiBackend,
        ...(resolved.modelSelection
          ? { modelSelection: { kind: "concrete", ...resolved.modelSelection } }
          : {}),
      },
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Invalid reviewer defaults.",
    };
  }
}

export function validateReviewerLaunchSupport(
  reviewer: RalphReviewerConfig | undefined,
  workingMethod: RalphWorkingMethod,
  launchLabel: string
): { success: true } | { success: false; message: string } {
  if (!reviewer) {
    return { success: true };
  }

  if (workingMethod === "vscode" || workingMethod === "cursor" || workingMethod === "copilot-cli") {
    return {
      success: false,
      message: `Fresh-eyes reviewer launches require a native Ralph backend. ${launchLabel} cannot use ${workingMethod} because that path opens a context file and cannot run the separate reviewer process.`,
    };
  }

  const preflight = preflightNativeAiBackend(reviewer.aiBackend);
  if (!preflight.success) {
    return {
      success: false,
      message: `Fresh-eyes reviewer preflight failed: ${preflight.message}`,
    };
  }

  return { success: true };
}
