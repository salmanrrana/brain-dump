export interface CodexAppLaunchPlan {
  projectCommands: string[];
  contextCommands: string[];
}

function escapeForBashDoubleQuote(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/!/g, "\\!");
}

/**
 * Build platform-specific commands for launching Codex App with project + context.
 * We keep project and context commands separate so callers can:
 * 1) fail hard if project launch fails
 * 2) warn (not fail) if context file opening fails
 */
export function buildCodexAppLaunchPlan(
  projectPath: string,
  contextFilePath: string,
  platform: NodeJS.Platform = process.platform
): CodexAppLaunchPlan {
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeContextFilePath = escapeForBashDoubleQuote(contextFilePath);

  if (platform === "darwin") {
    return {
      projectCommands: [
        `open -a "Codex" "${safeProjectPath}"`,
        `open -a "Codex.app" "${safeProjectPath}"`,
      ],
      contextCommands: [
        `open -a "Codex" "${safeContextFilePath}"`,
        `open -a "Codex.app" "${safeContextFilePath}"`,
      ],
    };
  }

  // Non-macOS fallback: if Codex CLI is present, this still opens project context.
  return {
    projectCommands: [`codex "${safeProjectPath}"`],
    contextCommands: [`codex "${safeContextFilePath}"`],
  };
}
