/**
 * CLI output formatting.
 *
 * JSON by default (for piping to other tools / AI consumers),
 * `--pretty` for human-readable tables and formatted output.
 */

import { CoreError } from "../../core/index.ts";
import { getCommandsForResource, getResourceDescription } from "./command-registry.ts";
import { suggestClosest } from "./suggest.ts";

/**
 * Write a successful result to stdout.
 * JSON by default; `pretty` shows human-readable formatting.
 */
export function outputResult(data: unknown, pretty: boolean): void {
  if (pretty) {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log("No results.");
        return;
      }
      console.log(formatTable(data));
    } else if (data !== null && typeof data === "object") {
      console.log(formatObject(data as Record<string, unknown>));
    } else {
      console.log(String(data));
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * Write an error to stderr and exit with code 1.
 * For INVALID_ACTION errors, appends a "did you mean?" suggestion.
 */
export function outputError(error: unknown): never {
  if (error instanceof CoreError) {
    const obj: Record<string, unknown> = {
      error: error.code,
      message: error.message,
    };
    if (error.details) obj.details = error.details;

    // Add "did you mean?" for invalid action errors
    if (error.code === "INVALID_ACTION" && error.details) {
      const { action, validActions } = error.details as {
        action?: string;
        validActions?: string[];
      };
      if (action && Array.isArray(validActions)) {
        const suggestion = suggestClosest(action, validActions);
        if (suggestion) {
          obj.suggestion = suggestion;
          obj.message = `${error.message}\n\nDid you mean: ${suggestion}?`;
        }
      }
    }

    console.error(JSON.stringify(obj, null, 2));
  } else if (error instanceof Error) {
    console.error(JSON.stringify({ error: "UNKNOWN_ERROR", message: error.message }, null, 2));
  } else {
    console.error(JSON.stringify({ error: "UNKNOWN_ERROR", message: String(error) }, null, 2));
  }
  process.exit(1);
}

/**
 * Format an array of objects as a simple table.
 * Picks the most useful columns automatically based on the first row.
 */
export function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "No results.";

  const first = rows[0]!;
  const keys = Object.keys(first).filter((k) => {
    const v = first[k];
    // Skip deeply nested objects and arrays for table display
    return v === null || typeof v !== "object" || Array.isArray(v);
  });

  // Calculate column widths
  const widths: Record<string, number> = {};
  for (const key of keys) {
    widths[key] = key.length;
    for (const row of rows) {
      const val = formatCell(row[key]);
      widths[key] = Math.max(widths[key] ?? 0, val.length);
    }
  }

  // Cap column widths at 50 chars
  for (const key of keys) {
    widths[key] = Math.min(widths[key] ?? 0, 50);
  }

  // Build header
  const header = keys.map((k) => k.padEnd(widths[k] ?? 0)).join("  ");
  const separator = keys.map((k) => "-".repeat(widths[k] ?? 0)).join("  ");

  // Build rows
  const lines = rows.map((row) =>
    keys
      .map((k) =>
        formatCell(row[k])
          .padEnd(widths[k] ?? 0)
          .slice(0, widths[k])
      )
      .join("  ")
  );

  return [header, separator, ...lines].join("\n");
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/**
 * Format a single object for human-readable display.
 */
export function formatObject(obj: Record<string, unknown>, indent = 0): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${pad}${key}:`);
      lines.push(formatObject(value as Record<string, unknown>, indent + 2));
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (typeof value[0] === "object" && value[0] !== null) {
        lines.push(`${pad}${key}:`);
        for (const item of value) {
          lines.push(formatObject(item as Record<string, unknown>, indent + 2));
          lines.push("");
        }
      } else {
        lines.push(`${pad}${key}: ${value.join(", ")}`);
      }
    } else {
      lines.push(`${pad}${key}: ${value}`);
    }
  }

  return lines.join("\n");
}

/**
 * Print help text for a resource using command registry metadata and exit.
 */
export function showResourceHelp(resource: string): never {
  const commands = getCommandsForResource(resource);
  const desc = getResourceDescription(resource);

  console.log(`\nbrain-dump ${resource} <action> [flags]`);
  if (desc) console.log(`  ${desc}`);
  console.log("");

  if (commands.length === 0) {
    console.log("No actions registered for this resource.");
    process.exit(0);
  }

  // Actions with descriptions
  const maxAction = Math.max(...commands.map((c) => c.action.length));
  console.log("Actions:");
  for (const cmd of commands) {
    console.log(`  ${cmd.action.padEnd(maxAction + 2)}${cmd.description}`);
  }

  // Collect all unique flags across actions
  const flagMap = new Map<
    string,
    { type: string; required: boolean; description: string; enumValues?: string[] }
  >();
  for (const cmd of commands) {
    for (const flag of cmd.flags) {
      if (!flagMap.has(flag.name)) {
        flagMap.set(flag.name, {
          type: flag.type,
          required: flag.required,
          description: flag.description,
          ...(flag.enum ? { enumValues: flag.enum } : {}),
        });
      }
    }
  }

  if (flagMap.size > 0) {
    console.log("\nFlags:");
    const maxFlag = Math.max(...[...flagMap.keys()].map((f) => f.length));
    for (const [name, info] of flagMap) {
      const typeHint =
        info.type === "boolean"
          ? ""
          : info.enumValues
            ? ` <${info.enumValues.join("|")}>`
            : ` <${info.type === "number" ? "n" : "value"}>`;
      const pad = `--${name}${typeHint}`.length;
      const maxPad = maxFlag + 12; // room for -- prefix and type hint
      console.log(
        `  ${"--" + name + typeHint}${" ".repeat(Math.max(1, maxPad - pad))}${info.description}`
      );
    }
  }

  // Examples
  const examples = commands.flatMap((c) => c.examples ?? []);
  if (examples.length > 0) {
    console.log("\nExamples:");
    for (const ex of examples.slice(0, 5)) {
      console.log(`  ${ex}`);
    }
  }

  process.exit(0);
}

/**
 * Print "did you mean?" suggestion for an unknown action within a resource.
 */
export function suggestAction(resource: string, unknownAction: string): string | undefined {
  const commands = getCommandsForResource(resource);
  const validActions = commands.map((c) => c.action);
  // Also include aliases
  for (const cmd of commands) {
    if (cmd.aliases) {
      validActions.push(...cmd.aliases);
    }
  }
  return suggestClosest(unknownAction, validActions);
}
