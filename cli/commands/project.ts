/**
 * Project commands: list, find, create, delete.
 */

import {
  listProjects,
  findProjectByPath,
  createProject,
  deleteProject,
  InvalidActionError,
} from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["list", "find", "create", "delete"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "project",
      ACTIONS,
      "Flags:\n  --project <id>   Project ID (for delete)\n  --name <text>    Project name\n  --path <path>    Filesystem path\n  --color <hex>    Color (e.g. #3b82f6)\n  --confirm        Confirm destructive action\n  --pretty         Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "list": {
        const result = listProjects(db);
        outputResult(result, pretty);
        break;
      }

      case "find": {
        const path = requireFlag(flags, "path");
        const result = findProjectByPath(db, path);
        if (result) {
          outputResult(result, pretty);
        } else {
          outputResult({ found: false, message: `No project found for path: ${path}` }, pretty);
        }
        break;
      }

      case "create": {
        const name = requireFlag(flags, "name");
        const path = requireFlag(flags, "path");
        const color = optionalFlag(flags, "color");
        const result = createProject(db, { name, path, color });
        outputResult(result, pretty);
        break;
      }

      case "delete": {
        const projectId = requireFlag(flags, "project");
        const confirmed = boolFlag(flags, "confirm");
        const result = deleteProject(db, projectId, confirmed);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("project", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
