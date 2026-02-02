#!/usr/bin/env npx tsx

/**
 * Brain Dump CLI - Full resource management and database utilities.
 *
 * Usage:
 *   brain-dump <resource> <action> [--flags]
 *
 * Resources:
 *   ticket       Create, list, get, update, delete tickets
 *   epic         Create, list, update, delete epics
 *   workflow     Start work, complete work, start epic
 *   comment      Add and list ticket comments
 *   review       Submit findings, generate demos, manage reviews
 *   session      Create, update, complete Ralph sessions
 *   git          Link commits, PRs, sync ticket links
 *   telemetry    Start, end, get, list telemetry sessions
 *   files        Link files to tickets, find tickets by file
 *   tasks        Save, get, clear Claude task lists
 *   compliance   Conversation logging for compliance auditing
 *   settings     Get and update project settings
 *   admin        Backup, restore, check, doctor, health
 *
 * Backward-compatible shortcuts:
 *   brain-dump backup [--list]       → admin backup
 *   brain-dump restore [--latest]    → admin restore
 *   brain-dump check [--full]        → admin check
 *   brain-dump doctor                → admin doctor
 *
 * Flags:
 *   --pretty     Human-readable output (default: JSON)
 *   --help       Show help for any resource
 *
 * Examples:
 *   brain-dump ticket list --pretty
 *   brain-dump ticket create --project abc --title "Fix bug"
 *   brain-dump workflow start-work --ticket def
 *   brain-dump admin backup --list
 *   brain-dump backup --list          (backward compat)
 */

import * as admin from "./commands/admin.ts";
import * as ticket from "./commands/ticket.ts";
import * as epic from "./commands/epic.ts";
import * as workflow from "./commands/workflow.ts";
import * as comment from "./commands/comment.ts";
import * as review from "./commands/review.ts";
import * as session from "./commands/session.ts";
import * as git from "./commands/git.ts";
import * as telemetry from "./commands/telemetry.ts";
import * as files from "./commands/files.ts";
import * as tasks from "./commands/tasks.ts";
import * as compliance from "./commands/compliance.ts";
import * as settings from "./commands/settings.ts";

const RESOURCES = [
  "ticket",
  "epic",
  "workflow",
  "comment",
  "review",
  "session",
  "git",
  "telemetry",
  "files",
  "tasks",
  "compliance",
  "settings",
  "admin",
];

function showHelp(): void {
  console.log(`
Brain Dump CLI - Full resource management and database utilities

Usage:
  brain-dump <resource> <action> [--flags]

Resources:
  ticket       Create, list, get, update, delete tickets
  epic         Create, list, update, delete epics
  workflow     Start work, complete work, start epic
  comment      Add and list ticket comments
  review       Submit findings, generate demos, manage reviews
  session      Create, update, complete Ralph sessions
  git          Link commits, PRs, sync ticket links
  telemetry    Start, end, get, list telemetry sessions
  files        Link files to tickets, find tickets by file
  tasks        Save, get, clear Claude task lists
  compliance   Conversation logging for compliance auditing
  settings     Get and update project settings
  admin        Backup, restore, check, doctor, health

Backward-compatible shortcuts:
  brain-dump backup [--list]       Same as: brain-dump admin backup [--list]
  brain-dump restore [--latest]    Same as: brain-dump admin restore [--latest]
  brain-dump check [--full]        Same as: brain-dump admin check [--full]
  brain-dump doctor                Same as: brain-dump admin doctor

Flags:
  --pretty     Human-readable output (default: JSON)
  --help       Show help for any resource

Examples:
  brain-dump ticket list --pretty
  brain-dump ticket create --project abc --title "Fix bug"
  brain-dump workflow start-work --ticket def
  brain-dump admin backup --list
  brain-dump backup --list
`);
}

// Main CLI logic
const args = process.argv.slice(2);
const resource = args[0];
const action = args[1] ?? "";
const rest = args.slice(2);

function runSync(handler: (action: string, args: string[]) => void, a: string, r: string[]): void {
  handler(a, r);
}

function runAsync(
  handler: (action: string, args: string[]) => Promise<void>,
  a: string,
  r: string[]
): void {
  handler(a, r).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  });
}

// Combine action and rest for backward compat (top-level commands pass action as first flag/arg)
function backwardArgs(): string[] {
  return action ? [action, ...rest] : rest;
}

switch (resource) {
  // ── Resource-based routing ──────────────────────────────────
  case "ticket":
    runSync(ticket.handle, action, rest);
    break;
  case "epic":
    runSync(epic.handle, action, rest);
    break;
  case "workflow":
    runSync(workflow.handle, action, rest);
    break;
  case "comment":
    runSync(comment.handle, action, rest);
    break;
  case "review":
    runSync(review.handle, action, rest);
    break;
  case "session":
    runSync(session.handle, action, rest);
    break;
  case "git":
    runSync(git.handle, action, rest);
    break;
  case "telemetry":
    runSync(telemetry.handle, action, rest);
    break;
  case "files":
    runSync(files.handle, action, rest);
    break;
  case "tasks":
    runSync(tasks.handle, action, rest);
    break;
  case "compliance":
    runSync(compliance.handle, action, rest);
    break;
  case "settings":
    runSync(settings.handle, action, rest);
    break;
  case "admin":
    runAsync(admin.handle, action, rest);
    break;

  // ── Backward compatibility (top-level admin commands) ───────
  case "backup":
    runAsync(admin.handle, "backup", backwardArgs());
    break;
  case "restore":
    runAsync(admin.handle, "restore", backwardArgs());
    break;
  case "check":
    runAsync(admin.handle, "check", backwardArgs());
    break;
  case "doctor":
    runAsync(admin.handle, "doctor", []);
    break;

  // ── Help ────────────────────────────────────────────────────
  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;

  // ── Unknown ─────────────────────────────────────────────────
  default:
    console.error(`Unknown resource: ${resource}`);
    console.error(`Available resources: ${RESOURCES.join(", ")}`);
    console.error(`\nRun 'brain-dump help' for usage information.`);
    process.exit(1);
}
