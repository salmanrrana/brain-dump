import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the Brain Dump repo root from a module URL by probing for the CLI
 * entrypoint. Walk ancestors so source adapters, bundled MCP, and nested
 * production server chunks all resolve the same worker entrypoint.
 */
export function resolveBrainDumpRootFrom(moduleUrl: string): string | null {
  let candidate: string;
  try {
    candidate = dirname(fileURLToPath(moduleUrl));
  } catch {
    return null;
  }
  while (true) {
    if (existsSync(join(candidate, "cli", "brain-dump.ts"))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}
