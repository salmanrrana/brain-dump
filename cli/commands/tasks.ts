/**
 * Claude task management commands: save, get, clear, snapshots.
 */

import { readFileSync } from "fs";
import {
  saveTasks,
  getTasks,
  clearTasks,
  getTaskSnapshots,
  InvalidActionError,
} from "../../core/index.ts";
import type { TaskInput } from "../../core/index.ts";
import { parseFlags, requireFlag, optionalFlag, boolFlag, numericFlag } from "../lib/args.ts";
import { outputResult, outputError, showResourceHelp } from "../lib/output.ts";
import { getDb } from "../lib/db.ts";

const ACTIONS = ["save", "get", "clear", "snapshots"];

export function handle(action: string, args: string[]): void {
  if (!action || action === "--help" || action === "help") {
    showResourceHelp(
      "tasks",
      ACTIONS,
      "Flags:\n  --ticket <id>        Ticket ID\n  --tasks-file <path>  JSON file with tasks array\n  --snapshot           Create audit snapshot\n  --history            Include status history\n  --limit <n>          Max snapshots\n  --pretty             Human-readable output"
    );
  }

  const flags = parseFlags(args);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();

  try {
    switch (action) {
      case "save": {
        const ticketId = optionalFlag(flags, "ticket");
        const tasksFile = requireFlag(flags, "tasks-file");
        const tasksJson = readFileSync(tasksFile, "utf-8");
        const tasks = JSON.parse(tasksJson) as TaskInput[];
        const snapshot = boolFlag(flags, "snapshot");
        const result = saveTasks(db, tasks, ticketId, snapshot);
        outputResult(result, pretty);
        break;
      }

      case "get": {
        const ticketId = optionalFlag(flags, "ticket");
        const result = getTasks(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "clear": {
        const ticketId = optionalFlag(flags, "ticket");
        const result = clearTasks(db, ticketId);
        outputResult(result, pretty);
        break;
      }

      case "snapshots": {
        const ticketId = requireFlag(flags, "ticket");
        const limit = numericFlag(flags, "limit");
        const result = getTaskSnapshots(db, ticketId, limit);
        outputResult(result, pretty);
        break;
      }

      default:
        throw new InvalidActionError("tasks", action, ACTIONS);
    }
  } catch (e) {
    outputError(e);
  }
}
