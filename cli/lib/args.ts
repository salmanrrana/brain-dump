/**
 * CLI argument parsing helpers.
 *
 * Parses the fixed `<resource> <action> [--flags]` pattern used by all commands.
 * No external dependencies — the grammar is simple enough for hand-rolled parsing.
 */

import { ValidationError } from "../../core/index.ts";

export interface ParsedFlags {
  [key: string]: string | boolean;
}

/**
 * Parse `--flag value` and `--bool-flag` pairs from an argv-style array.
 *
 * Rules:
 * - `--flag value` → { flag: "value" }
 * - `--flag=value` → { flag: "value" }
 * - `--bool-flag` (no value or next arg is another flag) → { "bool-flag": true }
 * - Positional args are ignored (consumed by the router before this runs).
 */
export function parseFlags(args: string[]): ParsedFlags {
  const flags: ParsedFlags = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) continue;

    const eqIdx = arg.indexOf("=");
    if (eqIdx !== -1) {
      const key = arg.slice(2, eqIdx);
      flags[key] = arg.slice(eqIdx + 1);
      continue;
    }

    const key = arg.slice(2);
    const next = args[i + 1];

    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++; // skip value
    }
  }

  return flags;
}

/**
 * Get a required string flag or throw with a usage hint.
 */
export function requireFlag(flags: ParsedFlags, name: string): string {
  const val = flags[name];
  if (typeof val !== "string") {
    throw new ValidationError(`Missing required flag: --${name}`);
  }
  return val;
}

/**
 * Get an optional string flag. Returns undefined if missing or boolean.
 */
export function optionalFlag(flags: ParsedFlags, name: string): string | undefined {
  const val = flags[name];
  if (typeof val !== "string") return undefined;
  return val;
}

/**
 * Get a boolean flag. `--flag` → true, absent → false.
 */
export function boolFlag(flags: ParsedFlags, name: string): boolean {
  return flags[name] === true;
}

/**
 * Get a numeric flag, parsed as integer.
 */
export function numericFlag(flags: ParsedFlags, name: string): number | undefined {
  const val = optionalFlag(flags, name);
  if (val === undefined) return undefined;
  const n = parseInt(val, 10);
  if (isNaN(n)) {
    throw new ValidationError(`Flag --${name} must be a number, got: ${val}`);
  }
  return n;
}
