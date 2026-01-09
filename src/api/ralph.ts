import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { tickets, epics, projects } from "../lib/schema";
import { eq, and, inArray } from "drizzle-orm";
import { safeJsonParse } from "../lib/utils";

interface PRDUserStory {
  id: string;
  title: string;
  description: string | null;
  acceptanceCriteria: string[];
  priority: string | null;
  tags: string[];
  passes: boolean;
}

interface PRDDocument {
  projectName: string;
  projectPath: string;
  epicTitle?: string;
  userStories: PRDUserStory[];
  generatedAt: string;
}

// Generate PRD JSON from tickets
function generatePRD(
  projectName: string,
  projectPath: string,
  ticketList: typeof tickets.$inferSelect[],
  epicTitle?: string
): PRDDocument {
  const userStories: PRDUserStory[] = ticketList.map((ticket) => {
    const tags = safeJsonParse<string[]>(ticket.tags, []);

    // Parse subtasks as acceptance criteria if they exist
    let acceptanceCriteria: string[] = [];
    const subtasks = safeJsonParse<{ text: string }[]>(ticket.subtasks, []);
    if (subtasks.length > 0) {
      acceptanceCriteria = subtasks.map((st) => st.text || String(st));
    }

    // If no subtasks, create basic acceptance criteria from description
    if (acceptanceCriteria.length === 0 && ticket.description) {
      acceptanceCriteria = ["Implement as described", "Verify functionality works as expected"];
    }

    return {
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      acceptanceCriteria,
      priority: ticket.priority,
      tags,
      passes: ticket.status === "done",
    };
  });

  const result: PRDDocument = {
    projectName,
    projectPath,
    userStories,
    generatedAt: new Date().toISOString(),
  };
  if (epicTitle !== undefined) {
    result.epicTitle = epicTitle;
  }
  return result;
}

// Shared Ralph prompt template
function getRalphPrompt(): string {
  return `You are Ralph, an autonomous coding agent working through a product backlog.

## Your Task Files
- PRD (Product Requirements): Read plans/prd.json
- Progress Log: Read plans/progress.txt

## Git Workflow (IMPORTANT - Do this FIRST!)
Before making ANY code changes, set up your feature branch:

1. Check current branch: git branch --show-current
2. Stash any uncommitted changes: git stash (if needed)
3. Fetch latest: git fetch origin
4. Create/checkout feature branch from dev (or main if no dev):
   - Branch naming: ralph/<ticket-id>-<short-description>
   - Example: ralph/BD-123-add-user-auth
   - Command: git checkout -b ralph/<ticket-id>-<description> origin/dev (or origin/main)
5. If branch already exists (from previous iteration), just check it out:
   - git checkout ralph/<ticket-id>-<description>

NEVER commit directly to main or dev. Always use feature branches.

## Instructions
1. **Set up git feature branch** (see "Git Workflow" above)
2. Read the PRD file to see all user stories/tasks
3. Read the progress file to understand what's been done
4. Pick ONE user story where passes:false (prioritize by priority field)
5. **Post a progress update** (see "Progress Updates" below)
6. Implement that feature completely:
   - Write the code
   - Run type checks if available (pnpm type-check or npm run type-check)
   - Run tests if available (pnpm test or npm test)
   - Verify the acceptance criteria are met
7. Once complete:
   - Make a git commit with message: feat(<ticket-id>): <description>
   - Update the PRD: set passes:true for that user story
   - Append a brief summary to the progress file (what you did, any learnings)
   - Update the ticket status via Brain Dumpy MCP: update_ticket_status(ticketId, 'done')
   - Add a work summary comment via Brain Dumpy MCP (see "Work Summaries" below)
8. If ALL user stories have passes:true, output exactly: PRD_COMPLETE

## Progress Updates (IMPORTANT - Do this FIRST!)
Before starting any work, post a progress update so the user knows what you're doing:

Use Brain Dumpy MCP tool "add_ticket_comment" with:
- ticketId: The ticket id you're about to work on
- content: Brief description of what you're about to do (1-2 sentences)
- author: "ralph"
- type: "progress"

Example: "Starting work on user authentication. Will implement login form and API endpoint."

Also post progress updates when:
- You encounter an issue or blocker
- You're running tests
- You're making significant progress on a complex task

## Work Summaries (After completing a task)
After completing each task, use "add_ticket_comment" with:
- ticketId: The ticket id from the PRD
- content: A markdown summary of your work (see format below)
- author: "ralph"
- type: "work_summary"

Example content format:
  ## Work Summary
  **Changes Made:**
  - List of files modified
  - Key changes made
  **Tests:**
  - Test results
  - Any issues found
  **Notes:**
  - Any learnings or context for future work

These comments are visible in the Brain Dumpy UI so users can track your progress.

## Creating a Pull Request
After completing ALL tasks (when all user stories have passes:true), create a PR:

1. Push your feature branch: git push -u origin <branch-name>
2. Create PR using GitHub CLI:
   gh pr create --base dev --title "feat: <epic or ticket title>" --body "## Summary
   <Brief description of changes>

   ## Changes
   - List of completed tickets/features

   ## Testing
   - Tests passed: yes/no
   - Manual testing notes

   Created by Ralph (autonomous coding agent)"

3. If gh is not available or PR creation fails, just push the branch and note it in progress.txt

## Important
- Only work on ONE feature per iteration
- Keep changes small and focused
- Always run tests before marking complete
- Always add a work summary comment after completing a task
- Create a PR when all tasks are complete
- If you encounter an error you can't fix, append it to progress.txt and move on
- The next iteration will have fresh context but can read progress.txt`;
}

// Generate the Ralph bash script (unified for both native and Docker)
function generateRalphScript(
  projectPath: string,
  maxIterations: number = 10,
  useSandbox: boolean = false
): string {
  const imageName = "brain-dumpy-ralph-sandbox:latest";
  const sandboxHeader = useSandbox ? " (Docker Sandbox)" : "";
  const containerInfo = useSandbox ? `echo -e "\\033[1;33m🐳 Container:\\033[0m ${imageName}"` : "";

  // Docker image check (only for sandbox mode)
  const dockerImageCheck = useSandbox
    ? `
# Check if Docker image exists
if ! docker image inspect "${imageName}" > /dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Docker image not found: ${imageName}\\033[0m"
  echo "Please build the sandbox image first in Brain Dumpy settings."
  exit 1
fi
`
    : "";

  // Different prompt file location and Claude invocation for sandbox vs native
  const promptFileSetup = useSandbox
    ? `PROMPT_FILE="$PROJECT_PATH/.ralph-prompt.md"`
    : `PROMPT_FILE=$(mktemp /tmp/ralph-prompt-XXXXXX.md)`;

  const claudeInvocation = useSandbox
    ? `  # Run Claude in Docker container
  # Claude Code auth is passed via mounted ~/.config/claude-code (uses your existing subscription)
  docker run --rm -it \\
    -v "$PROJECT_PATH:/workspace" \\
    -v "\\$HOME/.config/claude-code:/home/ralph/.config/claude-code:ro" \\
    -v "\\$HOME/.gitconfig:/home/ralph/.gitconfig:ro" \\
    -v "\\$HOME/.config/gh:/home/ralph/.config/gh:ro" \\
    -w /workspace \\
    "${imageName}" \\
    claude --dangerously-skip-permissions /workspace/.ralph-prompt.md`
    : `  # Run Claude directly - no output capture so it streams naturally
  claude --dangerously-skip-permissions "$PROMPT_FILE"`;

  const iterationLabel = useSandbox ? "(Docker)" : "";
  const endMessage = useSandbox ? "" : `echo "Run again with: $0 <max_iterations>"`;

  return `#!/bin/bash
set -e

MAX_ITERATIONS=\${1:-${maxIterations}}
PROJECT_PATH="${projectPath}"
PRD_FILE="$PROJECT_PATH/plans/prd.json"
PROGRESS_FILE="$PROJECT_PATH/plans/progress.txt"

cd "$PROJECT_PATH"
${dockerImageCheck}
# Ensure plans directory exists
mkdir -p "$PROJECT_PATH/plans"

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "# Use this to leave notes for the next iteration" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dumpy - Ralph Mode${sandboxHeader}\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📁 Project:\\033[0m $PROJECT_PATH"
${containerInfo}
echo -e "\\033[1;33m📋 PRD:\\033[0m $PRD_FILE"
echo -e "\\033[1;33m🔄 Max Iterations:\\033[0m $MAX_ITERATIONS"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo -e "\\033[0;35m═══════════════════════════════════════════════════════════\\033[0m"
  echo -e "\\033[0;35m  Ralph Iteration $i of $MAX_ITERATIONS ${iterationLabel}\\033[0m"
  echo -e "\\033[0;35m  Started at $(date '+%Y-%m-%d %H:%M:%S')\\033[0m"
  echo -e "\\033[0;35m═══════════════════════════════════════════════════════════\\033[0m"
  echo ""

  # Create prompt file for this iteration
  ${promptFileSetup}
  cat > "$PROMPT_FILE" << 'RALPH_PROMPT_EOF'
${getRalphPrompt()}
RALPH_PROMPT_EOF

  echo -e "\\033[0;33m⏳ Starting Claude${useSandbox ? " in Docker sandbox" : " (autonomous mode)"}...\\033[0m"
  echo ""

${claudeInvocation}
  CLAUDE_EXIT_CODE=$?

  rm -f "$PROMPT_FILE"

  echo ""
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"
  echo -e "\\033[0;36m  Iteration $i complete at $(date '+%H:%M:%S')\\033[0m"
  echo -e "\\033[0;36m  Exit code: $CLAUDE_EXIT_CODE\\033[0m"
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"

  # Check if all tasks in PRD are complete (all have passes:true)
  if [ -f "$PRD_FILE" ]; then
    INCOMPLETE=$(grep -c '"passes": false' "$PRD_FILE" 2>/dev/null || echo "0")
    TOTAL=$(grep -c '"passes":' "$PRD_FILE" 2>/dev/null || echo "0")
    COMPLETE=$((TOTAL - INCOMPLETE))

    echo ""
    echo -e "\\033[0;36m📊 Progress: $COMPLETE/$TOTAL tasks complete\\033[0m"

    if [ "$INCOMPLETE" = "0" ] && [ "$TOTAL" != "0" ]; then
      echo ""
      echo -e "\\033[0;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      echo -e "\\033[0;32m✅ All tasks complete! Ralph is done.\\033[0m"
      echo -e "\\033[0;32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      exit 0
    fi
  fi

  echo ""
  echo -e "\\033[0;33m🔄 Moving to next iteration...\\033[0m"
  sleep 2
done

echo ""
echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;33m⚠️  Max iterations reached. Some tasks may remain.\\033[0m"
echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""
${endMessage}
exec bash
`;
}

// Validate Docker setup for sandbox mode
async function validateDockerSetup(): Promise<{ success: true } | { success: false; message: string }> {
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const { existsSync } = await import("fs");
  const { join } = await import("path");

  const execAsync = promisify(exec);

  // Check if Docker is running
  try {
    await execAsync("docker info");
  } catch {
    return {
      success: false,
      message: "Docker is not running. Please start Docker Desktop or run 'sudo systemctl start docker'",
    };
  }

  // Check if image exists, build if not
  try {
    await execAsync("docker image inspect brain-dumpy-ralph-sandbox:latest");
  } catch {
    // Image doesn't exist, try to build it
    console.log("[brain-dumpy] Building sandbox image...");
    const dockerfilePath = join(process.cwd(), "docker", "ralph-sandbox.Dockerfile");
    const contextPath = join(process.cwd(), "docker");

    if (!existsSync(dockerfilePath)) {
      return {
        success: false,
        message: "Dockerfile not found. Please ensure brain-dumpy is installed correctly.",
      };
    }

    try {
      await execAsync(
        `docker build -t brain-dumpy-ralph-sandbox:latest -f "${dockerfilePath}" "${contextPath}"`,
        { timeout: 300000 }
      );
      console.log("[brain-dumpy] Sandbox image built successfully");
    } catch (buildError) {
      return {
        success: false,
        message: `Failed to build sandbox image: ${buildError instanceof Error ? buildError.message : "Unknown error"}`,
      };
    }
  }

  return { success: true };
}

// Shared launch logic for terminal
async function launchInTerminal(
  projectPath: string,
  scriptPath: string,
  preferredTerminal?: string | null
): Promise<{ success: true; terminal: string } | { success: false; message: string }> {
  const { exec } = await import("child_process");
  const { detectTerminal, buildTerminalCommand } = await import("./terminal-utils");

  let terminal = preferredTerminal;
  if (!terminal) {
    terminal = await detectTerminal();
  }

  if (!terminal) {
    return {
      success: false,
      message: "No terminal emulator found. Please install one or set a preference.",
    };
  }

  const terminalCommand = buildTerminalCommand(terminal, projectPath, scriptPath);

  try {
    exec(terminalCommand, (error) => {
      if (error) {
        console.error("Terminal launch error:", error);
      }
    });

    return { success: true, terminal };
  } catch (error) {
    return {
      success: false,
      message: `Failed to launch terminal: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Launch Ralph for a single ticket
export const launchRalphForTicket = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { ticketId: string; maxIterations?: number; preferredTerminal?: string | null; useSandbox?: boolean }) => data
  )
  .handler(async ({ data }) => {
    const { ticketId, maxIterations = 5, preferredTerminal, useSandbox = false } = data;
    const { writeFileSync, mkdirSync, existsSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");

    // Get the ticket with its project
    const ticket = db
      .select()
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .get();

    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, ticket.projectId))
      .get();

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    if (!existsSync(project.path)) {
      return { success: false, message: `Project directory not found: ${project.path}` };
    }

    // If sandbox mode, validate Docker setup
    if (useSandbox) {
      const dockerResult = await validateDockerSetup();
      if (!dockerResult.success) {
        return dockerResult;
      }
    }

    // Create plans directory in project
    const plansDir = join(project.path, "plans");
    mkdirSync(plansDir, { recursive: true });

    // Generate PRD with just this ticket
    const prd = generatePRD(project.name, project.path, [ticket]);
    const prdPath = join(plansDir, "prd.json");
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    // Generate Ralph script
    const ralphScript = generateRalphScript(project.path, maxIterations, useSandbox);
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = join(scriptDir, `ralph-${useSandbox ? "docker-" : ""}${randomUUID()}.sh`);
    writeFileSync(scriptPath, ralphScript, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    // Update ticket status to in_progress
    db.update(tickets)
      .set({ status: "in_progress" })
      .where(eq(tickets.id, ticketId))
      .run();

    // Launch terminal
    const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);

    if (!launchResult.success) {
      return launchResult;
    }

    return {
      success: true,
      message: `Launched Ralph in ${launchResult.terminal}`,
      terminalUsed: launchResult.terminal,
    };
  });

// Launch Ralph for an entire epic
export const launchRalphForEpic = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { epicId: string; maxIterations?: number; preferredTerminal?: string | null; useSandbox?: boolean }) => data
  )
  .handler(async ({ data }) => {
    const { epicId, maxIterations = 20, preferredTerminal, useSandbox = false } = data;
    const { writeFileSync, mkdirSync, existsSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");

    // Get the epic
    const epic = db
      .select()
      .from(epics)
      .where(eq(epics.id, epicId))
      .get();

    if (!epic) {
      return { success: false, message: "Epic not found" };
    }

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, epic.projectId))
      .get();

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    if (!existsSync(project.path)) {
      return { success: false, message: `Project directory not found: ${project.path}` };
    }

    // If sandbox mode, validate Docker setup
    if (useSandbox) {
      const dockerResult = await validateDockerSetup();
      if (!dockerResult.success) {
        return dockerResult;
      }
    }

    // Get all non-done tickets for this epic
    const epicTickets = db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.epicId, epicId),
          inArray(tickets.status, ["backlog", "ready", "in_progress", "review"])
        )
      )
      .all();

    if (epicTickets.length === 0) {
      return { success: false, message: "No pending tickets in this epic" };
    }

    // Create plans directory in project
    const plansDir = join(project.path, "plans");
    mkdirSync(plansDir, { recursive: true });

    // Generate PRD with all epic tickets
    const prd = generatePRD(project.name, project.path, epicTickets, epic.title);
    const prdPath = join(plansDir, "prd.json");
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    // Generate Ralph script
    const ralphScript = generateRalphScript(project.path, maxIterations, useSandbox);
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = join(scriptDir, `ralph-epic-${useSandbox ? "docker-" : ""}${randomUUID()}.sh`);
    writeFileSync(scriptPath, ralphScript, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    // Update all tickets to in_progress
    for (const ticket of epicTickets) {
      if (ticket.status === "backlog" || ticket.status === "ready") {
        db.update(tickets)
          .set({ status: "in_progress" })
          .where(eq(tickets.id, ticket.id))
          .run();
      }
    }

    // Launch terminal
    const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);

    if (!launchResult.success) {
      return launchResult;
    }

    return {
      success: true,
      message: `Launched Ralph for ${epicTickets.length} tickets in ${launchResult.terminal}`,
      terminalUsed: launchResult.terminal,
      ticketCount: epicTickets.length,
    };
  });
