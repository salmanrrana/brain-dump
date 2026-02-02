/**
 * Settings commands: get, update.
 */

import { getProjectSettings, updateProjectSettings, InvalidActionError } from "../../core/index.ts";
import type { WorkingMethod } from "../../core/index.ts";
import { parseFlags, requireFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["get", "update"];

function detectEnvironment(): string {
  return "cli";
}

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "settings",
      ACTIONS,
      "Flags:\n  --project <id>          Project ID\n  --working-method <m>    auto|claude-code|vscode\n  --pretty                Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "get": {
        const projectId = requireFlag(flags, "project");
        const result = getProjectSettings(db, projectId, detectEnvironment);
        outputResult(result, pretty);
        break;
      }

      case "update": {
        const projectId = requireFlag(flags, "project");
        const workingMethod = requireFlag(flags, "working-method") as WorkingMethod;
        const result = updateProjectSettings(db, projectId, workingMethod, detectEnvironment);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("settings", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
