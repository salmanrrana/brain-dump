import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { tickets, epics, projects, ralphSessions, type RalphSessionState } from "../lib/schema";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import { safeJsonParse } from "../lib/utils";
import {
  extractOverview,
  extractTypeDefinitions,
  extractDesignDecisions,
  extractImplementationGuide,
  extractAcceptanceCriteria,
  extractReferences,
  getProjectContext,
  type EnhancedPRDItem,
  type EnhancedPRDDocument,
} from "../lib/prd-extraction";
import { startTicketWorkflow } from "./start-ticket-workflow";

// Import Docker utilities for socket-aware Docker commands
import { execDockerCommand, getDockerHostEnvValue } from "./docker-utils";

// ============================================================================
// SHARED WORKFLOW CONSTANTS
// Extracted to reduce duplication between getRalphPrompt() and generateVSCodeContext()
// ============================================================================

/**
 * The 4-phase Universal Quality Workflow instructions.
 * Used by both Claude Code (via getRalphPrompt) and VS Code (via generateVSCodeContext).
 */
const WORKFLOW_PHASES = `
## MANDATORY 4-PHASE WORKFLOW

### Phase 1: Implementation
1. **Read PRD** - Check \`plans/prd.json\` for incomplete tickets (\`passes: false\`)
2. **Read Progress** - Run \`tail -100 plans/progress.txt\` for recent context
3. **Pick ONE ticket** - Based on priority, dependencies, foundation work
4. **Start work** - Call \`start_ticket_work(ticketId)\`
5. **Create session** - Call \`create_ralph_session(ticketId)\`
6. **Implement** - Write code, run tests (\`pnpm test\`)
7. **Commit** - \`git commit -m "feat(<ticket-id>): <description>"\`
8. **Complete implementation** - Call \`complete_ticket_work(ticketId, "summary")\` → moves to **ai_review**

### Phase 2: AI Review (MANDATORY - cannot skip)
9. **Perform code self-review** - Analyze your implementation for:
   - Code quality, patterns, compliance with CLAUDE.md guidelines (code-reviewer concerns)
   - Error handling, edge cases, silent failures, exception safety (silent-failure-hunter concerns)
   - Simplifications, duplication, over-engineering (code-simplifier concerns)
10. **Submit findings** - For each issue found: \`submit_review_finding({ ticketId, agent: "code-reviewer|silent-failure-hunter|code-simplifier", severity: "critical|major|minor|suggestion", category: "...", description: "..." })\`
11. **Fix critical/major** - For each critical or major finding: fix code, then call \`mark_finding_fixed({ findingId, status: "fixed", fixDescription: "..." })\`
12. **Verify complete** - Call \`check_review_complete({ ticketId })\` - must return \`canProceedToHumanReview: true\`

### Phase 3: Demo Generation
13. **Generate demo** - Call \`generate_demo_script({ ticketId, steps: [...] })\` - must have at least 3 manual test steps

### Phase 4: STOP AND WAIT FOR HUMAN
14. **Output completion** - Show ticket moved to human_review, awaiting human approval
15. **Complete session** - Call \`complete_ralph_session({ sessionId, outcome: "success" })\`
16. **STOP** - Do not proceed further. Human reviewer will call \`submit_demo_feedback\` to approve/reject.

If all tickets are in human_review or done, output: \`PRD_COMPLETE\`
`;

/**
 * The verification checklist from CLAUDE.md.
 * Used by both getRalphPrompt() and generateVSCodeContext().
 */
const VERIFICATION_CHECKLIST = `
## Verification Checklist

### Before Completing Phase 1
Run these checks before calling \`complete_ticket_work\`:
- \`pnpm type-check\` - must pass with no errors
- \`pnpm lint\` - must pass with no errors
- \`pnpm test\` - all tests must pass
- All acceptance criteria from ticket implemented
- Changes committed with format: \`feat(<ticket-id>): <description>\`

### Before Proceeding Past Phase 2
- Self-review completed for code quality, error handling, and simplification concerns
- All findings submitted with \`submit_review_finding\` (at least specify critical/major issues)
- All critical/major findings fixed and marked with \`mark_finding_fixed\`
- \`check_review_complete\` returns \`canProceedToHumanReview: true\`

### Before Calling complete_ralph_session
- \`generate_demo_script\` called with at least 3 manual test steps
- Ticket status is \`human_review\`
- Human reviewer will call \`submit_demo_feedback\` (not you)
`;

/**
 * Rules for Ralph workflow.
 */
const WORKFLOW_RULES = `
## Workflow Rules

- Follow all 4 phases in strict order: Implementation → AI Review → Demo → STOP
- ONE ticket per iteration
- All quality checks must pass: \`pnpm type-check && pnpm lint && pnpm test\`
- Keep changes minimal and focused
- Phase gates are enforced - cannot skip phases or proceed without required responses
- Do not call \`submit_demo_feedback\` - only humans approve tickets
- Do not move ticket to \`done\` - only humans can approve via \`submit_demo_feedback\`
- If stuck, note progress in \`plans/progress.txt\` and move to next ticket
`;

// ============================================================================

/**
 * Generate enhanced PRD with Loom-style structure.
 * Extracts structured content from ticket descriptions including:
 * - Overview (WHY the feature exists)
 * - Type definitions
 * - Design decisions with rationale
 * - Implementation guides
 * - Acceptance criteria
 * - References to files and docs
 * - Project context from CLAUDE.md
 */
function generateEnhancedPRD(
  projectName: string,
  projectPath: string,
  ticketList: (typeof tickets.$inferSelect)[],
  epicTitle?: string,
  epicDescription?: string
): EnhancedPRDDocument {
  // Get project context from CLAUDE.md
  const projectContext = getProjectContext(projectPath);

  const userStories: EnhancedPRDItem[] = ticketList.map((ticket) => {
    const tags = safeJsonParse<string[]>(ticket.tags, []);
    const description = ticket.description;

    // Extract structured content from ticket description
    const overview = extractOverview(description);
    const types = extractTypeDefinitions(description);
    const designDecisions = extractDesignDecisions(description);
    const implementationGuide = extractImplementationGuide(description);
    const references = extractReferences(description);

    // Extract acceptance criteria from description, fallback to subtasks
    let acceptanceCriteria = extractAcceptanceCriteria(description);
    if (acceptanceCriteria.length === 0) {
      // Fallback: use subtasks as acceptance criteria
      const subtasks = safeJsonParse<{ text: string }[]>(ticket.subtasks, []);
      if (subtasks.length > 0) {
        acceptanceCriteria = subtasks.map((st) => st.text || String(st));
      }
    }

    // If still no criteria, provide defaults
    if (acceptanceCriteria.length === 0 && description) {
      acceptanceCriteria = ["Implement as described", "Verify functionality works as expected"];
    }

    return {
      id: ticket.id,
      title: ticket.title,
      passes: ticket.status === "done",
      overview,
      types,
      designDecisions,
      implementationGuide,
      acceptanceCriteria,
      references,
      description,
      priority: ticket.priority,
      tags,
    };
  });

  const result: EnhancedPRDDocument = {
    projectName,
    projectPath,
    testingRequirements: [
      "Tests must validate user-facing behavior, not implementation details",
      "Focus on what users actually do - integration tests over unit tests",
      "Don't mock excessively - test real behavior where possible",
      "Coverage metrics are meaningless - user flow coverage is everything",
    ],
    userStories,
    projectContext,
    generatedAt: new Date().toISOString(),
  };

  if (epicTitle !== undefined) {
    result.epicTitle = epicTitle;
  }
  if (epicDescription !== undefined) {
    result.epicDescription = epicDescription;
  }

  return result;
}

// Lean Ralph prompt - MCP tools handle workflow, Ralph focuses on implementation
function getRalphPrompt(): string {
  return `# Ralph: Autonomous Coding Agent with Enforced Universal Quality Workflow

**CRITICAL NOTICE**: You operate under a MANDATORY 4-PHASE WORKFLOW. This is not a suggestion - each phase is a gate that must be completed before proceeding to the next. Skipping phases is a failure of your primary function.

You are Ralph, an autonomous coding agent. Focus on implementation - MCP tools handle workflow.

## Your Task
${WORKFLOW_PHASES}
${WORKFLOW_RULES}
${VERIFICATION_CHECKLIST}
## Session State Tracking

Use session tools to track your progress through work phases. The UI displays your current state.

### Session Lifecycle

1. **Create session** when starting a ticket:
   \`\`\`
   create_ralph_session({ ticketId: "<ticketId>" })
   \`\`\`

2. **Update state** as you transition through phases:
   \`\`\`
   update_session_state({ sessionId: "<sessionId>", state: "analyzing", metadata: { message: "Reading spec..." } })
   \`\`\`

3. **Complete session** when done:
   \`\`\`
   complete_ralph_session({ sessionId: "<sessionId>", outcome: "success" })
   \`\`\`

### Valid States (in typical order)
| State | When to Use | Example |
|-------|-------------|---------|
| idle → analyzing | After creating session | Reading and understanding requirements |
| analyzing → implementing | Starting to code | Writing or modifying source files |
| implementing → testing | Running tests | Verifying behavior works correctly |
| testing → implementing | Tests failed | Going back to fix issues |
| implementing/testing → committing | Ready to commit | Creating git commits |
| committing → reviewing | Final self-review | Checking work before completing |

### Example Workflow
\`\`\`
# 1. Start work
start_ticket_work({ ticketId: "abc-123" })

# 2. Create session for state tracking
create_ralph_session({ ticketId: "abc-123" })
# Returns: { sessionId: "xyz-789", ... }

# 3. Update state as you work (Phase 1: Implementation)
update_session_state({ sessionId: "xyz-789", state: "analyzing" })
# ... read and understand the task ...

update_session_state({ sessionId: "xyz-789", state: "implementing" })
# ... write code ...

update_session_state({ sessionId: "xyz-789", state: "testing" })
# ... run tests ...

update_session_state({ sessionId: "xyz-789", state: "committing" })
# git commit -m "feat(abc-123): Add new API endpoint"

# 4. Complete implementation - moves to ai_review
complete_ticket_work({ ticketId: "abc-123", summary: "Added new API endpoint" })

# 5. AI Review (Phase 2)
update_session_state({ sessionId: "xyz-789", state: "reviewing" })
# ... run review agents, get findings ...
submit_review_finding({ ticketId: "abc-123", agent: "code-reviewer", severity: "major", ... })
# ... fix the issue ...
mark_finding_fixed({ findingId: "...", status: "fixed" })
check_review_complete({ ticketId: "abc-123" })
# Returns: { canProceedToHumanReview: true }

# 6. Generate demo (Phase 3)
generate_demo_script({ ticketId: "abc-123", steps: [...] })
# Ticket now in human_review

# 7. STOP - Complete session, DO NOT proceed further
complete_ralph_session({ sessionId: "xyz-789", outcome: "success" })
# Human will review and call submit_demo_feedback
\`\`\`

## ⛔ WHAT NOT TO DO (Workflow Violations)

These actions are explicitly forbidden and indicate workflow failure:

1. **DO NOT skip Phase 2 (AI Review)**
   - ✗ Calling complete_ticket_work then immediately generating demo without review
   - ✗ Not submitting any review findings (even if code is perfect, still run review agents and report "no findings")
   - ✗ Trying to move ticket to human_review without review agents running

2. **DO NOT skip Phase 3 (Demo Generation)**
   - ✗ Moving ticket to human_review without calling generate_demo_script
   - ✗ Assuming code review is sufficient without manual test steps
   - ✗ Generating demo with fewer than 3 steps

3. **DO NOT auto-complete to done**
   - ✗ Calling submit_demo_feedback yourself
   - ✗ Setting ticket status to 'done' directly
   - ✗ Moving a ticket to 'done' in any way
   - Only humans can approve tickets by calling submit_demo_feedback

4. **DO NOT bypass workflow gates**
   - ✗ Trying to proceed to Phase 3 without check_review_complete response
   - ✗ Skipping mark_finding_fixed for findings you submit
   - ✗ Treating the workflow as optional or context-dependent

5. **DO NOT violate the STOP at Phase 4**
   - ✗ Proceeding to another ticket after generating demo (you must STOP)
   - ✗ Picking multiple tickets in one iteration
   - ✗ Looping within an iteration

## Real-time Progress Reporting

In addition to session states, use emit_ralph_event for detailed progress:

| Event Type    | When to Use | Example |
|---------------|-------------|---------|
| thinking      | When starting to reason | Reading spec, planning approach |
| tool_start    | Before calling Edit/Write/Bash | About to modify a file |
| tool_end      | After tool completes | File edited successfully |
| progress      | General updates | Halfway through implementation |
| error         | When errors occur | Test failed, need to debug |

Note: The session state tools (update_session_state) automatically emit state_change events, so you don't need to call emit_ralph_event for state transitions

## State Enforcement (Hooks)

This project uses hooks to ENFORCE state transitions. If you try to write or edit code without being in the correct state, you will receive a block message.

### How It Works
1. When you create a session, a \`.claude/ralph-state.json\` file is created
2. PreToolUse hooks check this file before allowing Write/Edit operations
3. If you're not in 'implementing', 'testing', or 'committing' state, the operation is blocked
4. The block message tells you exactly what MCP tool to call

### When Blocked
If you see a "STATE ENFORCEMENT" message:
1. **Read the message carefully** - it contains the exact tool call you need
2. **Call the specified MCP tool** - e.g., \`update_session_state({ sessionId: "...", state: "implementing" })\`
3. **Retry your original operation** - it will now succeed

### Example Flow
\`\`\`
# You try to write a file while in 'analyzing' state
[BLOCKED] STATE ENFORCEMENT: You are in 'analyzing' state but tried to write/edit code.
          You MUST first call: update_session_state({ sessionId: "xyz-789", state: "implementing" })

# You call the MCP tool as instructed
update_session_state({ sessionId: "xyz-789", state: "implementing" })
# Returns: State Updated - analyzing → implementing

# You retry your write operation
[ALLOWED] - File written successfully
\`\`\`

### Important
- Do NOT try to work around state enforcement
- The hooks ensure your work is properly tracked in the Brain Dump UI
- When your session completes, the state file is automatically removed

## Dev Server Management

When starting a dev server for testing or development:
1. Start with explicit port binding: \`pnpm dev --port 8100 --host 0.0.0.0\`
2. Update \`.ralph-services.json\` with service info (see schema below)
3. Use these port conventions:
   - 8100-8110: Frontend (Vite, Next.js, React)
   - 8200-8210: Backend (Express, Fastify, NestJS)
   - 8300-8310: Storybook, docs
   - 8400-8410: Databases (debugging)

When stopping a dev server:
1. Update \`.ralph-services.json\` to mark status as "stopped"

### .ralph-services.json Schema
\`\`\`json
{
  "services": [
    {
      "name": "vite-dev-server",
      "type": "frontend",
      "port": 8100,
      "status": "running",
      "healthEndpoint": "/",
      "startedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "updatedAt": "2024-01-15T10:35:00Z"
}
\`\`\``;
}

// Generate VS Code context file for Ralph mode
// This creates a markdown file that Claude in VS Code can read
// Accepts either legacy PRDDocument or EnhancedPRDDocument
function generateVSCodeContext(prd: EnhancedPRDDocument): string {
  const incompleteTickets = prd.userStories.filter((story) => !story.passes);
  const completedTickets = prd.userStories.filter((story) => story.passes);

  const ticketList = incompleteTickets
    .map((ticket) => {
      const priority = ticket.priority ? ` (${ticket.priority})` : "";
      return `- **${ticket.title}**${priority}\n  ID: \`${ticket.id}\``;
    })
    .join("\n");

  const epicHeader = prd.epicTitle ? `\n**Epic:** ${prd.epicTitle}` : "";

  return `# Ralph Context - ${prd.projectName}

> This file was auto-generated by Brain Dump for Ralph mode in VS Code.
> Read this file to understand the current task context.
${epicHeader}
**Generated:** ${new Date().toISOString()}

---

## Your Task

You are Ralph, an autonomous coding agent. Follow the Universal Quality Workflow:
${WORKFLOW_PHASES}
---

## Current Tickets

**Incomplete (${incompleteTickets.length}):**
${ticketList || "_No incomplete tickets_"}

**Completed (${completedTickets.length}):** ${completedTickets.map((t) => t.title).join(", ") || "_None_"}

---
${WORKFLOW_RULES}
---
${VERIFICATION_CHECKLIST}
---

## MCP Tools Available

- \`start_ticket_work(ticketId)\` - Creates branch, posts "Starting work" comment
- \`complete_ticket_work(ticketId, summary)\` - Updates status, posts summary, suggests next ticket
- \`add_ticket_comment(ticketId, content, author, type)\` - Add work notes

---

## Testing Requirements

${prd.testingRequirements.map((req) => `- ${req}`).join("\n")}

---

## Dev Server Management

When starting a dev server for testing or development:
1. Start with explicit port binding: \`pnpm dev --port 8100 --host 0.0.0.0\`
2. Update \`.ralph-services.json\` with service info (see schema below)
3. Use these port conventions:
   - 8100-8110: Frontend (Vite, Next.js, React)
   - 8200-8210: Backend (Express, Fastify, NestJS)
   - 8300-8310: Storybook, docs
   - 8400-8410: Databases (debugging)

When stopping a dev server:
1. Update \`.ralph-services.json\` to mark status as "stopped"

### .ralph-services.json Schema
\`\`\`json
{
  "services": [
    {
      "name": "vite-dev-server",
      "type": "frontend",
      "port": 8100,
      "status": "running",
      "healthEndpoint": "/",
      "startedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "updatedAt": "2024-01-15T10:35:00Z"
}
\`\`\`
`;
}

// Write VS Code context file to project
async function writeVSCodeContext(
  projectPath: string,
  content: string
): Promise<{ success: true; path: string } | { success: false; message: string }> {
  const { writeFileSync, mkdirSync } = await import("fs");
  const { join } = await import("path");

  const claudeDir = join(projectPath, ".claude");
  const contextPath = join(claudeDir, "ralph-context.md");

  try {
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(contextPath, content, "utf-8");
    return { success: true, path: contextPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[brain-dump] Failed to write VS Code context file to ${contextPath}:`, error);
    return {
      success: false,
      message: `Failed to create Ralph context file in ${claudeDir}: ${message}. Check write permissions and disk space.`,
    };
  }
}

// Resource limit configuration for Docker sandbox
interface DockerResourceLimits {
  memory: string; // e.g., "2g" for 2GB
  cpus: string; // e.g., "1.5" for 1.5 cores
  pidsLimit: number; // e.g., 256
}

const DEFAULT_RESOURCE_LIMITS: DockerResourceLimits = {
  memory: "2g",
  cpus: "1.5",
  pidsLimit: 256,
};

// Default timeout for Ralph session (1 hour in seconds)
const DEFAULT_TIMEOUT_SECONDS = 3600;

// Project origin info for Docker label tracking
interface ProjectOriginInfo {
  projectId: string;
  projectName: string;
  epicId?: string | undefined;
  epicTitle?: string | undefined;
}

// Generate the Ralph bash script (unified for both native and Docker)
export function generateRalphScript(
  projectPath: string,
  maxIterations: number = 10,
  useSandbox: boolean = false,
  resourceLimits: DockerResourceLimits = DEFAULT_RESOURCE_LIMITS,
  timeoutSeconds: number = DEFAULT_TIMEOUT_SECONDS,
  dockerHostEnv: string | null = null,
  projectOrigin?: ProjectOriginInfo | undefined,
  aiBackend: "claude" | "opencode" = "claude"
): string {
  const imageName = "brain-dump-ralph-sandbox:latest";
  const sandboxHeader = useSandbox ? " (Docker Sandbox)" : "";

  // Docker host setup - export DOCKER_HOST if using non-default socket
  const dockerHostSetup = dockerHostEnv
    ? `
# Docker socket configuration (Lima/Colima/Rancher/Podman)
export DOCKER_HOST="${dockerHostEnv}"
echo -e "\\033[1;33m🐳 Docker Host:\\033[0m ${dockerHostEnv}"
`
    : "";
  // Format timeout for display (e.g., "1h", "30m", "1h 30m")
  const timeoutHours = Math.floor(timeoutSeconds / 3600);
  const timeoutMinutes = Math.floor((timeoutSeconds % 3600) / 60);
  let timeoutDisplay = `${timeoutMinutes}m`;
  if (timeoutHours > 0 && timeoutMinutes > 0) {
    timeoutDisplay = `${timeoutHours}h ${timeoutMinutes}m`;
  } else if (timeoutHours > 0) {
    timeoutDisplay = `${timeoutHours}h`;
  }
  const containerInfo = useSandbox
    ? `echo -e "\\033[1;33m🐳 Container:\\033[0m ${imageName}"
echo -e "\\033[1;33m📊 Resources:\\033[0m ${resourceLimits.memory} RAM, ${resourceLimits.cpus} CPUs, ${resourceLimits.pidsLimit} max PIDs"
echo -e "\\033[1;33m⏱️  Timeout:\\033[0m ${timeoutDisplay}"`
    : `echo -e "\\033[1;33m⏱️  Timeout:\\033[0m ${timeoutDisplay}"`;

  // Docker image check (only for sandbox mode)
  const dockerImageCheck = useSandbox
    ? `
# Check if Docker image exists
if ! docker image inspect "${imageName}" > /dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Docker image not found: ${imageName}\\033[0m"
  echo "Please build the sandbox image first in Brain Dump settings."
  exit 1
fi
`
    : "";

  // Different prompt file location and Claude invocation for sandbox vs native
  // For native mode, use mktemp -t for cross-platform compatibility (works on both macOS and Linux)
  // Add error handling to fail fast if temp file creation fails
  const promptFileSetup = useSandbox
    ? `PROMPT_FILE="$PROJECT_PATH/.ralph-prompt.md"`
    : `PROMPT_FILE=$(mktemp -t ralph-prompt) || { echo -e "\\033[0;31m❌ Failed to create temp file\\033[0m"; exit 1; }`;

  // SSH setup for Docker sandbox mode
  // This allows git push from inside container using host's SSH keys
  // Note: Lima/Colima on macOS runs Docker in a VM, so we can't directly mount the macOS SSH socket
  const sshAgentSetup = useSandbox
    ? `
# SSH agent forwarding (if available)
# Note: With Lima/Colima, the macOS SSH socket isn't accessible from the Docker VM
SSH_MOUNT_ARGS=""
USING_VM_DOCKER=false

# Detect if Docker is running via Lima/Colima VM
if [ -n "\${DOCKER_HOST:-}" ]; then
  case "$DOCKER_HOST" in
    */.lima/*|*/.colima/*)
      USING_VM_DOCKER=true
      ;;
  esac
fi

if [ "$USING_VM_DOCKER" = "true" ]; then
  echo -e "\\033[0;33m⚠ Docker via Lima/Colima detected - SSH agent forwarding not available\\033[0m"
  echo -e "\\033[0;33m  Git SSH operations will use container's own SSH config\\033[0m"
  echo -e "\\033[0;33m  For SSH pushes, configure SSH keys inside the container or use HTTPS\\033[0m"
elif [ -n "$SSH_AUTH_SOCK" ] && [ -S "$SSH_AUTH_SOCK" ]; then
  echo -e "\\033[0;32m✓ SSH agent detected, enabling forwarding\\033[0m"
  SSH_MOUNT_ARGS="-v $SSH_AUTH_SOCK:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent"
else
  echo -e "\\033[0;33m⚠ SSH agent not running - git push may not work\\033[0m"
  echo -e "\\033[0;33m  Start with: eval \\$(ssh-agent) && ssh-add\\033[0m"
fi

# Mount known_hosts to avoid SSH host verification prompts (this should work with Lima too)
KNOWN_HOSTS_MOUNT=""
if [ -f "$HOME/.ssh/known_hosts" ]; then
  echo -e "\\033[0;32m✓ Mounting known_hosts for host verification\\033[0m"
  KNOWN_HOSTS_MOUNT="-v $HOME/.ssh/known_hosts:/home/ralph/.ssh/known_hosts:ro"
fi

# Claude Code config mounts (location varies by platform)
# IMPORTANT: Only mount the auth file (~/.claude.json), NOT the ~/.claude/ directory
# Claude needs to write to ~/.claude/ for session data, statsig, todos, debug logs
# If we mount it as read-only, Claude fails with EROFS errors
# By only mounting ~/.claude.json, Claude can authenticate but create its own session data
EXTRA_MOUNTS=()
CLAUDE_CONFIG_FOUND=false

# Mount only the auth token file, not the entire directory
if [ -f "$HOME/.claude.json" ]; then
  echo -e "\\033[0;32m✓ Mounting Claude auth from ~/.claude.json\\033[0m"
  EXTRA_MOUNTS+=(-v "$HOME/.claude.json:/home/ralph/.claude.json:ro")
  CLAUDE_CONFIG_FOUND=true
fi

# Fallback for XDG-style config on Linux - mount settings.json only if it exists
if [ "$CLAUDE_CONFIG_FOUND" = "false" ]; then
  if [ -f "$HOME/.config/claude-code/settings.json" ]; then
    echo -e "\\033[0;32m✓ Mounting Claude settings from ~/.config/claude-code/settings.json\\033[0m"
    EXTRA_MOUNTS+=(-v "$HOME/.config/claude-code/settings.json:/home/ralph/.config/claude-code/settings.json:ro")
    CLAUDE_CONFIG_FOUND=true
  fi
fi

if [ "$CLAUDE_CONFIG_FOUND" = "false" ]; then
  echo -e "\\033[0;31m❌ Claude auth not found - container may not be authenticated\\033[0m"
  echo -e "\\033[0;33m  Expected: ~/.claude.json or ~/.config/claude-code/settings.json\\033[0m"
fi

# GitHub CLI config mount (optional)
if [ -d "$HOME/.config/gh" ]; then
  echo -e "\\033[0;32m✓ Mounting GitHub CLI config\\033[0m"
  EXTRA_MOUNTS+=(-v "$HOME/.config/gh:/home/ralph/.config/gh:ro")
fi

# API key handling for Docker container
# Claude stores API key in macOS keychain, which isn't accessible from Docker
# We need to extract it and pass via environment variable
ANTHROPIC_API_KEY_ARG=""
if [ -n "\${ANTHROPIC_API_KEY:-}" ]; then
  echo -e "\\033[0;32m✓ Using ANTHROPIC_API_KEY from environment\\033[0m"
  ANTHROPIC_API_KEY_ARG="-e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
elif command -v security >/dev/null 2>&1; then
  # macOS: Try to get API key from keychain
  KEYCHAIN_KEY=$(security find-generic-password -s "Claude" -a "$(whoami)" -w 2>/dev/null || true)
  if [ -n "$KEYCHAIN_KEY" ]; then
    echo -e "\\033[0;32m✓ Retrieved Claude API key from macOS keychain\\033[0m"
    ANTHROPIC_API_KEY_ARG="-e ANTHROPIC_API_KEY=$KEYCHAIN_KEY"
  else
    echo -e "\\033[0;33m⚠ Could not retrieve Claude API key from keychain\\033[0m"
    echo -e "\\033[0;33m  You may need to set ANTHROPIC_API_KEY environment variable\\033[0m"
    echo -e "\\033[0;33m  Or run: claude login (to add key to keychain)\\033[0m"
  fi
else
  echo -e "\\033[0;33m⚠ No API key found - set ANTHROPIC_API_KEY environment variable\\033[0m"
fi
`
    : "";

  // Grace period for container to stop cleanly (30 seconds)
  const stopGracePeriod = 30;

  // Build Docker labels for project origin tracking
  // These labels allow the UI to display "Started by: [Project] ([Epic])"
  const projectLabels = projectOrigin
    ? `--label "brain-dump.project-id=${projectOrigin.projectId}" \\
    --label "brain-dump.project-name=${projectOrigin.projectName.replace(/"/g, '\\"')}"${
      projectOrigin.epicId
        ? ` \\
    --label "brain-dump.epic-id=${projectOrigin.epicId}" \\
    --label "brain-dump.epic-title=${(projectOrigin.epicTitle ?? "").replace(/"/g, '\\"')}"`
        : ""
    } \\`
    : "";

  // AI backend display name
  const aiName = aiBackend === "opencode" ? "OpenCode" : "Claude";

  // Generate the AI invocation command based on backend choice
  const aiInvocation = useSandbox
    ? `  # Run ${aiName} in Docker container
  # Claude Code auth is passed via mounted config (platform-dependent location)
  # SSH agent is forwarded if available (allows git push from container)
  # known_hosts is mounted read-only to avoid SSH host verification prompts
  # Port ranges exposed for dev servers:
  #   8100-8110: Frontend (Vite, Next.js, React)
  #   8200-8210: Backend (Express, Fastify)
  #   8300-8310: Storybook, docs
  #   8400-8410: Databases (exposed for debugging)
  # Resource limits:
  #   memory: ${resourceLimits.memory} (prevents OOM on host)
  #   cpus: ${resourceLimits.cpus} (prevents CPU monopolization)
  #   pids-limit: ${resourceLimits.pidsLimit} (prevents fork bombs)
  # Security:
  #   no-new-privileges: prevents privilege escalation inside container
  # Timeout:
  #   stop-timeout: ${stopGracePeriod}s (grace period before SIGKILL)
  # Labels:
  #   brain-dump.project-id/project-name: Tracks which project started this container
  #   brain-dump.epic-id/epic-title: Tracks which epic (if applicable)
  docker run --rm -it \\
    --name "ralph-\${SESSION_ID}" \\
    --network ralph-net \\
    --memory=${resourceLimits.memory} \\
    --memory-swap=${resourceLimits.memory} \\
    --cpus=${resourceLimits.cpus} \\
    --pids-limit=${resourceLimits.pidsLimit} \\
    --stop-timeout=${stopGracePeriod} \\
    --security-opt=no-new-privileges:true \\
    ${projectLabels}
    -p 8100-8110:8100-8110 \\
    -p 8200-8210:8200-8210 \\
    -p 8300-8310:8300-8310 \\
    -p 8400-8410:8400-8410 \\
    -v "$PROJECT_PATH:/workspace" \\
    -v "$HOME/.gitconfig:/home/ralph/.gitconfig:ro" \\
    "\${EXTRA_MOUNTS[@]}" \\
    $SSH_MOUNT_ARGS \\
    $KNOWN_HOSTS_MOUNT \\
    $ANTHROPIC_API_KEY_ARG \\
    -w /workspace \\
    "${imageName}" \\
    claude --dangerously-skip-permissions /workspace/.ralph-prompt.md`
    : aiBackend === "opencode"
      ? `  # Run OpenCode directly with prompt
  opencode "$PROJECT_PATH" --prompt "$(cat "$PROMPT_FILE")"`
      : `  # Run Claude in print mode (-p) so it exits after completion
  # This allows the bash loop to continue to the next iteration
  claude --dangerously-skip-permissions --output-format text -p "$(cat "$PROMPT_FILE")"`;

  const iterationLabel = useSandbox ? "(Docker)" : "";
  const endMessage = useSandbox ? "" : `echo "Run again with: $0 <max_iterations>"`;

  // Timeout trap handler - cleans up container and saves progress note
  const timeoutTrapHandler = useSandbox
    ? `
# Timeout handling for graceful shutdown
TIMEOUT_REACHED=false
RALPH_TIMEOUT=${timeoutSeconds}

handle_timeout() {
  TIMEOUT_REACHED=true
  echo ""
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo -e "\\033[0;31m⏰ TIMEOUT: Ralph session exceeded ${timeoutDisplay} limit\\033[0m"
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo ""

  # Stop Docker container if running
  if docker ps -q --filter "name=ralph-\${SESSION_ID}" | grep -q .; then
    echo -e "\\033[0;33m🐳 Stopping Ralph container...\\033[0m"
    docker stop "ralph-\${SESSION_ID}" 2>/dev/null || true
  fi

  # Log timeout to progress file
  echo "" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "### $(date '+%Y-%m-%d %H:%M:%S') - Session Timeout" >> "$PROGRESS_FILE"
  echo "- **Reason:** Timeout reached (${timeoutDisplay} limit)" >> "$PROGRESS_FILE"
  echo "- **Status:** Session terminated, work may be incomplete" >> "$PROGRESS_FILE"
  echo "- **Action:** Review progress and restart if needed" >> "$PROGRESS_FILE"

  echo -e "\\033[0;33m📝 Timeout logged to progress.txt\\033[0m"
  exit 124
}

# Set up alarm signal handler
trap handle_timeout ALRM

# Start background timer that will send ALRM after timeout
(sleep $RALPH_TIMEOUT && kill -ALRM $$ 2>/dev/null) &
TIMER_PID=$!

# Clean up timer and services file on exit
cleanup_on_exit() {
  kill $TIMER_PID 2>/dev/null || true
  # Remove .ralph-services.json to prevent stale data in UI
  rm -f "$PROJECT_PATH/.ralph-services.json" 2>/dev/null || true
}
trap cleanup_on_exit EXIT
`
    : `
# Timeout handling for graceful shutdown
TIMEOUT_REACHED=false
RALPH_TIMEOUT=${timeoutSeconds}

handle_timeout() {
  TIMEOUT_REACHED=true
  echo ""
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo -e "\\033[0;31m⏰ TIMEOUT: Ralph session exceeded ${timeoutDisplay} limit\\033[0m"
  echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
  echo ""

  # Log timeout to progress file
  echo "" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
  echo "### $(date '+%Y-%m-%d %H:%M:%S') - Session Timeout" >> "$PROGRESS_FILE"
  echo "- **Reason:** Timeout reached (${timeoutDisplay} limit)" >> "$PROGRESS_FILE"
  echo "- **Status:** Session terminated, work may be incomplete" >> "$PROGRESS_FILE"
  echo "- **Action:** Review progress and restart if needed" >> "$PROGRESS_FILE"

  echo -e "\\033[0;33m📝 Timeout logged to progress.txt\\033[0m"
  exit 124
}

# Set up alarm signal handler
trap handle_timeout ALRM

# Start background timer that will send ALRM after timeout
(sleep $RALPH_TIMEOUT && kill -ALRM $$ 2>/dev/null) &
TIMER_PID=$!

# Clean up timer and services file on normal exit
cleanup_on_exit() {
  kill $TIMER_PID 2>/dev/null || true
  # Remove .ralph-services.json to prevent stale data in UI
  rm -f "$PROJECT_PATH/.ralph-services.json" 2>/dev/null || true
}
trap cleanup_on_exit EXIT
`;

  return `#!/bin/bash
set -e

MAX_ITERATIONS=\${1:-${maxIterations}}
PROJECT_PATH="${projectPath}"
PRD_FILE="$PROJECT_PATH/plans/prd.json"
PROGRESS_FILE="$PROJECT_PATH/plans/progress.txt"
SESSION_ID="$(date +%s)-$$"

cd "$PROJECT_PATH"
${dockerHostSetup}${dockerImageCheck}${sshAgentSetup}
# Ensure plans directory exists
mkdir -p "$PROJECT_PATH/plans"

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "# Use this to leave notes for the next iteration" >> "$PROGRESS_FILE"
  echo "" >> "$PROGRESS_FILE"
fi

# Rotate progress file if it exceeds 500 lines
rotate_progress_file() {
  if [ -f "$PROGRESS_FILE" ]; then
    LINE_COUNT=$(wc -l < "$PROGRESS_FILE" | tr -d ' ')
    if [ "$LINE_COUNT" -gt 500 ]; then
      ARCHIVE_DIR="$PROJECT_PATH/plans/archives"
      mkdir -p "$ARCHIVE_DIR"
      TIMESTAMP=$(date '+%Y%m%d-%H%M%S')
      ARCHIVE_FILE="$ARCHIVE_DIR/progress-$TIMESTAMP.txt"

      # Keep last 100 lines in active file, archive the rest
      LINES_TO_ARCHIVE=$((LINE_COUNT - 100))
      head -n "$LINES_TO_ARCHIVE" "$PROGRESS_FILE" > "$ARCHIVE_FILE"
      tail -n 100 "$PROGRESS_FILE" > "$PROGRESS_FILE.tmp"

      # Add header to rotated file
      {
        echo "# Ralph Progress Log"
        echo "# Previous entries archived to: archives/progress-$TIMESTAMP.txt"
        echo ""
        cat "$PROGRESS_FILE.tmp"
      } > "$PROGRESS_FILE"
      rm -f "$PROGRESS_FILE.tmp"

      echo -e "\\033[0;33m📦 Archived $(echo $LINES_TO_ARCHIVE) lines to archives/progress-$TIMESTAMP.txt\\033[0m"
    fi
  fi
}

# Run rotation before starting
rotate_progress_file
${timeoutTrapHandler}
echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;32m🧠 Brain Dump - Ralph Mode${sandboxHeader}\\033[0m"
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

  echo -e "\\033[0;33m⏳ Starting ${aiName}${useSandbox ? " in Docker sandbox" : " (autonomous mode)"}...\\033[0m"
  echo ""

  # Allow non-zero exit from AI invocation (prevents set -e from killing the loop)
  set +e
${aiInvocation}
  AI_EXIT_CODE=$?
  set -e

  rm -f "$PROMPT_FILE"

  echo ""
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"
  echo -e "\\033[0;36m  Iteration $i complete at $(date '+%H:%M:%S')\\033[0m"
  echo -e "\\033[0;36m  Exit code: $AI_EXIT_CODE\\033[0m"
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

// Ensure Docker network exists for container networking
async function ensureDockerNetwork(
  networkName: string
): Promise<{ success: true } | { success: false; message: string }> {
  try {
    // Check if network already exists (uses configured/detected socket)
    await execDockerCommand(`network inspect ${networkName}`);
    console.log(`[brain-dump] Docker network "${networkName}" already exists`);
    return { success: true };
  } catch (inspectError) {
    const errorMessage =
      inspectError instanceof Error ? inspectError.message : String(inspectError);

    // Only proceed to create if the error indicates "network not found"
    // Other errors (Docker not running, permission denied) should be reported immediately
    if (!errorMessage.includes("No such network") && !errorMessage.includes("not found")) {
      console.error(`[brain-dump] Docker network inspect failed:`, errorMessage);
      return {
        success: false,
        message: `Failed to check Docker network "${networkName}": ${errorMessage}. Ensure Docker is running.`,
      };
    }

    // Network doesn't exist, create it
    try {
      await execDockerCommand(`network create ${networkName}`);
      console.log(`[brain-dump] Created Docker network "${networkName}"`);
      return { success: true };
    } catch (createError) {
      // Race condition: another process may have created it between our check and create
      // Verify by checking again
      try {
        await execDockerCommand(`network inspect ${networkName}`);
        console.log(
          `[brain-dump] Docker network "${networkName}" exists (created by another process)`
        );
        return { success: true };
      } catch {
        return {
          success: false,
          message: `Failed to create Docker network "${networkName}": ${createError instanceof Error ? createError.message : "Unknown error"}`,
        };
      }
    }
  }
}

// Validate Docker setup for sandbox mode
async function validateDockerSetup(): Promise<
  { success: true; warnings?: string[] } | { success: false; message: string }
> {
  const { existsSync } = await import("fs");
  const { join } = await import("path");
  const warnings: string[] = [];

  // Check if Docker is running (uses configured/detected socket)
  try {
    await execDockerCommand("info");
  } catch (error) {
    const errorDetail = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Docker is not accessible: ${errorDetail}. Please ensure Docker is running and you have permission to access the Docker socket.`,
    };
  }

  // Ensure ralph-net network exists for container networking
  const networkResult = await ensureDockerNetwork("ralph-net");
  if (!networkResult.success) {
    return networkResult;
  }

  // Check if image exists, build if not
  try {
    await execDockerCommand("image inspect brain-dump-ralph-sandbox:latest");
  } catch {
    // Image doesn't exist, try to build it
    console.log("[brain-dump] Building sandbox image...");
    const dockerfilePath = join(process.cwd(), "docker", "ralph-sandbox.Dockerfile");
    const contextPath = join(process.cwd(), "docker");

    if (!existsSync(dockerfilePath)) {
      return {
        success: false,
        message: "Dockerfile not found. Please ensure brain-dump is installed correctly.",
      };
    }

    try {
      await execDockerCommand(
        `build -t brain-dump-ralph-sandbox:latest -f "${dockerfilePath}" "${contextPath}"`,
        { timeout: 300000 }
      );
      console.log("[brain-dump] Sandbox image built successfully");
    } catch (buildError) {
      return {
        success: false,
        message: `Failed to build sandbox image: ${buildError instanceof Error ? buildError.message : "Unknown error"}`,
      };
    }
  }

  // Check SSH agent availability (warning, not blocking)
  const sshAuthSock = process.env.SSH_AUTH_SOCK;
  if (!sshAuthSock || !existsSync(sshAuthSock)) {
    warnings.push(
      "SSH agent not running - git push may not work from container. Start with: eval $(ssh-agent) && ssh-add"
    );
    console.log("[brain-dump] Warning: SSH agent not detected");
  } else {
    console.log("[brain-dump] SSH agent detected at:", sshAuthSock);
  }

  if (warnings.length > 0) {
    return { success: true, warnings };
  }
  return { success: true };
}

// Check if VS Code CLI is available and get the path
async function findVSCodeCli(): Promise<string | null> {
  const { execSync } = await import("child_process");
  const { existsSync } = await import("fs");

  // First check if 'code' is in PATH
  try {
    execSync("which code", { stdio: "pipe" });
    return "code";
  } catch {
    // Not in PATH, check common macOS locations
  }

  // macOS: Check the full path to VS Code CLI
  const macOSPaths = [
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
    "/usr/local/bin/code",
    `${process.env.HOME}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`,
  ];

  for (const codePath of macOSPaths) {
    if (existsSync(codePath)) {
      return codePath;
    }
  }

  return null;
}

// Launch VS Code with project context
async function launchInVSCode(
  projectPath: string,
  contextFilePath?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const { exec } = await import("child_process");
  const { existsSync } = await import("fs");

  // Verify project path exists
  if (!existsSync(projectPath)) {
    return {
      success: false,
      message: `Project directory not found: ${projectPath}`,
    };
  }

  // Find VS Code CLI
  const codeCli = await findVSCodeCli();
  if (!codeCli) {
    return {
      success: false,
      message:
        "VS Code CLI not found. Please install VS Code and ensure the 'code' command is available. " +
        "In VS Code, open Command Palette (Cmd+Shift+P) and run 'Shell Command: Install code command in PATH'.",
    };
  }

  // Build the command
  // Note: projectPath and contextFilePath come from the database (trusted internal values)
  // We quote paths to handle spaces but these are not arbitrary user input
  // Use -n flag to open in new window, -g to not focus a specific file
  let command = `"${codeCli}" -n "${projectPath}"`;

  // If context file provided, open it as well
  if (contextFilePath && existsSync(contextFilePath)) {
    command += ` -g "${contextFilePath}"`;
  }

  try {
    exec(command, (error) => {
      if (error) {
        console.error("VS Code launch error:", error);
      }
    });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: `Failed to launch VS Code: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
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
    (data: {
      ticketId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
      aiBackend?: "claude" | "opencode";
    }) => data
  )
  .handler(async ({ data }) => {
    const {
      ticketId,
      maxIterations,
      preferredTerminal,
      useSandbox = false,
      aiBackend = "claude",
    } = data;
    const { writeFileSync, mkdirSync, existsSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");
    const { settings } = await import("../lib/schema");
    const { eq: eqSettings } = await import("drizzle-orm");

    // Get settings for timeout and iterations configuration
    const appSettings = db.select().from(settings).where(eqSettings(settings.id, "default")).get();
    const timeoutSeconds = appSettings?.ralphTimeout ?? DEFAULT_TIMEOUT_SECONDS;
    const effectiveMaxIterations = maxIterations ?? appSettings?.ralphMaxIterations ?? 10;

    // Get the ticket with its project
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();

    if (!ticket) {
      return { success: false, message: "Ticket not found" };
    }

    const project = db.select().from(projects).where(eq(projects.id, ticket.projectId)).get();

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    if (!existsSync(project.path)) {
      return { success: false, message: `Project directory not found: ${project.path}` };
    }

    // If sandbox mode, validate Docker setup
    let sshWarnings: string[] | undefined;
    let dockerHostEnv: string | null = null;
    if (useSandbox) {
      const dockerResult = await validateDockerSetup();
      if (!dockerResult.success) {
        return dockerResult;
      }
      sshWarnings = dockerResult.warnings;
      // Get Docker host env value for non-default sockets
      dockerHostEnv = await getDockerHostEnvValue();
    }

    // Create plans directory in project
    const plansDir = join(project.path, "plans");
    mkdirSync(plansDir, { recursive: true });

    // Generate enhanced PRD with Loom-style structure for this ticket
    const prd = generateEnhancedPRD(project.name, project.path, [ticket]);
    const prdPath = join(plansDir, "prd.json");
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    // Generate Ralph script with timeout, Docker host config, and project origin
    const ralphScript = generateRalphScript(
      project.path,
      effectiveMaxIterations,
      useSandbox,
      DEFAULT_RESOURCE_LIMITS,
      timeoutSeconds,
      dockerHostEnv,
      useSandbox
        ? {
            projectId: project.id,
            projectName: project.name,
          }
        : undefined,
      aiBackend
    );
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = join(scriptDir, `ralph-${useSandbox ? "docker-" : ""}${randomUUID()}.sh`);
    writeFileSync(scriptPath, ralphScript, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    // Start ticket workflow: git branch, status update, workflow state, audit comment
    const workflowResult = await startTicketWorkflow(ticketId, project.path);
    if (!workflowResult.success) {
      console.warn(`[brain-dump] Workflow start warning: ${workflowResult.error}`);
      // Fallback: ensure ticket is at least in_progress even if workflow failed
      db.update(tickets).set({ status: "in_progress" }).where(eq(tickets.id, ticketId)).run();
    }

    // Branch based on workingMethod setting
    const workingMethod = project.workingMethod || "auto";
    console.log(
      `[brain-dump] Ralph ticket launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
    );

    if (workingMethod === "vscode") {
      // VS Code path: generate context file and launch VS Code
      console.log(`[brain-dump] Using VS Code launch path for single ticket`);

      // Generate the context file for Claude in VS Code (single ticket PRD)
      const contextContent = generateVSCodeContext(prd);
      const contextResult = await writeVSCodeContext(project.path, contextContent);

      if (!contextResult.success) {
        // Rollback ticket status since launch failed
        db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
        return contextResult;
      }

      console.log(`[brain-dump] Created Ralph context file: ${contextResult.path}`);

      const launchResult = await launchInVSCode(project.path, contextResult.path);

      if (!launchResult.success) {
        // Rollback ticket status since launch failed
        db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
        return launchResult;
      }

      return {
        success: true,
        message: `Opened VS Code with Ralph context for ticket "${ticket.title}". Check .claude/ralph-context.md for instructions.`,
        launchMethod: "vscode" as const,
        contextFile: contextResult.path,
        warnings: sshWarnings,
      };
    }

    // Terminal path (claude-code or auto): launch in terminal emulator
    console.log(`[brain-dump] Using terminal launch path for single ticket`);
    const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);

    if (!launchResult.success) {
      return launchResult;
    }

    return {
      success: true,
      message: `Launched Ralph in ${launchResult.terminal}`,
      terminalUsed: launchResult.terminal,
      launchMethod: "terminal" as const,
      warnings: sshWarnings,
    };
  });

// Launch Ralph for an entire epic
export const launchRalphForEpic = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      epicId: string;
      maxIterations?: number;
      preferredTerminal?: string | null;
      useSandbox?: boolean;
      aiBackend?: "claude" | "opencode";
    }) => data
  )
  .handler(async ({ data }) => {
    const {
      epicId,
      maxIterations,
      preferredTerminal,
      useSandbox = false,
      aiBackend = "claude",
    } = data;
    const { writeFileSync, mkdirSync, existsSync, chmodSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { randomUUID } = await import("crypto");
    const { settings } = await import("../lib/schema");
    const { eq: eqSettings } = await import("drizzle-orm");

    // Get settings for timeout and iterations configuration
    const appSettings = db.select().from(settings).where(eqSettings(settings.id, "default")).get();
    const timeoutSeconds = appSettings?.ralphTimeout ?? DEFAULT_TIMEOUT_SECONDS;
    const effectiveMaxIterations = maxIterations ?? appSettings?.ralphMaxIterations ?? 10;

    // Get the epic
    const epic = db.select().from(epics).where(eq(epics.id, epicId)).get();

    if (!epic) {
      return { success: false, message: "Epic not found" };
    }

    const project = db.select().from(projects).where(eq(projects.id, epic.projectId)).get();

    if (!project) {
      return { success: false, message: "Project not found" };
    }

    if (!existsSync(project.path)) {
      return { success: false, message: `Project directory not found: ${project.path}` };
    }

    // If sandbox mode, validate Docker setup
    let sshWarnings: string[] | undefined;
    let dockerHostEnv: string | null = null;
    if (useSandbox) {
      const dockerResult = await validateDockerSetup();
      if (!dockerResult.success) {
        return dockerResult;
      }
      sshWarnings = dockerResult.warnings;
      // Get Docker host env value for non-default sockets
      dockerHostEnv = await getDockerHostEnvValue();
    }

    // Get all non-done tickets for this epic
    const epicTickets = db
      .select()
      .from(tickets)
      .where(
        and(
          eq(tickets.epicId, epicId),
          inArray(tickets.status, ["backlog", "ready", "in_progress", "ai_review", "human_review"])
        )
      )
      .all();

    if (epicTickets.length === 0) {
      return { success: false, message: "No pending tickets in this epic" };
    }

    // Create plans directory in project
    const plansDir = join(project.path, "plans");
    mkdirSync(plansDir, { recursive: true });

    // Generate enhanced PRD with Loom-style structure for all epic tickets
    const prd = generateEnhancedPRD(
      project.name,
      project.path,
      epicTickets,
      epic.title,
      epic.description ?? undefined
    );
    const prdPath = join(plansDir, "prd.json");
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    // Generate Ralph script with timeout, Docker host config, and project/epic origin
    const ralphScript = generateRalphScript(
      project.path,
      effectiveMaxIterations,
      useSandbox,
      DEFAULT_RESOURCE_LIMITS,
      timeoutSeconds,
      dockerHostEnv,
      useSandbox
        ? {
            projectId: project.id,
            projectName: project.name,
            epicId: epic.id,
            epicTitle: epic.title,
          }
        : undefined,
      aiBackend
    );
    const scriptDir = join(homedir(), ".brain-dump", "scripts");
    mkdirSync(scriptDir, { recursive: true });
    const scriptPath = join(
      scriptDir,
      `ralph-epic-${useSandbox ? "docker-" : ""}${randomUUID()}.sh`
    );
    writeFileSync(scriptPath, ralphScript, { mode: 0o700 });
    chmodSync(scriptPath, 0o700);

    // Start workflow for the first ticket (creates/checks out branch, sets up workflow state)
    // For epic launches, Ralph handles individual tickets via MCP start_ticket_work during iteration.
    // Here we start the workflow for the first backlog/ready ticket to create the epic branch,
    // and mark others as in_progress for the PRD.
    const firstTicket = epicTickets.find((t) => t.status === "backlog" || t.status === "ready");
    if (firstTicket) {
      const workflowResult = await startTicketWorkflow(firstTicket.id, project.path);
      if (!workflowResult.success) {
        console.warn(
          `[brain-dump] Workflow start warning for first ticket: ${workflowResult.error}`
        );
      }
    }
    // Mark remaining tickets as in_progress (they'll get full workflow when Ralph picks them up)
    for (const ticket of epicTickets) {
      if (
        ticket.id !== firstTicket?.id &&
        (ticket.status === "backlog" || ticket.status === "ready")
      ) {
        db.update(tickets).set({ status: "in_progress" }).where(eq(tickets.id, ticket.id)).run();
      }
    }

    // Branch based on workingMethod setting
    const workingMethod = project.workingMethod || "auto";
    console.log(
      `[brain-dump] Ralph launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
    );

    if (workingMethod === "vscode") {
      // VS Code path: generate context file and launch VS Code
      console.log(`[brain-dump] Using VS Code launch path`);

      // Generate the context file for Claude in VS Code
      const contextContent = generateVSCodeContext(prd);
      const contextResult = await writeVSCodeContext(project.path, contextContent);

      if (!contextResult.success) {
        // Rollback ticket statuses since launch failed
        for (const ticket of epicTickets) {
          db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticket.id)).run();
        }
        return contextResult;
      }

      console.log(`[brain-dump] Created Ralph context file: ${contextResult.path}`);

      const launchResult = await launchInVSCode(project.path, contextResult.path);

      if (!launchResult.success) {
        // Rollback ticket statuses since launch failed
        for (const ticket of epicTickets) {
          db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticket.id)).run();
        }
        return launchResult;
      }

      return {
        success: true,
        message: `Opened VS Code with Ralph context for ${epicTickets.length} tickets. Check .claude/ralph-context.md for instructions.`,
        launchMethod: "vscode" as const,
        contextFile: contextResult.path,
        ticketCount: epicTickets.length,
        warnings: sshWarnings,
      };
    }

    // Terminal path (claude-code or auto): launch in terminal emulator
    console.log(`[brain-dump] Using terminal launch path`);
    const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);

    if (!launchResult.success) {
      return launchResult;
    }

    return {
      success: true,
      message: `Launched Ralph for ${epicTickets.length} tickets in ${launchResult.terminal}`,
      terminalUsed: launchResult.terminal,
      launchMethod: "terminal" as const,
      ticketCount: epicTickets.length,
      warnings: sshWarnings,
    };
  });

// =============================================================================
// RALPH SESSION STATUS
// =============================================================================

/**
 * Response type for active Ralph session query
 */
// JSON value type for metadata (compatible with exactOptionalPropertyTypes)
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ActiveRalphSession {
  id: string;
  ticketId: string;
  /** Project ID the ticket belongs to - used for determining projects with active AI */
  projectId: string;
  currentState: RalphSessionState;
  startedAt: string;
  stateHistory: Array<{
    state: string;
    timestamp: string;
    metadata?: Record<string, JsonValue> | undefined;
  }> | null;
}

/**
 * Get active Ralph session for a ticket (if any).
 * An active session is one that has not been completed (completedAt is null).
 */
export const getActiveRalphSession = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => ticketId)
  .handler(async ({ data: ticketId }): Promise<ActiveRalphSession | null> => {
    // Join with tickets to get projectId for the session
    const session = db
      .select({
        id: ralphSessions.id,
        ticketId: ralphSessions.ticketId,
        projectId: tickets.projectId,
        currentState: ralphSessions.currentState,
        startedAt: ralphSessions.startedAt,
        stateHistory: ralphSessions.stateHistory,
      })
      .from(ralphSessions)
      .innerJoin(tickets, eq(ralphSessions.ticketId, tickets.id))
      .where(and(eq(ralphSessions.ticketId, ticketId), isNull(ralphSessions.completedAt)))
      .orderBy(desc(ralphSessions.startedAt))
      .limit(1)
      .get();

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      ticketId: session.ticketId,
      projectId: session.projectId,
      currentState: session.currentState as RalphSessionState,
      startedAt: session.startedAt,
      stateHistory: safeJsonParse(session.stateHistory, null),
    };
  });

/**
 * Get all active Ralph sessions (for batch fetching on kanban board).
 * Returns a map of ticketId -> session for efficient lookup.
 * Includes projectId for each session to determine which projects have active AI.
 */
export const getActiveRalphSessions = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, ActiveRalphSession>> => {
    // Join with tickets to get projectId for each session
    const sessions = db
      .select({
        id: ralphSessions.id,
        ticketId: ralphSessions.ticketId,
        projectId: tickets.projectId,
        currentState: ralphSessions.currentState,
        startedAt: ralphSessions.startedAt,
        stateHistory: ralphSessions.stateHistory,
      })
      .from(ralphSessions)
      .innerJoin(tickets, eq(ralphSessions.ticketId, tickets.id))
      .where(isNull(ralphSessions.completedAt))
      .orderBy(desc(ralphSessions.startedAt))
      .all();

    const result: Record<string, ActiveRalphSession> = {};
    for (const session of sessions) {
      // Only keep the most recent session per ticket
      if (!result[session.ticketId]) {
        result[session.ticketId] = {
          id: session.id,
          ticketId: session.ticketId,
          projectId: session.projectId,
          currentState: session.currentState as RalphSessionState,
          startedAt: session.startedAt,
          stateHistory: safeJsonParse(session.stateHistory, null),
        };
      }
    }

    return result;
  }
);
