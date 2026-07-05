/**
 * Workflow commands: start-work, complete-work, start-epic, launch-ticket, launch-epic.
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  startWork,
  completeWork,
  startEpicWork,
  createRealGitOperations,
  InvalidActionError,
  listCostModels,
} from "../../core/index.ts";
import * as schema from "../../src/lib/schema.ts";
import { launchRalphForTicketCore } from "../../src/lib/ralph-launch/launch-ticket.ts";
import { launchRalphForEpicCore } from "../../src/lib/ralph-launch/launch-epic.ts";
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

const ACTIONS = ["start-work", "complete-work", "start-epic", "launch-ticket", "launch-epic"];

interface SharedLaunchFlags {
  provider: LaunchProvider | undefined;
  preferredTerminal: string | undefined;
  maxIterations: number | undefined;
  useSandbox: boolean;
  modelSelection: LaunchTicketInput["modelSelection"];
}

function parseSharedLaunchFlags(
  flags: ParsedFlags,
  costModels: ReturnType<typeof listCostModels>
): SharedLaunchFlags {
  const provider = parseProviderFlag(optionalFlag(flags, "provider"));
  return {
    provider,
    preferredTerminal: optionalFlag(flags, "terminal"),
    maxIterations: numericFlag(flags, "max-iterations"),
    useSandbox: boolFlag(flags, "sandbox"),
    modelSelection: parseModelFlag(provider, optionalFlag(flags, "model"), costModels),
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
      case "start-work": {
        const ticketId = requireFlag(flags, "ticket");
        const result = startWork(sqlite, ticketId, git);
        outputResult(result, pretty);
        break;
      }

      case "complete-work": {
        const ticketId = requireFlag(flags, "ticket");
        const summary = optionalFlag(flags, "summary");
        const result = completeWork(sqlite, ticketId, git, summary);
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
