import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
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
import {
  startWork,
  createRealGitOperations,
  GitError,
  createEpicReviewRun,
  addEpicReviewRunAuditComments,
} from "../../core/index.ts";

const coreGit = createRealGitOperations();

// Import Docker utilities for socket-aware Docker commands
import { execDockerCommand, getDockerHostEnvValue } from "./docker-utils";

type TicketRecord = typeof tickets.$inferSelect;
type RalphWorkingMethod =
  | "auto"
  | "claude-code"
  | "vscode"
  | "opencode"
  | "cursor"
  | "copilot-cli"
  | "codex";
type RalphAiBackend = "claude" | "opencode" | "codex";

export interface RalphImplementationLaunchProfile {
  type?: "implementation";
}

export interface RalphReviewLaunchProfile {
  type: "review";
  selectedTicketIds: string[];
  steeringPrompt?: string | null;
}

export type RalphEpicLaunchProfile = RalphImplementationLaunchProfile | RalphReviewLaunchProfile;

interface RalphReviewPromptTarget {
  id: string;
  title: string;
}

interface RalphImplementationPromptProfile {
  type: "implementation";
}

interface RalphReviewPromptProfile {
  type: "review";
  selectedTicket: RalphReviewPromptTarget;
  steeringPrompt?: string | null;
}

type RalphPromptProfile = RalphImplementationPromptProfile | RalphReviewPromptProfile;

interface EpicLaunchPreparation {
  promptProfile: RalphPromptProfile;
  prdTickets: TicketRecord[];
  startsImplementationWorkflow: boolean;
}

function recordFocusedReviewLaunch(
  epicId: string,
  profile: RalphReviewPromptProfile,
  provider: RalphAiBackend
): string {
  const run = createEpicReviewRun(sqlite, {
    epicId,
    selectedTicketIds: [profile.selectedTicket.id],
    launchMode: "focused-review",
    provider,
    steeringPrompt: profile.steeringPrompt ?? null,
    status: "running",
    startedAt: new Date().toISOString(),
  });

  addEpicReviewRunAuditComments(sqlite, run.id);
  return run.id;
}

// ============================================================================
// SHARED WORKFLOW CONSTANTS
// Extracted to reduce duplication between getRalphPrompt() and generateVSCodeContext()
// ============================================================================

/**
 * The 4-phase Universal Quality Workflow instructions.
 * Used by both Claude Code (via getRalphPrompt) and VS Code (via generateVSCodeContext).
 */
const WORKFLOW_PHASES = `
## 4-Phase Workflow

Use Brain Dump MCP tools literally. No local substitutes for branching, review, or status updates.

1. **Implementation** — start-work → create session → implement → commit → complete-work
2. **AI Review** — self-review → submit-finding → fix critical/major → check-complete (must return canProceedToHumanReview: true)
3. **Demo** — generate-demo with 3+ manual test steps → ticket moves to human_review
4. **Stop** — complete session → STOP. Never move tickets to done yourself.

If all tickets are in \`human_review\` or \`done\`, output: \`PRD_COMPLETE\`.
`;

/**
 * The verification checklist from CLAUDE.md.
 * Used by both getRalphPrompt() and generateVSCodeContext().
 */
const VERIFICATION_CHECKLIST = `
## Gates
- Before complete-work: \`pnpm type-check && pnpm lint && pnpm test\` must pass, all criteria met
- Before demo: all critical/major findings fixed, check-complete returns canProceedToHumanReview: true
- Before session complete: generate-demo called, ticket in human_review
`;

/**
 * Rules for Ralph workflow.
 */
const WORKFLOW_RULES = `
## Rules
- Strict phase order: Implementation → AI Review → Demo → STOP
- ONE ticket per iteration, minimal focused changes
- Never call review submit-feedback or move tickets to done — humans only
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
  ticketList: TicketRecord[],
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

function buildImplementationPrompt(): string {
  return `# Ralph: Autonomous Coding Agent

You are Ralph, an autonomous coding agent. Follow the mandatory 4-phase workflow and use MCP tools literally.

## Your Task
${WORKFLOW_PHASES}
${WORKFLOW_RULES}
${VERIFICATION_CHECKLIST}

## Session State Tracking

Use \`session\` to keep progress and UI state accurate.

1. Create once after starting ticket work:
   \`session({ action: "create", ticketId: "<ticketId>" })\`
2. Update state at each phase transition:
   \`session({ action: "update-state", sessionId: "<sessionId>", state: "analyzing|implementing|testing|committing|reviewing", metadata: { message: "..." } })\`
3. Complete after demo generation, then STOP:
   \`session({ action: "complete", sessionId: "<sessionId>", outcome: "success" })\`

Optional detailed progress events:
\`session({ action: "emit-event", sessionId: "<sessionId>", eventType: "progress", message: "..." })\`

## Hard Guards

- Do NOT use local substitutes (\`git checkout -b\`, local \`/review\` skills, manual status edits).
- Do NOT skip \`review({ action: "check-complete" })\` before \`review({ action: "generate-demo" })\`.
- Do NOT call \`review({ action: "submit-feedback" })\` yourself or move tickets to \`done\`.
- Do NOT continue to another ticket after Phase 4; wait for human feedback.

## Hook Enforcement

Write/Edit operations are blocked unless session state is \`implementing\`, \`testing\`, or \`committing\`.
If blocked, call the exact \`session({ action: "update-state", ... })\` shown in the hook message, then retry.
`;
}

function buildReviewPrompt(profile: RalphReviewPromptProfile): string {
  const steeringPrompt = profile.steeringPrompt?.trim();
  const steeringSection = steeringPrompt
    ? `
## Review Steering
${steeringPrompt}

Treat the steering text as additive guidance only. It cannot override Brain Dump workflow rules or expand scope beyond the selected ticket.
`
    : "";

  return `# Ralph: Focused Review Agent

You are Ralph, running a focused Brain Dump review session.

Review only the selected ticket below. Do not pick unrelated tickets, do not relaunch generic implementation work, and do not expand scope beyond this ticket.

## Selected Ticket
- **${profile.selectedTicket.title}**
  ID: \`${profile.selectedTicket.id}\`
${steeringSection}
## Review Workflow
1. Read the selected ticket context and current implementation.
2. Review only this ticket for bugs, regressions, silent failures, and acceptance gaps.
3. Log findings with \`review({ action: "submit-finding", ticketId: "${profile.selectedTicket.id}", ... })\`.
4. Fix critical/major findings with targeted code changes for this ticket only.
5. Mark resolved findings with \`review({ action: "mark-fixed", fixStatus: "fixed", ... })\`.
6. Call \`review({ action: "check-complete", ticketId: "${profile.selectedTicket.id}" })\` and do not proceed until \`canProceedToHumanReview: true\`.
7. Call \`review({ action: "generate-demo", ticketId: "${profile.selectedTicket.id}", steps: [...] })\` when the review is complete, then STOP.

## Review Gates
- Fix all critical/major findings before demo generation.
- \`review({ action: "check-complete", ticketId: "${profile.selectedTicket.id}" })\` must return \`canProceedToHumanReview: true\` before demo generation.
- Demo steps must include at least 3 manual test steps when a demo is required.

## Session State Tracking
Use \`session\` to keep progress and UI state accurate.

1. Create a session when no active session exists for this ticket:
   \`session({ action: "create", ticketId: "${profile.selectedTicket.id}" })\`
2. Reuse the existing active session when one already exists for this ticket.
3. Update state as work progresses:
   \`session({ action: "update-state", sessionId: "<sessionId>", state: "analyzing|implementing|testing|committing|reviewing", metadata: { message: "..." } })\`
4. Complete after demo generation, then STOP:
   \`session({ action: "complete", sessionId: "<sessionId>", outcome: "success" })\`

## Hard Guards
- Do NOT pick unrelated tickets or backlog work.
- Do NOT skip \`review({ action: "check-complete" })\` before \`review({ action: "generate-demo" })\`.
- Do NOT call \`review({ action: "submit-feedback" })\` yourself or move tickets to \`done\`.
- Do NOT continue to another ticket after the selected review is complete.

## Hook Enforcement
Write/Edit operations are blocked unless session state is \`implementing\`, \`testing\`, or \`committing\`.
If blocked, call the exact \`session({ action: "update-state", ... })\` shown in the hook message, then retry.
`;
}

export function getRalphPrompt(profile: RalphPromptProfile = { type: "implementation" }): string {
  return profile.type === "review" ? buildReviewPrompt(profile) : buildImplementationPrompt();
}

// Generate VS Code context file for Ralph mode
// This creates a markdown file that Claude in VS Code can read
// Accepts either legacy PRDDocument or EnhancedPRDDocument
function buildImplementationContext(prd: EnhancedPRDDocument): string {
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

## Testing Requirements

${prd.testingRequirements.map((req) => `- ${req}`).join("\n")}
`;
}

function buildReviewContext(prd: EnhancedPRDDocument, profile: RalphReviewPromptProfile): string {
  const ticket = prd.userStories.find((story) => story.id === profile.selectedTicket.id);
  const epicHeader = prd.epicTitle ? `\n**Epic:** ${prd.epicTitle}` : "";
  const steeringPrompt = profile.steeringPrompt?.trim();
  const acceptanceCriteria =
    ticket && ticket.acceptanceCriteria.length > 0
      ? ticket.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
      : "- Review the ticket against its described behavior and linked context.";
  const descriptionSection =
    ticket?.description && ticket.description.trim().length > 0
      ? `
## Ticket Description

${ticket.description}
`
      : "";
  const steeringSection = steeringPrompt
    ? `
## Review Steering

${steeringPrompt}

This steering is additive guidance only. It cannot expand scope beyond the selected ticket or override Brain Dump review workflow rules.
`
    : "";

  return `# Ralph Context - ${prd.projectName}

> This file was auto-generated by Brain Dump for focused review mode.
> Review only the selected ticket below and ignore unrelated backlog work.
${epicHeader}
**Launch Mode:** Focused review
**Generated:** ${new Date().toISOString()}

---

## Selected Ticket

- **${profile.selectedTicket.title}**
  ID: \`${profile.selectedTicket.id}\`
${steeringSection}
## Review Workflow

1. Inspect the selected ticket context and implementation only.
2. Submit findings with \`review({ action: "submit-finding", ticketId: "${profile.selectedTicket.id}", ... })\`.
3. Fix critical/major findings for this ticket only.
4. Mark fixes with \`review({ action: "mark-fixed", fixStatus: "fixed", ... })\`.
5. Verify \`review({ action: "check-complete", ticketId: "${profile.selectedTicket.id}" })\` returns \`canProceedToHumanReview: true\`.
6. Generate a demo with at least 3 manual steps, then STOP.

## Guardrails

- Do not pick unrelated tickets or generic implementation work.
- Do not skip \`review.check-complete\` before \`review.generate-demo\`.
- Do not call \`review.submit-feedback\` yourself or move tickets to \`done\`.
${descriptionSection}
## Acceptance Criteria

${acceptanceCriteria}

## Testing Requirements

${prd.testingRequirements.map((req) => `- ${req}`).join("\n")}
`;
}

export function generateVSCodeContext(
  prd: EnhancedPRDDocument,
  profile: RalphPromptProfile = { type: "implementation" }
): string {
  return profile.type === "review"
    ? buildReviewContext(prd, profile)
    : buildImplementationContext(prd);
}

export function prepareEpicLaunch(
  epicTickets: TicketRecord[],
  launchProfile?: RalphEpicLaunchProfile
): { success: true; preparation: EpicLaunchPreparation } | { success: false; message: string } {
  if (!launchProfile || launchProfile.type !== "review") {
    return {
      success: true,
      preparation: {
        promptProfile: { type: "implementation" },
        prdTickets: epicTickets,
        startsImplementationWorkflow: true,
      },
    };
  }

  if (launchProfile.selectedTicketIds.length !== 1) {
    return {
      success: false,
      message: "Focused review launch currently requires exactly one selected ticket.",
    };
  }

  const [selectedTicketId] = launchProfile.selectedTicketIds;
  const selectedTicket = epicTickets.find((ticket) => ticket.id === selectedTicketId);
  if (!selectedTicket) {
    return {
      success: false,
      message: `Selected review ticket does not belong to this epic: ${selectedTicketId}`,
    };
  }

  return {
    success: true,
    preparation: {
      promptProfile: {
        type: "review",
        selectedTicket: {
          id: selectedTicket.id,
          title: selectedTicket.title,
        },
        steeringPrompt: launchProfile.steeringPrompt ?? null,
      },
      prdTickets: [selectedTicket],
      startsImplementationWorkflow: false,
    },
  };
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
  aiBackend: RalphAiBackend = "claude",
  promptProfile: RalphPromptProfile = { type: "implementation" }
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

  // Different prompt file location for sandbox vs native.
  // Native mode uses a portable mktemp strategy that works on GNU/Linux and BSD/macOS.
  const promptFileSetup = useSandbox
    ? `PROMPT_FILE="$PROJECT_PATH/.ralph-prompt.md"`
    : `PROMPT_FILE=""
  PROMPT_FILE=$(mktemp "\${TMPDIR:-/tmp}/ralph-prompt.XXXXXX" 2>/dev/null || true)
  if [ -z "$PROMPT_FILE" ]; then
    PROMPT_FILE=$(mktemp -t ralph-prompt.XXXXXX 2>/dev/null || true)
  fi
  if [ -z "$PROMPT_FILE" ]; then
    echo -e "\\033[0;31m❌ Failed to create temp file\\033[0m"
    exit 1
  fi`;

  // Validate required local AI CLI is installed for native mode.
  const aiPreflightCheck = useSandbox
    ? ""
    : aiBackend === "opencode"
      ? `
if ! command -v opencode >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ OpenCode CLI not found in PATH\\033[0m"
  echo "Install OpenCode: https://opencode.ai"
  exit 1
fi
`
      : aiBackend === "codex"
        ? `
if ! command -v codex >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Codex CLI not found in PATH\\033[0m"
  exit 1
fi
`
        : `
if ! command -v claude >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Claude CLI not found in PATH\\033[0m"
  exit 1
fi
`;

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
  const aiName = aiBackend === "opencode" ? "OpenCode" : aiBackend === "codex" ? "Codex" : "Claude";

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
      : aiBackend === "codex"
        ? `  # Run Codex directly with prompt
  codex "$(cat "$PROMPT_FILE")"`
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
MAX_RETRIES=3
CONSECUTIVE_FAILURES=0
MAX_CONSECUTIVE_FAILURES=5
LAST_INCOMPLETE_COUNT=-1
NO_PROGRESS_COUNT=0
MAX_NO_PROGRESS=3

cd "$PROJECT_PATH"
${dockerHostSetup}${dockerImageCheck}${sshAgentSetup}${aiPreflightCheck}
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
${getRalphPrompt(promptProfile)}
RALPH_PROMPT_EOF

  # Validate prompt file is non-empty before passing to Claude
  if [ ! -s "$PROMPT_FILE" ]; then
    echo -e "\\033[0;31m❌ Prompt file is empty or missing. Skipping iteration.\\033[0m"
    echo "[$(date -Iseconds)] ERROR: Empty prompt file at iteration $i" >> "$PROGRESS_FILE"
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    rm -f "$PROMPT_FILE"
    if [ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]; then
      echo -e "\\033[0;31m❌ Too many consecutive failures ($CONSECUTIVE_FAILURES). Stopping Ralph.\\033[0m"
      echo "[$(date -Iseconds)] ABORTED: $CONSECUTIVE_FAILURES consecutive failures" >> "$PROGRESS_FILE"
      exit 1
    fi
    sleep 2
    continue
  fi

  echo -e "\\033[0;33m⏳ Starting ${aiName}${useSandbox ? " in Docker sandbox" : " (autonomous mode)"}...\\033[0m"
  echo ""

  # Retry loop for Claude invocation (handles transient "No messages returned" errors)
  AI_EXIT_CODE=1
  AI_INTERRUPTED=false
  for RETRY in $(seq 1 $MAX_RETRIES); do
    set +e
${aiInvocation}
    AI_EXIT_CODE=$?
    set -e

    if [ $AI_EXIT_CODE -eq 130 ] || [ $AI_EXIT_CODE -eq 143 ]; then
      echo ""
      echo -e "\\033[0;33m⏹️  ${aiName} interrupted by user. Skipping retries for this iteration.\\033[0m"
      echo "[$(date -Iseconds)] INTERRUPTED: ${aiName} exited with code $AI_EXIT_CODE" >> "$PROGRESS_FILE"
      AI_INTERRUPTED=true
      break
    fi

    if [ $AI_EXIT_CODE -eq 0 ]; then
      break
    fi

    if [ $RETRY -lt $MAX_RETRIES ]; then
      BACKOFF=$((RETRY * 5))
      echo ""
      echo -e "\\033[0;31m⚠️  ${aiName} exited with code $AI_EXIT_CODE (attempt $RETRY/$MAX_RETRIES)\\033[0m"
      echo -e "\\033[0;33m⏳ Retrying in \${BACKOFF}s...\\033[0m"
      sleep $BACKOFF
    fi
  done

  rm -f "$PROMPT_FILE"

  echo ""
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"
  echo -e "\\033[0;36m  Iteration $i complete at $(date '+%H:%M:%S')\\033[0m"
  echo -e "\\033[0;36m  Exit code: $AI_EXIT_CODE\\033[0m"
  echo -e "\\033[0;36m───────────────────────────────────────────────────────────\\033[0m"

  if [ "$AI_INTERRUPTED" = "true" ]; then
    CONSECUTIVE_FAILURES=0
    echo -e "\\033[0;33m⏭️  Continuing to next iteration after user interrupt.\\033[0m"
    sleep 1
    continue
  fi

  # Track consecutive failures to detect persistent issues
  if [ $AI_EXIT_CODE -ne 0 ]; then
    CONSECUTIVE_FAILURES=$((CONSECUTIVE_FAILURES + 1))
    echo -e "\\033[0;31m⚠️  Consecutive failures: $CONSECUTIVE_FAILURES/$MAX_CONSECUTIVE_FAILURES\\033[0m"
    echo "[$(date -Iseconds)] FAILURE: Iteration $i failed after $MAX_RETRIES retries (exit code: $AI_EXIT_CODE)" >> "$PROGRESS_FILE"

    if [ $CONSECUTIVE_FAILURES -ge $MAX_CONSECUTIVE_FAILURES ]; then
      echo ""
      echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      echo -e "\\033[0;31m❌ $MAX_CONSECUTIVE_FAILURES consecutive failures. Ralph is stopping.\\033[0m"
      echo -e "\\033[0;31m   This usually means Claude CLI cannot start properly.\\033[0m"
      echo -e "\\033[0;31m   Check: API key, network, MCP server, or run 'claude --help'\\033[0m"
      echo -e "\\033[0;31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
      echo "[$(date -Iseconds)] ABORTED: $CONSECUTIVE_FAILURES consecutive failures" >> "$PROGRESS_FILE"
      exit 1
    fi
  else
    # Reset on success
    CONSECUTIVE_FAILURES=0
  fi

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

    # Detect stuck state: if incomplete count hasn't changed for MAX_NO_PROGRESS iterations,
    # all tickets are likely in human_review or blocked. Stop looping.
    if [ "$INCOMPLETE" = "$LAST_INCOMPLETE_COUNT" ] && [ $AI_EXIT_CODE -eq 0 ]; then
      NO_PROGRESS_COUNT=$((NO_PROGRESS_COUNT + 1))
      if [ $NO_PROGRESS_COUNT -ge $MAX_NO_PROGRESS ]; then
        echo ""
        echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
        echo -e "\\033[0;33m⏸️  No progress for $MAX_NO_PROGRESS iterations ($INCOMPLETE tickets still incomplete).\\033[0m"
        echo -e "\\033[0;33m   Tickets are likely in human_review or blocked.\\033[0m"
        echo -e "\\033[0;33m   Ralph is stopping to avoid wasting iterations.\\033[0m"
        echo -e "\\033[0;33m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
        echo "[$(date -Iseconds)] STALLED: No progress for $MAX_NO_PROGRESS iterations. $INCOMPLETE/$TOTAL incomplete." >> "$PROGRESS_FILE"
        exit 0
      fi
    else
      NO_PROGRESS_COUNT=0
    fi
    LAST_INCOMPLETE_COUNT="$INCOMPLETE"
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

// Check if Cursor CLI is available and get the path
async function findCursorCli(): Promise<string | null> {
  const { execSync } = await import("child_process");
  const { existsSync } = await import("fs");

  try {
    execSync("which cursor", { stdio: "pipe" });
    return "cursor";
  } catch {
    // Not in PATH, check common macOS locations
  }

  const macOSPaths = [
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor",
    "/usr/local/bin/cursor",
    `${process.env.HOME}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`,
  ];

  for (const cursorPath of macOSPaths) {
    if (existsSync(cursorPath)) {
      return cursorPath;
    }
  }

  return null;
}

// Check if Copilot CLI is available
async function isCopilotCliInstalled(): Promise<boolean> {
  const { execSync } = await import("child_process");
  try {
    execSync("copilot --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function escapeForBashDoubleQuote(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/"/g, '\\"')
    .replace(/!/g, "\\!");
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

// Launch Cursor with project context
async function launchInCursor(
  projectPath: string,
  contextFilePath?: string
): Promise<{ success: true } | { success: false; message: string }> {
  const { exec } = await import("child_process");
  const { existsSync } = await import("fs");

  if (!existsSync(projectPath)) {
    return {
      success: false,
      message: `Project directory not found: ${projectPath}`,
    };
  }

  const cursorCli = await findCursorCli();

  try {
    if (cursorCli) {
      let command = `"${cursorCli}" -n "${projectPath}"`;
      if (contextFilePath && existsSync(contextFilePath)) {
        command += ` -g "${contextFilePath}"`;
      }
      exec(command, (error) => {
        if (error) {
          console.error("Cursor launch error:", error);
        }
      });
      return { success: true };
    }

    if (process.platform === "darwin") {
      exec(`open -a "Cursor" "${projectPath}"`, (error) => {
        if (error) {
          console.error("Cursor app launch error:", error);
        }
      });
      if (contextFilePath && existsSync(contextFilePath)) {
        exec(`open -a "Cursor" "${contextFilePath}"`, (error) => {
          if (error) {
            console.error("Cursor context launch error:", error);
          }
        });
      }
      return { success: true };
    }

    return {
      success: false,
      message: "Cursor is not installed or the `cursor` CLI is not available in PATH.",
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to launch Cursor: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function createCopilotRalphScript(
  projectPath: string,
  contextFilePath: string
): Promise<string> {
  const { writeFileSync, mkdirSync, chmodSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const { randomUUID } = await import("crypto");

  const scriptDir = join(homedir(), ".brain-dump", "scripts");
  mkdirSync(scriptDir, { recursive: true });

  const scriptPath = join(scriptDir, `ralph-copilot-${randomUUID()}.sh`);
  const safeProjectPath = escapeForBashDoubleQuote(projectPath);
  const safeContextPath = escapeForBashDoubleQuote(contextFilePath);

  const script = `#!/bin/bash
set -e

cd "${safeProjectPath}"

echo ""
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[0;36m🤖 Brain Dump - Starting Ralph with Copilot CLI\\033[0m"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo -e "\\033[1;33m📁 Project:\\033[0m ${safeProjectPath}"
echo -e "\\033[1;33m📄 Context:\\033[0m ${safeContextPath}"
echo -e "\\033[0;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\033[0m"
echo ""

if ! command -v copilot >/dev/null 2>&1; then
  echo -e "\\033[0;31m❌ Copilot CLI not found in PATH\\033[0m"
  echo "Install GitHub Copilot CLI and retry."
  exec bash
fi

if [ -f "${safeContextPath}" ]; then
  COPILOT_PROMPT="$(cat "${safeContextPath}")"
  COPILOT_HELP="$(copilot --help 2>/dev/null || true)"
  set +e
  if echo "$COPILOT_HELP" | grep -q -- "--allow-tool"; then
    if echo "$COPILOT_HELP" | grep -qE -- "(^|[[:space:]])-p,|--prompt"; then
      copilot --allow-tool 'brain-dump' -p "$COPILOT_PROMPT"
    else
      copilot --allow-tool 'brain-dump' "$COPILOT_PROMPT"
    fi
  else
    if echo "$COPILOT_HELP" | grep -qE -- "(^|[[:space:]])-p,|--prompt"; then
      copilot -p "$COPILOT_PROMPT"
    else
      copilot "$COPILOT_PROMPT"
    fi
  fi
  COPILOT_EXIT=$?
  set -e
  if [ $COPILOT_EXIT -ne 0 ]; then
    echo ""
    echo -e "\\033[0;33m⚠ Copilot CLI exited with code $COPILOT_EXIT\\033[0m"
    echo "Common fixes:"
    echo "  - Run: copilot auth login"
    echo "  - Run: copilot --allow-tool 'brain-dump'"
    echo "  - Verify MCP setup: brain-dump doctor"
  fi
else
  COPILOT_HELP="$(copilot --help 2>/dev/null || true)"
  set +e
  if echo "$COPILOT_HELP" | grep -q -- "--allow-tool"; then
    copilot --allow-tool 'brain-dump'
  else
    copilot
  fi
  COPILOT_EXIT=$?
  set -e
  if [ $COPILOT_EXIT -ne 0 ]; then
    echo ""
    echo -e "\\033[0;33m⚠ Copilot CLI exited with code $COPILOT_EXIT\\033[0m"
    echo "Try: copilot auth login"
  fi
fi

exec bash
`;

  writeFileSync(scriptPath, script, { mode: 0o700 });
  chmodSync(scriptPath, 0o700);
  return scriptPath;
}

async function launchInCopilotCli(
  projectPath: string,
  contextFilePath: string,
  preferredTerminal?: string | null
): Promise<{ success: true; terminal: string } | { success: false; message: string }> {
  const copilotInstalled = await isCopilotCliInstalled();
  if (!copilotInstalled) {
    return {
      success: false,
      message: "Copilot CLI is not installed. Install it and try again.",
    };
  }

  const scriptPath = await createCopilotRalphScript(projectPath, contextFilePath);
  return launchInTerminal(projectPath, scriptPath, preferredTerminal);
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
      aiBackend?: RalphAiBackend;
      workingMethodOverride?: RalphWorkingMethod;
    }) => data
  )
  .handler(async ({ data }) => {
    const {
      ticketId,
      maxIterations,
      preferredTerminal,
      useSandbox = false,
      aiBackend = "claude",
      workingMethodOverride,
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
      if (aiBackend !== "claude") {
        return {
          success: false,
          message: `Ralph Docker mode currently supports Claude only. Use native mode for ${aiBackend}.`,
        };
      }
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
    try {
      startWork(sqlite, ticketId, coreGit);
    } catch (err) {
      // Git errors are expected for non-git projects — fall back to status-only update
      if (err instanceof GitError) {
        console.warn(`[brain-dump] Git not available, skipping branch creation: ${err.message}`);
        db.update(tickets).set({ status: "in_progress" }).where(eq(tickets.id, ticketId)).run();
      } else {
        // Unexpected errors (TicketNotFoundError, PathNotFoundError, etc.) should propagate
        throw err;
      }
    }

    // Branch based on workingMethod setting
    const workingMethod =
      workingMethodOverride || (project.workingMethod as RalphWorkingMethod) || "auto";
    console.log(
      `[brain-dump] Ralph ticket launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
    );

    if (
      workingMethod === "vscode" ||
      workingMethod === "cursor" ||
      workingMethod === "copilot-cli"
    ) {
      const methodLabel =
        workingMethod === "vscode"
          ? "VS Code"
          : workingMethod === "cursor"
            ? "Cursor"
            : "Copilot CLI";
      console.log(`[brain-dump] Using ${methodLabel} launch path for single ticket`);

      // Generate context file for editor/CLI-based Ralph launch modes.
      const contextContent = generateVSCodeContext(prd);
      const contextResult = await writeVSCodeContext(project.path, contextContent);

      if (!contextResult.success) {
        // Rollback ticket status since launch failed
        db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
        return contextResult;
      }

      console.log(`[brain-dump] Created Ralph context file: ${contextResult.path}`);

      const launchResult =
        workingMethod === "vscode"
          ? await launchInVSCode(project.path, contextResult.path)
          : workingMethod === "cursor"
            ? await launchInCursor(project.path, contextResult.path)
            : await launchInCopilotCli(project.path, contextResult.path, preferredTerminal);

      if (!launchResult.success) {
        // Rollback ticket status since launch failed
        db.update(tickets).set({ status: ticket.status }).where(eq(tickets.id, ticketId)).run();
        return launchResult;
      }

      if (workingMethod === "copilot-cli") {
        const terminalUsed = "terminal" in launchResult ? launchResult.terminal : undefined;
        const terminalLabel = terminalUsed ?? "your terminal";
        return {
          success: true,
          message: `Opening Copilot CLI in ${terminalLabel} for ticket "${ticket.title}". If no window appears, check that ${terminalLabel} is running.`,
          launchMethod: "copilot-cli" as const,
          contextFile: contextResult.path,
          ...(terminalUsed ? { terminalUsed } : {}),
          warnings: sshWarnings,
        };
      }

      return {
        success: true,
        message: `Opened ${methodLabel} with Ralph context for ticket "${ticket.title}". Check .claude/ralph-context.md for instructions.`,
        launchMethod: workingMethod,
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
      aiBackend?: RalphAiBackend;
      workingMethodOverride?: RalphWorkingMethod;
      launchProfile?: RalphEpicLaunchProfile;
    }) => data
  )
  .handler(async ({ data }) => {
    const {
      epicId,
      maxIterations,
      preferredTerminal,
      useSandbox = false,
      aiBackend = "claude",
      workingMethodOverride,
      launchProfile,
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
      if (aiBackend !== "claude") {
        return {
          success: false,
          message: `Ralph Docker mode currently supports Claude only. Use native mode for ${aiBackend}.`,
        };
      }
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

    const launchPreparation = prepareEpicLaunch(epicTickets, launchProfile);
    if (!launchPreparation.success) {
      return launchPreparation;
    }

    const { promptProfile, prdTickets, startsImplementationWorkflow } =
      launchPreparation.preparation;
    const launchedTicketCount = prdTickets.length;

    // Create plans directory in project
    const plansDir = join(project.path, "plans");
    mkdirSync(plansDir, { recursive: true });

    // Generate a launch-specific PRD: all epic tickets for implementation, or the focused
    // review ticket when using review mode.
    const prd = generateEnhancedPRD(
      project.name,
      project.path,
      prdTickets,
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
      aiBackend,
      promptProfile
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
    // For epic launches, Ralph handles individual tickets via MCP workflow({ action: "start-work" }) during iteration.
    // Here we start the workflow for the first backlog/ready ticket to create the epic branch,
    // and mark others as in_progress for the PRD.
    if (startsImplementationWorkflow) {
      const firstTicket = epicTickets.find(
        (t: (typeof epicTickets)[0]) => t.status === "backlog" || t.status === "ready"
      );
      if (firstTicket) {
        try {
          startWork(sqlite, firstTicket.id, coreGit);
        } catch (err) {
          if (err instanceof GitError) {
            console.warn(
              `[brain-dump] Git not available for first ticket, skipping branch creation: ${err.message}`
            );
          } else {
            throw err;
          }
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
    }

    // Branch based on workingMethod setting
    const workingMethod =
      workingMethodOverride || (project.workingMethod as RalphWorkingMethod) || "auto";
    console.log(
      `[brain-dump] Ralph ${promptProfile.type} launch: workingMethod="${workingMethod}" for project "${project.name}", timeout=${timeoutSeconds}s`
    );

    if (
      workingMethod === "vscode" ||
      workingMethod === "cursor" ||
      workingMethod === "copilot-cli"
    ) {
      const methodLabel =
        workingMethod === "vscode"
          ? "VS Code"
          : workingMethod === "cursor"
            ? "Cursor"
            : "Copilot CLI";
      console.log(`[brain-dump] Using ${methodLabel} launch path`);

      // Generate context file for editor/CLI-based Ralph launch modes.
      const contextContent = generateVSCodeContext(prd, promptProfile);
      const contextResult = await writeVSCodeContext(project.path, contextContent);

      if (!contextResult.success) {
        // Rollback implementation bootstrap only for the default implementation path.
        if (startsImplementationWorkflow) {
          for (const ticket of epicTickets) {
            db.update(tickets)
              .set({ status: ticket.status })
              .where(eq(tickets.id, ticket.id))
              .run();
          }
        }
        return contextResult;
      }

      console.log(`[brain-dump] Created Ralph context file: ${contextResult.path}`);

      const launchResult =
        workingMethod === "vscode"
          ? await launchInVSCode(project.path, contextResult.path)
          : workingMethod === "cursor"
            ? await launchInCursor(project.path, contextResult.path)
            : await launchInCopilotCli(project.path, contextResult.path, preferredTerminal);

      if (!launchResult.success) {
        // Rollback implementation bootstrap only for the default implementation path.
        if (startsImplementationWorkflow) {
          for (const ticket of epicTickets) {
            db.update(tickets)
              .set({ status: ticket.status })
              .where(eq(tickets.id, ticket.id))
              .run();
          }
        }
        return launchResult;
      }

      if (workingMethod === "copilot-cli") {
        const focusedReviewRunId =
          promptProfile.type === "review"
            ? recordFocusedReviewLaunch(epic.id, promptProfile, aiBackend)
            : null;
        const terminalUsed = "terminal" in launchResult ? launchResult.terminal : undefined;
        const terminalLabel = terminalUsed ?? "your terminal";
        return {
          success: true,
          message: `Opening Copilot CLI in ${terminalLabel} for ${launchedTicketCount} ticket${launchedTicketCount === 1 ? "" : "s"}. If no window appears, check that ${terminalLabel} is running.${focusedReviewRunId ? ` Focused review run: ${focusedReviewRunId}.` : ""}`,
          launchMethod: "copilot-cli" as const,
          contextFile: contextResult.path,
          ...(terminalUsed ? { terminalUsed } : {}),
          ticketCount: launchedTicketCount,
          warnings: sshWarnings,
        };
      }

      const focusedReviewRunId =
        promptProfile.type === "review"
          ? recordFocusedReviewLaunch(epic.id, promptProfile, aiBackend)
          : null;
      return {
        success: true,
        message: `Opened ${methodLabel} with Ralph context for ${launchedTicketCount} ticket${launchedTicketCount === 1 ? "" : "s"}. Check .claude/ralph-context.md for instructions.${focusedReviewRunId ? ` Focused review run: ${focusedReviewRunId}.` : ""}`,
        launchMethod: workingMethod,
        contextFile: contextResult.path,
        ticketCount: launchedTicketCount,
        warnings: sshWarnings,
      };
    }

    // Terminal path (claude-code or auto): launch in terminal emulator
    console.log(`[brain-dump] Using terminal launch path`);
    const launchResult = await launchInTerminal(project.path, scriptPath, preferredTerminal);

    if (!launchResult.success) {
      return launchResult;
    }

    const focusedReviewRunId =
      promptProfile.type === "review"
        ? recordFocusedReviewLaunch(epic.id, promptProfile, aiBackend)
        : null;
    return {
      success: true,
      message: `Launched Ralph for ${launchedTicketCount} ticket${launchedTicketCount === 1 ? "" : "s"} in ${launchResult.terminal}.${focusedReviewRunId ? ` Focused review run: ${focusedReviewRunId}.` : ""}`,
      terminalUsed: launchResult.terminal,
      launchMethod: "terminal" as const,
      ticketCount: launchedTicketCount,
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
