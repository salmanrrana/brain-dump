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
import { tickets } from "../lib/schema";

type TicketRecord = typeof tickets.$inferSelect;

export type HumanRequestedChangesByTicketId = Record<string, string | undefined>;

// ============================================================================
// TYPES
// ============================================================================

export interface RalphReviewPromptTarget {
  id: string;
  title: string;
}

export interface RalphImplementationPromptProfile {
  type: "implementation";
}

export interface RalphReviewPromptProfile {
  type: "review";
  selectedTicket: RalphReviewPromptTarget;
  steeringPrompt?: string | null;
  prdRelativePath?: string | null;
}

export type RalphPromptProfile = RalphImplementationPromptProfile | RalphReviewPromptProfile;

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
- Before complete-work: add a \`comment({ action: "add", ticketId, content, commentType: "test_report" })\` entry summarizing the exact check commands and pass/fail results; omit \`author\` so Brain Dump auto-detects the active provider
- Before demo: all critical/major findings fixed, check-complete returns canProceedToHumanReview: true
- Before session complete: generate-demo called, ticket in human_review
`;

/**
 * Scope constraints. The Ralph loop writes a project-scoped and epic-scoped
 * PRD to \`plans/prd.json\` before each iteration. Agents MUST use it as the
 * authoritative ticket list, otherwise they wander into unrelated backlog
 * tickets (regression observed with OpenCode: it called
 * \`brain-dump_ticket list --status backlog\` across the whole project and
 * picked a cross-epic ticket, which then broke the branch workflow).
 */
const SCOPE_CONSTRAINTS = `
## Scope: plans/prd.json is the ONLY ticket source

Before anything else, read \`plans/prd.json\` from the project root. That file contains the tickets this Ralph run is scoped to (one epic, or a single ticket). It is the authoritative task list.

1. FIRST action every iteration: read \`plans/prd.json\` and find entries where \`passes: false\`.
2. For each \`passes: false\` candidate, call \`ticket({ action: "get", ticketId: "<id>" })\` to check \`status\`. Skip any ticket whose status is \`ai_review\`, \`human_review\`, or \`done\` — those are already past implementation and \`start-work\` will refuse them. The PRD's \`passes\` flag can lag behind real ticket status between iterations.
3. Pick ONE candidate whose status is \`backlog\`, \`ready\`, or \`in_progress\` and work only on that ticket.
4. Do NOT call \`ticket\` with \`action: "list"\` across the whole project to discover work. The PRD is scoped; the project backlog is not.
5. Do NOT pick tickets whose IDs do not appear in \`plans/prd.json\`, even if they look related or higher-priority.
6. If every PRD entry is either \`passes: true\` or has a ticket status of \`ai_review\` / \`human_review\` / \`done\`, output the exact token \`PRD_COMPLETE\` and stop. Do not look for more work outside the PRD.
7. If \`plans/prd.json\` is missing or empty, output \`PRD_COMPLETE\` and stop. Do not fall back to project-wide ticket discovery.
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
- Scope is fixed by \`plans/prd.json\`. Never work on tickets outside it.
`;

// ============================================================================
// PROMPT GENERATION
// ============================================================================

function buildImplementationPrompt(): string {
  return `# Ralph: Autonomous Coding Agent

You are Ralph, an autonomous coding agent. Follow the mandatory 4-phase workflow and use MCP tools literally.
${SCOPE_CONSTRAINTS}
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
  const prdRelativePath = profile.prdRelativePath?.trim() || "plans/prd.json";
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
  PRD: \`${prdRelativePath}\`
${steeringSection}
## Review Workflow
1. Read \`${prdRelativePath}\` plus the selected ticket implementation.
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

// ============================================================================
// VS CODE CONTEXT GENERATION
// ============================================================================

function buildImplementationContext(prd: EnhancedPRDDocument): string {
  const incompleteTickets = prd.userStories.filter((story) => !story.passes);
  const completedTickets = prd.userStories.filter((story) => story.passes);
  const ticketsWithHumanRequestedChanges = incompleteTickets.filter((ticket) =>
    ticket.humanRequestedChanges?.trim()
  );

  const ticketList = incompleteTickets
    .map((ticket) => {
      const priority = ticket.priority ? ` (${ticket.priority})` : "";
      return `- **${ticket.title}**${priority}\n  ID: \`${ticket.id}\``;
    })
    .join("\n");

  const epicHeader = prd.epicTitle ? `\n**Epic:** ${prd.epicTitle}` : "";
  const humanRequestedChangesSection =
    ticketsWithHumanRequestedChanges.length > 0
      ? `
---

## Human Requested Changes - Fix This First

${ticketsWithHumanRequestedChanges
  .map(
    (ticket) =>
      `### ${ticket.title}\nID: \`${ticket.id}\`\n\n${ticket.humanRequestedChanges?.trim()}`
  )
  .join("\n\n")}
`
      : "";

  return `# Ralph Context - ${prd.projectName}

> This file was auto-generated by Brain Dump for Ralph mode in VS Code.
> Read this file to understand the current task context.
${epicHeader}
**Generated:** ${new Date().toISOString()}

---

## Your Task

You are Ralph, an autonomous coding agent. Follow the Universal Quality Workflow:
${SCOPE_CONSTRAINTS}
${WORKFLOW_PHASES}
${humanRequestedChangesSection}
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

function buildHumanRequestedChangesSection(content: string | undefined): string {
  const trimmed = content?.trim();
  if (!trimmed) {
    return "";
  }

  return `## Human Requested Changes - Fix This First

${trimmed}
`;
}

function buildReviewContext(prd: EnhancedPRDDocument, profile: RalphReviewPromptProfile): string {
  const ticket = prd.userStories.find((story) => story.id === profile.selectedTicket.id);
  const epicHeader = prd.epicTitle ? `\n**Epic:** ${prd.epicTitle}` : "";
  const prdRelativePath = profile.prdRelativePath?.trim() || "plans/prd.json";
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
  const humanRequestedChangesSection = buildHumanRequestedChangesSection(
    ticket?.humanRequestedChanges
  );
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
  PRD: \`${prdRelativePath}\`
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
${humanRequestedChangesSection}
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

// ============================================================================
// CONTEXT FILE I/O
// ============================================================================

export async function writeVSCodeContext(
  projectPath: string,
  content: string,
  relativePath: string = ".claude/ralph-context.md"
): Promise<{ success: true; path: string } | { success: false; message: string }> {
  const { writeFileSync, mkdirSync } = await import("fs");
  const { join, dirname } = await import("path");

  const contextPath = join(projectPath, relativePath);
  const parentDir = dirname(contextPath);

  try {
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(contextPath, content, "utf-8");
    return { success: true, path: contextPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[brain-dump] Failed to write VS Code context file to ${contextPath}:`, error);
    return {
      success: false,
      message: `Failed to create Ralph context file in ${parentDir}: ${message}. Check write permissions and disk space.`,
    };
  }
}

// ============================================================================
// PRD GENERATION
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
export function generateEnhancedPRD(
  projectName: string,
  projectPath: string,
  ticketList: TicketRecord[],
  epicTitle?: string,
  epicDescription?: string,
  humanRequestedChangesByTicketId: HumanRequestedChangesByTicketId = {}
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

    const humanRequestedChanges = humanRequestedChangesByTicketId[ticket.id]?.trim();

    return {
      id: ticket.id,
      title: ticket.title,
      passes: ticket.status === "done",
      ...(humanRequestedChanges ? { humanRequestedChanges } : {}),
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
