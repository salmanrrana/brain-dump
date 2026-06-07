import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const RALPH_GITIGNORE_HEADER = "# Brain Dump Ralph artifacts";

export const RALPH_ARTIFACT_IGNORE_PATTERNS = [
  "plans/prd.json",
  "plans/progress.txt",
  "plans/archives/",
  "plans/review-runs/",
  "plans/ralph*.sh",
  ".claude/ralph-context.md",
  ".claude/review-runs/",
  ".ralph-prompt.md",
  ".ralph-services.json",
] as const;

export interface EnsureRalphArtifactsIgnoredResult {
  gitignorePath: string;
  addedPatterns: string[];
}

export function ensureRalphArtifactsIgnored(
  projectPath: string
): EnsureRalphArtifactsIgnoredResult {
  const gitignorePath = join(projectPath, ".gitignore");
  const existingContent = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
  const existingPatterns = new Set(
    existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const missingPatterns = RALPH_ARTIFACT_IGNORE_PATTERNS.filter(
    (pattern) => !isPatternCovered(pattern, existingPatterns)
  );

  if (missingPatterns.length === 0) {
    return { gitignorePath, addedPatterns: [] };
  }

  writeFileSync(gitignorePath, appendGitignoreBlock(existingContent, missingPatterns), "utf-8");

  return { gitignorePath, addedPatterns: [...missingPatterns] };
}

function isPatternCovered(pattern: string, existingPatterns: Set<string>): boolean {
  if (existingPatterns.has(pattern)) {
    return true;
  }

  if (pattern.startsWith("plans/")) {
    return (
      existingPatterns.has("plans/") ||
      existingPatterns.has("/plans/") ||
      existingPatterns.has("plans/**")
    );
  }

  if (pattern.startsWith(".claude/")) {
    return existingPatterns.has(".claude/") || existingPatterns.has(".claude/**");
  }

  return false;
}

function appendGitignoreBlock(existingContent: string, patterns: readonly string[]): string {
  const separator =
    existingContent.length === 0 ? "" : existingContent.endsWith("\n") ? "\n" : "\n\n";

  return `${existingContent}${separator}${RALPH_GITIGNORE_HEADER}\n${patterns.join("\n")}\n`;
}
