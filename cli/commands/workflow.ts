/**
 * Workflow commands: start-work, complete-work, start-epic, launch-ticket, launch-epic.
 */

import { startWork, completeWork, startEpicWork } from "../../core/workflow.ts";
import { createRealGitOperations } from "../../core/git-utils.ts";
import { InvalidActionError, ValidationError } from "../../core/errors.ts";
import { listCostModels } from "../../core/cost.ts";
import { resolveCommentAuthor } from "../../core/comment.ts";
import { resolveReviewerSelection } from "../../core/providers.ts";
import { runEpicScript } from "../../core/epic-runner.ts";
import type { LaunchEpicInput, LaunchTicketInput } from "../../src/lib/ralph-launch/types.ts";
import {
  parseFlags,
  requireFlag,
  optionalFlag,
  boolFlag,
  numericFlag,
  type ParsedFlags,
} from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import {
  type LaunchProvider,
  parseProviderFlag,
  parseModelFlag,
  translateProvider,
} from "../lib/provider-translation.ts";

const ACTIONS = [
  "start-work",
  "complete-work",
  "start-epic",
  "launch-ticket",
  "launch-epic",
  "run-epic-script",
];

interface SharedLaunchFlags {
  provider: LaunchProvider | undefined;
  preferredTerminal: string | undefined;
  maxIterations: number | undefined;
  useSandbox: boolean;
  modelSelection: LaunchTicketInput["modelSelection"];
  reviewerAiBackend: LaunchTicketInput["reviewerAiBackend"];
  reviewerModelSelection: LaunchTicketInput["reviewerModelSelection"];
}

function parseSharedLaunchFlags(
  flags: ParsedFlags,
  costModels: ReturnType<typeof listCostModels>
): SharedLaunchFlags {
  const provider = parseProviderFlag(optionalFlag(flags, "provider"));
  const reviewerProvider = optionalFlag(flags, "review-provider");
  const reviewerModel = optionalFlag(flags, "review-model");
  if (reviewerModel !== undefined && reviewerProvider === undefined) {
    throw new ValidationError(
      "--review-model requires --review-provider so Brain Dump can validate reviewer-specific model ids."
    );
  }
  const reviewer = reviewerProvider
    ? resolveReviewerSelection(reviewerProvider, reviewerModel, costModels)
    : undefined;
  return {
    provider,
    preferredTerminal: optionalFlag(flags, "terminal"),
    maxIterations: numericFlag(flags, "max-iterations"),
    useSandbox: boolFlag(flags, "sandbox"),
    modelSelection: parseModelFlag(provider, optionalFlag(flags, "model"), costModels),
    reviewerAiBackend: reviewer?.aiBackend,
    reviewerModelSelection: reviewer?.modelSelection
      ? { kind: "concrete", ...reviewer.modelSelection }
      : undefined,
  };
}

function applySharedLaunchFlags<T extends LaunchTicketInput | LaunchEpicInput>(
  input: T,
  shared: SharedLaunchFlags
): T {
  if (shared.provider) Object.assign(input, translateProvider(shared.provider));
  if (shared.preferredTerminal !== undefined) input.preferredTerminal = shared.preferredTerminal;
  if (shared.maxIterations !== undefined) input.maxIterations = shared.maxIterations;
  if (shared.useSandbox) input.useSandbox = true;
  if (shared.modelSelection) input.modelSelection = shared.modelSelection;
  if (shared.reviewerAiBackend) input.reviewerAiBackend = shared.reviewerAiBackend;
  if (shared.reviewerModelSelection) input.reviewerModelSelection = shared.reviewerModelSelection;
  return input;
}

export async function handle(action: string, args: string[]): Promise<void> {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp("workflow");
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db: sqlite } = getDb();
  const git = createRealGitOperations();

  try {
    switch (action) {
      case "run-epic-script": {
        const maxIterations = numericFlag(flags, "max-iterations") ?? 12;
        const timeoutSeconds = numericFlag(flags, "timeout") ?? 3600;
        if (
          ![maxIterations, timeoutSeconds].every(
            (value) => Number.isSafeInteger(value) && value > 0
          )
        )
          throw new ValidationError("Iteration and timeout values must be positive integers.");
        const exitCode = await runEpicScript(sqlite, {
          epicId: requireFlag(flags, "epic"),
          scriptPath: requireFlag(flags, "script"),
          maxIterations,
          timeoutSeconds,
          useSandbox: boolFlag(flags, "sandbox"),
          ...(optionalFlag(flags, "docker-host")
            ? { dockerHost: optionalFlag(flags, "docker-host")! }
            : {}),
          ...(optionalFlag(flags, "resume-ticket")
            ? { resumeTicketId: optionalFlag(flags, "resume-ticket")! }
            : {}),
        });
        process.exitCode = exitCode;
        break;
      }
      case "start-work": {
        const ticketId = requireFlag(flags, "ticket");
        const result = startWork(sqlite, ticketId, git);
        outputResult(result, pretty);
        break;
      }

      case "complete-work": {
        const ticketId = requireFlag(flags, "ticket");
        const summary = optionalFlag(flags, "summary");
        const author = resolveCommentAuthor(
          process.env.BRAIN_DUMP_PROVIDER ?? "",
          process.env.RALPH_SESSION === "1"
        );
        const result = completeWork(sqlite, ticketId, git, summary, {
          author,
          env: process.env,
        });
        outputResult(result, pretty);
        break;
      }

      case "start-epic": {
        const epicId = requireFlag(flags, "epic");
        const result = startEpicWork(sqlite, epicId, git);
        outputResult(result, pretty);
        break;
      }

      case "launch-ticket": {
        const ticketId = requireFlag(flags, "ticket");
        const shared = parseSharedLaunchFlags(flags, listCostModels(sqlite));
        const input = applySharedLaunchFlags<LaunchTicketInput>({ ticketId }, shared);
        const [{ drizzle }, schema, { launchRalphForTicketCore }] = await Promise.all([
          import("drizzle-orm/better-sqlite3"),
          import("../../src/lib/schema.ts"),
          import("../../src/lib/ralph-launch/launch-ticket.ts"),
        ]);
        const drizzleDb = drizzle(sqlite, { schema });
        const result = await launchRalphForTicketCore(drizzleDb, input, { sqlite });
        outputResult({ ...result, provider: shared.provider ?? null }, pretty);
        if (!result.success) process.exit(1);
        break;
      }

      case "launch-epic": {
        const epicId = requireFlag(flags, "epic");
        const shared = parseSharedLaunchFlags(flags, listCostModels(sqlite));
        const input = applySharedLaunchFlags<LaunchEpicInput>({ epicId }, shared);
        const [{ drizzle }, schema, { launchRalphForEpicCore }] = await Promise.all([
          import("drizzle-orm/better-sqlite3"),
          import("../../src/lib/schema.ts"),
          import("../../src/lib/ralph-launch/launch-epic.ts"),
        ]);
        const drizzleDb = drizzle(sqlite, { schema });
        const result = await launchRalphForEpicCore(drizzleDb, input, { sqlite });
        outputResult({ ...result, provider: shared.provider ?? null }, pretty);
        if (!result.success) process.exit(1);
        break;
      }

      default:
        throw new InvalidActionError("workflow", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
