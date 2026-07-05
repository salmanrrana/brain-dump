import { safeJsonParse } from "../lib/utils";
import {
  renderHardGuards,
  renderRalphWorkflowPhases,
  renderScopeConstraints,
  renderSessionStateTracking,
  renderValidationChecklist,
  renderWorkflowRules,
} from "../../core/workflow-prompt-spec.ts";
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
export type VerificationFailuresByTicketId = Record<string, string | undefined>;

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

const SCOPE_CONSTRAINTS = renderScopeConstraints();
const WORKFLOW_PHASES = renderRalphWorkflowPhases();
const WORKFLOW_RULES = renderWorkflowRules();
const VERIFICATION_CHECKLIST = renderValidationChecklist();

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

${renderSessionStateTracking()}

Optional detailed progress events:
\`session({ action: "emit-event", sessionId: "<sessionId>", eventType: "progress", message: "..." })\`

${renderHardGuards()}

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
6. Call \`review({ action: "check-complete", ticketId: "${profile.selectedTicket.id}" })\` and do not proceed until the result allows verification handoff.
7. Call \`review({ action: "generate-demo", ticketId: "${profile.selectedTicket.id}", steps: [...] })\` when the review is complete, then STOP.

## Review Gates
- Fix all critical/major findings before demo generation.
- \`review({ action: "check-complete", ticketId: "${profile.selectedTicket.id}" })\` must allow verification handoff before demo generation.
- Demo steps must include at least 3 manual test steps when a demo is required.

${renderSessionStateTracking(profile.selectedTicket.id)}

${renderHardGuards()}
- Do not pick unrelated tickets or backlog work.

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
  const ticketsWithVerificationFailures = incompleteTickets.filter((ticket) =>
    ticket.verificationFailures?.trim()
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
  const verificationFailuresSection =
    ticketsWithVerificationFailures.length > 0
      ? `
---

## Verification Failures - Fix This First

${ticketsWithVerificationFailures
  .map(
    (ticket) =>
      `### ${ticket.title}\nID: \`${ticket.id}\`\n\n${ticket.verificationFailures?.trim()}`
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
${verificationFailuresSection}
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

function buildVerificationFailuresSection(content: string | undefined): string {
  const trimmed = content?.trim();
  if (!trimmed) {
    return "";
  }

  return `## Verification Failures - Fix This First

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
  const verificationFailuresSection = buildVerificationFailuresSection(
    ticket?.verificationFailures
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
5. Verify \`review({ action: "check-complete", ticketId: "${profile.selectedTicket.id}" })\` allows verification handoff.
6. Generate a demo with at least 3 manual steps, then STOP.

## Guardrails

- Do not pick unrelated tickets or generic implementation work.
- Do not skip \`review.check-complete\` before \`review.generate-demo\`.
- Do not run verification yourself or move tickets to \`done\`.
${humanRequestedChangesSection}
${verificationFailuresSection}
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
  humanRequestedChangesByTicketId: HumanRequestedChangesByTicketId = {},
  verificationFailuresByTicketId: VerificationFailuresByTicketId = {}
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
    const verificationFailures = verificationFailuresByTicketId[ticket.id]?.trim();

    return {
      id: ticket.id,
      title: ticket.title,
      passes: ticket.status === "done",
      ...(humanRequestedChanges ? { humanRequestedChanges } : {}),
      ...(verificationFailures ? { verificationFailures } : {}),
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
