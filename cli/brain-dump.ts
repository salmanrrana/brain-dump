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
 *   verify       Run AI verification and inspect verification history
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
import { existsSync, readFileSync } from "fs";
import { request } from "http";
import { basename, resolve, join } from "path";
import { outputResult, outputError, showResourceHelp } from "./lib/output.ts";
import {
  getResources,
  getResourceDescription,
  getCommandsForResource,
} from "./lib/command-registry.ts";
import { suggestClosest } from "./lib/suggest.ts";
import { parseFlags, optionalFlag, boolFlag } from "./lib/args.ts";

const RESOURCES = getResources();

/** All valid resource names (excluding _top pseudo-resource). */
const RESOURCE_NAMES = RESOURCES.filter((r) => r !== "_top");

function showHelp(): void {
  const maxLen = Math.max(...RESOURCE_NAMES.map((r) => r.length));
  const resourceLines = RESOURCE_NAMES.map(
    (r) => `  ${r.padEnd(maxLen + 2)}${getResourceDescription(r)}`
  ).join("\n");

  // Generate top-level commands from _top entries in the registry
  const topCommands = getCommandsForResource("_top");
  const topParts = topCommands.map((cmd) => {
    const flagHints = cmd.flags
      .filter((f) => f.name !== "pretty")
      .map((f) =>
        f.required ? `--${f.name} <${f.type === "number" ? "n" : "value"}>` : `[--${f.name}]`
      )
      .join(" ");
    return { left: `  brain-dump ${cmd.action} ${flagHints}`.trimEnd(), desc: cmd.description };
  });
  const maxTop = Math.max(...topParts.map((p) => p.left.length));
  const topLines = topParts.map((p) => `${p.left.padEnd(maxTop + 2)}${p.desc}`).join("\n");

  console.log(`
Brain Dump CLI - Full resource management and database utilities

Usage:
  brain-dump <resource> <action> [--flags]

Resources:
${resourceLines}

Top-level commands:
${topLines}

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

async function handleInit(): Promise<void> {
  const [{ findProjectByPath, createProject }, { getDb }] = await Promise.all([
    import("../core/project.ts"),
    import("./lib/db.ts"),
  ]);
  const initArgs = [action, ...rest].filter(Boolean);
  const flags = parseFlags(initArgs);
  const pretty = boolFlag(flags, "pretty");
  const { db } = getDb();
  const cwd = resolve(process.cwd());

  try {
    // Check if already registered
    const existing = findProjectByPath(db, cwd);
    if (existing) {
      outputResult({ ...existing, alreadyRegistered: true }, pretty);
      return;
    }

    // Resolve name: --name flag → package.json name → directory basename
    let name = optionalFlag(flags, "name");
    if (!name) {
      const pkgPath = join(cwd, "package.json");
      if (existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
          if (pkg.name) name = pkg.name;
        } catch {
          // ignore parse errors, fall through to basename
        }
      }
    }
    if (!name) {
      name = basename(cwd);
    }

    const color = optionalFlag(flags, "color");
    const result = createProject(db, { name, path: cwd, color });
    outputResult(result, pretty);
  } catch (e) {
    outputError(e);
  }
}

async function main(): Promise<void> {
  // Help and typo recovery must work without loading provider launchers or DB code.
  if (
    resource &&
    RESOURCE_NAMES.includes(resource) &&
    (!action || action === "--help" || action === "help")
  ) {
    showResourceHelp(resource);
    return;
  }
  switch (resource) {
    // ── Resource-based routing ──────────────────────────────────
    case "project":
      await (await import("./commands/project.ts")).handle(action, rest);
      break;
    case "ticket":
      await (await import("./commands/ticket.ts")).handle(action, rest);
      break;
    case "epic":
      await (await import("./commands/epic.ts")).handle(action, rest);
      break;
    case "workflow":
      await (await import("./commands/workflow.ts")).handle(action, rest);
      break;
    case "comment":
      await (await import("./commands/comment.ts")).handle(action, rest);
      break;
    case "review":
      await (await import("./commands/review.ts")).handle(action, rest);
      break;
    case "verify":
      await (await import("./commands/verify.ts")).handle(action, rest);
      break;
    case "session":
      await (await import("./commands/session.ts")).handle(action, rest);
      break;
    case "git":
      await (await import("./commands/git.ts")).handle(action, rest);
      break;
    case "telemetry":
      await (await import("./commands/telemetry.ts")).handle(action, rest);
      break;
    case "files":
      await (await import("./commands/files.ts")).handle(action, rest);
      break;
    case "tasks":
      await (await import("./commands/tasks.ts")).handle(action, rest);
      break;
    case "compliance":
      await (await import("./commands/compliance.ts")).handle(action, rest);
      break;
    case "settings":
      await (await import("./commands/settings.ts")).handle(action, rest);
      break;
    case "transfer":
      await (await import("./commands/transfer.ts")).handle(action, rest);
      break;
    case "admin":
      await (await import("./commands/admin.ts")).handle(action, rest);
      break;

    // ── Top-level power commands ─────────────────────────────────
    case "open":
      handleOpen();
      break;
    case "init":
      await handleInit();
      break;
    case "status":
      await (await import("./commands/status.ts")).handle(action, rest);
      break;
    case "search":
      await (await import("./commands/search.ts")).handle(action, rest);
      break;
    case "context":
      await (await import("./commands/context.ts")).handle(action, rest);
      break;
    case "log":
      await (await import("./commands/log.ts")).handle(action, rest);
      break;
    case "completions":
      await (await import("./commands/completions.ts")).handle(action, rest);
      break;

    // ── Backward compatibility (top-level commands) ─────────────
    case "export":
      // brain-dump export --epic <id>  → transfer export-epic
      // brain-dump export --project <id> → transfer export-project
      if (backwardArgs().some((a) => a === "--project")) {
        await (await import("./commands/transfer.ts")).handle("export-project", backwardArgs());
      } else {
        await (await import("./commands/transfer.ts")).handle("export-epic", backwardArgs());
      }
      break;
    case "import":
      await (await import("./commands/transfer.ts")).handle("import", backwardArgs());
      break;
    case "backup":
      await (await import("./commands/admin.ts")).handle("backup", backwardArgs());
      break;
    case "restore":
      await (await import("./commands/admin.ts")).handle("restore", backwardArgs());
      break;
    case "check":
      await (await import("./commands/admin.ts")).handle("check", backwardArgs());
      break;
    case "doctor":
      await (await import("./commands/admin.ts")).handle("doctor", backwardArgs());
      break;

    // ── Help ────────────────────────────────────────────────────
    case "help":
    case "--help":
    case "-h":
    case undefined:
      // brain-dump help <resource> → show resource-specific help
      if (resource === "help" && action && action !== "--help") {
        if (RESOURCE_NAMES.includes(action)) {
          showResourceHelp(action);
        } else {
          const suggestion = suggestClosest(action, RESOURCE_NAMES);
          console.error(`Unknown resource: ${action}`);
          if (suggestion) {
            console.error(`\nDid you mean: ${suggestion}?`);
          }
          console.error(`\nAvailable resources: ${RESOURCE_NAMES.join(", ")}`);
          console.error(`Run 'brain-dump help' for usage information.`);
          process.exit(1);
        }
      } else {
        showHelp();
      }
      break;

    // ── Unknown ─────────────────────────────────────────────────
    default: {
      // Combine all known resource names and top-level command names for suggestions
      const allKnown = [
        ...RESOURCE_NAMES,
        "open",
        "init",
        "status",
        "search",
        "context",
        "log",
        "completions",
        "backup",
        "restore",
        "check",
        "doctor",
        "export",
        "import",
        "help",
      ];
      const suggestion = suggestClosest(resource!, allKnown);
      console.error(`Unknown command: ${resource}`);
      if (suggestion) {
        console.error(`\nDid you mean: ${suggestion}?`);
      }
      console.error(`\nAvailable resources: ${RESOURCE_NAMES.join(", ")}`);
      console.error(`Run 'brain-dump help' for usage information.`);
      process.exit(1);
    }
  }
}

main().catch(outputError);
