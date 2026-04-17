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
} from "../../core/index.ts";
import * as schema from "../../src/lib/schema.ts";
import { launchRalphForTicketCore } from "../../src/lib/ralph-launch/launch-ticket.ts";
import { launchRalphForEpicCore } from "../../src/lib/ralph-launch/launch-epic.ts";
import type { LaunchEpicInput, LaunchTicketInput } from "../../src/lib/ralph-launch/types.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";
import { parseProviderFlag, translateProvider } from "../lib/provider-translation.ts";

const ACTIONS = ["start-work", "complete-work", "start-epic", "launch-ticket", "launch-epic"];

export function handle(action: string, args: string[]): void {
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
        const provider = parseProviderFlag(optionalFlag(flags, "provider"));
        const input: LaunchTicketInput = {
          ticketId,
          ...(provider ? translateProvider(provider) : {}),
        };
        const preferredTerminal = optionalFlag(flags, "terminal");
        if (preferredTerminal !== undefined) input.preferredTerminal = preferredTerminal;
        const maxIterations = numericFlag(flags, "max-iterations");
        if (maxIterations !== undefined) input.maxIterations = maxIterations;
        if (boolFlag(flags, "sandbox")) input.useSandbox = true;

        const drizzleDb = drizzle(sqlite, { schema });
        void launchRalphForTicketCore(drizzleDb, input, { sqlite })
          .then((result) => {
            outputResult({ ...result, provider: provider ?? null }, pretty);
            if (!result.success) process.exit(1);
          })
          .catch(outputError);
        break;
      }

      case "launch-epic": {
        const epicId = requireFlag(flags, "epic");
        const provider = parseProviderFlag(optionalFlag(flags, "provider"));
        const input: LaunchEpicInput = {
          epicId,
          ...(provider ? translateProvider(provider) : {}),
        };
        const preferredTerminal = optionalFlag(flags, "terminal");
        if (preferredTerminal !== undefined) input.preferredTerminal = preferredTerminal;
        const maxIterations = numericFlag(flags, "max-iterations");
        if (maxIterations !== undefined) input.maxIterations = maxIterations;
        if (boolFlag(flags, "sandbox")) input.useSandbox = true;

        const drizzleDb = drizzle(sqlite, { schema });
        void launchRalphForEpicCore(drizzleDb, input, { sqlite })
          .then((result) => {
            outputResult({ ...result, provider: provider ?? null }, pretty);
            if (!result.success) process.exit(1);
          })
          .catch(outputError);
        break;
      }

      default:
        throw new InvalidActionError("workflow", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
