import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { tickets } from "../lib/schema";
import { eq } from "drizzle-orm";
import {
  detectTerminal,
  isTerminalAvailable,
  buildTerminalCommand,
} from "./terminal-utils";

interface LaunchClaudeResult {
  success: boolean;
  method: "terminal" | "clipboard";
  message: string;
  terminalUsed?: string;
  warnings?: string[];
}

// Clean up old launch scripts (older than 5 minutes)
// Exported so it can be called on app startup
export async function cleanupOldScripts(): Promise<void> {
  try {
    const { readdirSync, statSync, unlinkSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const scriptDir = join(homedir(), ".brain-dump", "scripts");

    if (!existsSync(scriptDir)) {
      return; // Nothing to clean up
    }

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const files = readdirSync(scriptDir);
    let cleanedCount = 0;

    for (const file of files) {
      if (file.startsWith("launch-") && file.endsWith(".sh")) {
        const filePath = join(scriptDir, file);
        try {
          const stats = statSync(filePath);
          if (stats.mtimeMs < fiveMinutesAgo) {
            unlinkSync(filePath);
            cleanedCount++;
          }
        } catch {
          // Ignore individual file errors
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`[brain-dump] Cleaned up ${cleanedCount} old launch script(s)`);
    }
  } catch (error) {
    console.error("[brain-dump] Script cleanup error:", error);
  }
}

// Escape a string for safe use in bash double-quoted strings
function escapeForBashDoubleQuote(str: string): string {
  // In double quotes, escape: \ $ ` " ! (and newlines)
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/!/g, "\\!");
}

// Validate project path doesn't contain dangerous characters
function validateProjectPath(path: string): void {
  if (path.includes("\0")) {
    throw new Error("Invalid project path: contains null bytes");
  }
  // Check for shell metacharacters that could be dangerous
  if (/[;&|<>]/.test(path)) {
    throw new Error("Invalid project path: contains shell metacharacters");
  }
}

// Create a temp script to launch Claude - avoids complex escaping issues
async function createLaunchScript(projectPath: string, context: string): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  // Validate project path
  validateProjectPath(projectPath);

  // Clean up old scripts first
  await cleanupOldScripts();

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const scriptPath = join(scriptDir, `launch-${randomUUID()}.sh`);

  // Extract ticket title from context (first line after "# Task: ")
  const titleMatch = context.match(/^# Task: (.+)$/m);
  const ticketTitle = titleMatch?.[1] ?? "Unknown Task";

  // Safely escape all user-provided content
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeTicketTitle = escapeForBashDoubleQuote(ticketTitle);

  // Create a script that:
  // 1. Changes to the project directory
  // 2. Saves context to a file in the project (so Claude has read permission)
  // 3. Shows brief visual confirmation
  // 4. Launches Claude with the prompt, showing all output normally
  // 5. Keeps the shell open after Claude exits
  // Note: Context is written using heredoc with a unique delimiter that won't appear in user content
  const script = `#!/bin/bash
set -e  # Exit on error

cd "${safeProjectPath}"

# Save context to a hidden file in the project directory
# This ensures Claude has permission to read it without prompting
CONTEXT_FILE="${safeProjectPath}/.brain-dump-context.md"
cat > "$CONTEXT_FILE" << 'BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c'
${context}
BRAIN_DUMP_CONTEXT_EOF_7f3a9b2c

# Brief visual confirmation
echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dump - Starting Work\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📋 Task:\\033[0m ${safeTicketTitle}"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

# Launch Claude with the context file - runs like normal terminal
claude "$CONTEXT_FILE"

# Cleanup context file
rm -f "$CONTEXT_FILE"

echo ""
echo -e "\\033[0;32m✅ Claude session ended.\\033[0m"
exec bash
`;

  // Use 0o700 - owner read/write/execute only (no group/world access)
  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);

  return scriptPath;
}

// Build window title in format: [Project][Epic][Ticket] or [Project][Ticket]
function buildWindowTitle(projectName: string, epicName: string | null, ticketTitle: string): string {
  if (epicName) {
    return `[${projectName}][${epicName}][${ticketTitle}]`;
  }
  return `[${projectName}][${ticketTitle}]`;
}

// Launch Claude in terminal with ticket context
export const launchClaudeInTerminal = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      ticketId: string;
      context: string;
      projectPath: string;
      preferredTerminal?: string | null;
      projectName: string;
      epicName: string | null;
      ticketTitle: string;
    }) => data
  )
  .handler(async ({ data }): Promise<LaunchClaudeResult> => {
    const { ticketId, context, projectPath, preferredTerminal, projectName, epicName, ticketTitle } = data;
    const { exec } = await import("child_process");
    const { existsSync } = await import("fs");

    // Verify project path exists
    if (!existsSync(projectPath)) {
      return {
        success: false,
        method: "clipboard",
        message: `Project directory not found: ${projectPath}. Context copied to clipboard instead.`,
      };
    }

    // Determine which terminal to use
    let terminal: string | null = null;
    const warnings: string[] = [];

    // If preferred terminal is set and available, use it
    if (preferredTerminal) {
      const result = await isTerminalAvailable(preferredTerminal);
      if (result.available) {
        terminal = preferredTerminal;
      } else {
        // Preferred terminal not available - add warning
        const reason = result.error || "not installed";
        warnings.push(`Your preferred terminal "${preferredTerminal}" is not available (${reason}). Using auto-detected terminal instead.`);
      }
    }

    // Fallback to auto-detect if no preferred terminal or preferred is unavailable
    if (!terminal) {
      terminal = await detectTerminal();
    }

    if (!terminal) {
      return {
        success: false,
        method: "clipboard",
        message:
          "No supported terminal emulator found. Context copied to clipboard instead.",
        ...(warnings.length > 0 && { warnings }),
      };
    }

    // Update ticket status to in_progress
    try {
      db.update(tickets)
        .set({ status: "in_progress" })
        .where(eq(tickets.id, ticketId))
        .run();
    } catch (error) {
      console.error("Failed to update ticket status:", error);
      warnings.push("Failed to update ticket status to 'In Progress'. You may need to update it manually.");
    }

    // Save current ticket ID to state file for CLI tool
    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { join } = await import("path");
      const { homedir } = await import("os");

      const stateDir = join(homedir(), ".brain-dump");
      mkdirSync(stateDir, { recursive: true });

      const stateFile = join(stateDir, "current-ticket.json");
      writeFileSync(
        stateFile,
        JSON.stringify({
          ticketId,
          projectPath,
          startedAt: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.error("Failed to save current ticket state:", error);
      warnings.push("Could not save ticket state. The 'brain-dump' CLI commands may not work for this session.");
    }

    // Create launch script and build terminal command with window title
    const scriptPath = await createLaunchScript(projectPath, context);
    const windowTitle = buildWindowTitle(projectName, epicName, ticketTitle);
    const terminalCommand = buildTerminalCommand(
      terminal,
      projectPath,
      scriptPath,
      windowTitle
    );

    try {
      // Launch terminal (don't wait for it to complete)
      exec(terminalCommand, (error) => {
        if (error) {
          console.error("Terminal launch error:", error);
        }
      });

      return {
        success: true,
        method: "terminal",
        message: `Launched Claude in ${terminal}`,
        terminalUsed: terminal,
        ...(warnings.length > 0 && { warnings }),
      };
    } catch (error) {
      return {
        success: false,
        method: "clipboard",
        message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}. Context copied to clipboard instead.`,
        ...(warnings.length > 0 && { warnings }),
      };
    }
  });

// Get current working ticket (for CLI tool)
export const getCurrentTicket = createServerFn({ method: "GET" })
  .inputValidator(() => {})
  .handler(async () => {
    const { readFileSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const stateFile = join(homedir(), ".brain-dump", "current-ticket.json");

    if (!existsSync(stateFile)) {
      return null;
    }

    try {
      const content = readFileSync(stateFile, "utf-8");
      return JSON.parse(content) as {
        ticketId: string;
        projectPath: string;
        startedAt: string;
      };
    } catch {
      return null;
    }
  });

// Clear current ticket (called when work is done)
export const clearCurrentTicket = createServerFn({ method: "POST" })
  .inputValidator(() => {})
  .handler(async () => {
    const { unlinkSync, existsSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const stateFile = join(homedir(), ".brain-dump", "current-ticket.json");

    if (existsSync(stateFile)) {
      unlinkSync(stateFile);
    }

    return { success: true };
  });
