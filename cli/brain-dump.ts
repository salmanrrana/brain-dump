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
 *   transfer     Export and import .braindump archives
 *   admin        Backup, restore, check, doctor, health
 *
 * Backward-compatible shortcuts:
 *   brain-dump backup [--list]       → admin backup
 *   brain-dump restore [--latest]    → admin restore
 *   brain-dump check [--full]        → admin check
 *   brain-dump doctor                → admin doctor
 *   brain-dump export --epic <id>    → transfer export-epic
 *   brain-dump import --file <path>  → transfer import
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

import { execFile } from "child_process";
import { request } from "http";
import * as admin from "./commands/admin.ts";
import * as project from "./commands/project.ts";
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
import * as transfer from "./commands/transfer.ts";
import { outputError } from "./lib/output.ts";
import { getResources, getResourceDescription } from "./lib/command-registry.ts";

const RESOURCES = getResources();

function showHelp(): void {
  const maxLen = Math.max(...RESOURCES.map((r) => r.length));
  const resourceLines = RESOURCES.map(
    (r) => `  ${r.padEnd(maxLen + 2)}${getResourceDescription(r)}`
  ).join("\n");

  console.log(`
Brain Dump CLI - Full resource management and database utilities

Usage:
  brain-dump <resource> <action> [--flags]

Resources:
${resourceLines}

Backward-compatible shortcuts:
  brain-dump backup [--list]       Same as: brain-dump admin backup [--list]
  brain-dump restore [--latest]    Same as: brain-dump admin restore [--latest]
  brain-dump check [--full]        Same as: brain-dump admin check [--full]
  brain-dump doctor                Same as: brain-dump admin doctor
  brain-dump export --epic <id>    Same as: brain-dump transfer export-epic --epic <id>
  brain-dump import --file <path>  Same as: brain-dump transfer import --file <path>

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
  try {
    handler(a, r);
  } catch (e) {
    outputError(e);
  }
}

function runAsync(
  handler: (action: string, args: string[]) => Promise<void>,
  a: string,
  r: string[]
): void {
  handler(a, r).catch((error: unknown) => {
    outputError(error);
  });
}

// Combine action and rest for backward compat (top-level commands pass action as first flag/arg)
function backwardArgs(): string[] {
  return action ? [action, ...rest] : rest;
}

function handleOpen(): void {
  const openArgs = [action, ...rest];
  const portFlag = openArgs.find((_, i) => openArgs[i - 1] === "--port");
  const port = portFlag ? parseInt(portFlag, 10) : 4242;
  const url = `http://localhost:${port}/`;

  // Health check before opening
  const healthReq = request(url, { method: "HEAD", timeout: 2000 }, (res) => {
    if (res.statusCode && res.statusCode < 500) {
      openBrowser(url);
    } else {
      console.error(`Server responded with status ${res.statusCode}.`);
      process.exit(1);
    }
  });
  healthReq.on("error", () => {
    console.error(`Dev server not running at ${url}. Start it with: pnpm dev`);
    process.exit(1);
  });
  healthReq.end();
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const cmdArgs = platform === "win32" ? ["/c", "start", url] : [url];

  execFile(cmd, cmdArgs, (err) => {
    if (err) {
      console.error(`Failed to open browser: ${err.message}`);
      console.error(`Open manually: ${url}`);
    }
  });
}

switch (resource) {
  // ── Resource-based routing ──────────────────────────────────
  case "project":
    runSync(project.handle, action, rest);
    break;
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
  case "transfer":
    runAsync(transfer.handle, action, rest);
    break;
  case "admin":
    runAsync(admin.handle, action, rest);
    break;

  // ── Top-level power commands ─────────────────────────────────
  case "open":
    handleOpen();
    break;

  // ── Backward compatibility (top-level commands) ─────────────
  case "export":
    // brain-dump export --epic <id>  → transfer export-epic
    // brain-dump export --project <id> → transfer export-project
    if (backwardArgs().some((a) => a === "--project")) {
      runAsync(transfer.handle, "export-project", backwardArgs());
    } else {
      runAsync(transfer.handle, "export-epic", backwardArgs());
    }
    break;
  case "import":
    runAsync(transfer.handle, "import", backwardArgs());
    break;
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
