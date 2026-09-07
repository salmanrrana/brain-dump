import { safeJsonParse } from "../lib/utils";
import {
  renderHardGuards,
  renderImplementationDiscipline,
  renderRalphWorkflowPhases,
  renderScopeConstraints,
  renderSessionStateTracking,
  renderValidationChecklist,
  renderWorkflowRules,
  renderWorkflowToolAccess,
} from "../../core/workflow-prompt-spec.ts";
import { OPEN_BLOCKING_FINDINGS_BUDGET } from "../../core/review.ts";
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

/**
 * Fresh-eyes labels rendered into the split prompts so each agent knows which
 * role it plays and who the counterpart is (e.g. "Codex" reviews "Claude").
 */
export interface RalphFreshEyesInfo {
  implementerLabel: string;
  reviewerLabel: string;
}

export interface RalphImplementationPromptProfile {
  type: "implementation";
  /**
   * When set, a distinct reviewer backend owns the AI Review phase: the
   * implementation prompt tells the implementer to stop after complete-work
   * and only fix findings the reviewer files.
   */
  freshEyes?: RalphFreshEyesInfo;
}

export interface RalphReviewPromptProfile {
  type: "review";
  selectedTicket: RalphReviewPromptTarget;
  steeringPrompt?: string | null;
  prdRelativePath?: string | null;
}

export type RalphPromptProfile = RalphImplementationPromptProfile | RalphReviewPromptProfile;

const TOOL_ACCESS = renderWorkflowToolAccess();
const SCOPE_CONSTRAINTS = renderScopeConstraints();
const WORKFLOW_PHASES = renderRalphWorkflowPhases();
const IMPLEMENTATION_DISCIPLINE = renderImplementationDiscipline();
const WORKFLOW_RULES = renderWorkflowRules();
const VERIFICATION_CHECKLIST = renderValidationChecklist();
const HOOK_ENFORCEMENT = `## Hook Enforcement

In environments with Brain Dump hooks, Write/Edit operations are blocked unless session state is \`implementing\`, \`testing\`, or \`committing\`.
If blocked, run the exact session update-state action shown in the hook message, then retry.`;

// ============================================================================
// PROMPT GENERATION
// ============================================================================

function buildFreshEyesImplementationPrompt(freshEyes: RalphFreshEyesInfo): string {
  return `# Ralph: Autonomous Coding Agent

You are the IMPLEMENTER (${freshEyes.implementerLabel}) in a split fresh-eyes workflow. A separate reviewer (${freshEyes.reviewerLabel}) owns critique, review completion, and the verification handoff. This launch-specific role split overrides generic repository instructions that describe a single agent performing both implementation and review.

${TOOL_ACCESS}

## Deterministic Ticket Selection

1. Read \`plans/prd.json\`; it is the only ticket source. Check the live status of each \`passes: false\` entry with \`brain-dump ticket get --ticket <id> --pretty\`.
2. If any unblocked scoped ticket is in \`ai_review\`, output \`REVIEW_PENDING\` and STOP without editing. The fresh reviewer runs immediately after this invocation and owns the complete review phase.
3. Otherwise select the FIRST unblocked scoped ticket in PRD order whose live status is \`backlog\`, \`ready\`, or \`in_progress\`. A PRD entry uses \`blocked: true\`; live ticket output uses \`isBlocked: true\`.
4. Skip \`done\` tickets. Leave \`ai_verification\` tickets to the verification runner. Never inspect the project-wide backlog for extra work.
5. If every scoped ticket is done, output \`PRD_COMPLETE\` and stop. If every remaining candidate is blocked, output \`BLOCKED\` and stop so the loop can report the human dependency.

## Implementation or Verification Repair

1. Start or resume only the selected ticket with \`brain-dump workflow start-work --ticket <ticketId> --pretty\`, then create or reuse its Brain Dump session.
2. If the ticket is already \`in_progress\`, read its open findings with \`brain-dump review get-findings --ticket <ticketId> --status open --pretty\`. When verification findings exist, fix exactly those failures and do not broaden the ticket. Otherwise map every acceptance criterion to an existing production entry point and nearby tests, then implement the smallest complete change using the discipline below.
3. Run focused tests plus the project-required validation discovered from its docs and config.
4. Add a \`test_report\` comment with the exact commands and results and commit the implementation or repair. Only after the commit and validation pass, mark any resolved verification findings fixed.
5. Run \`brain-dump workflow complete-work --ticket <ticketId> --summary "<summary>" --pretty\`.
6. STOP. The separate reviewer owns the entire AI review, targeted review fixes, and verification handoff.

${IMPLEMENTATION_DISCIPLINE}

## Implementation Gates

- Use the project's own validation commands; never assume a package manager or language.
- Keep one ticket per invocation and stop at the role boundary above.
- Never perform reviewer-owned critique, completion, demo, verification, or ticket-finalization actions.
- Never continue to another ticket after implementation or repair.

## Session State

Create or reuse one session for the selected ticket. Update it through \`analyzing\`, \`implementing\`, \`testing\`, and \`committing\` as work advances. Leave it active for the reviewer when you stop.

Optional detailed progress events:
\`brain-dump session emit-event --session <sessionId> --event-type progress\`

${HOOK_ENFORCEMENT}
`;
}

function buildImplementationPrompt(profile?: RalphImplementationPromptProfile): string {
  if (profile?.freshEyes) {
    return buildFreshEyesImplementationPrompt(profile.freshEyes);
  }

  return `# Ralph: Autonomous Coding Agent

You are Ralph, an autonomous coding agent. Follow the mandatory 4-phase workflow and use Brain Dump workflow actions literally.

${TOOL_ACCESS}
${SCOPE_CONSTRAINTS}
## Your Task
${WORKFLOW_PHASES}
${IMPLEMENTATION_DISCIPLINE}
${WORKFLOW_RULES}
${VERIFICATION_CHECKLIST}

${renderSessionStateTracking()}

Optional detailed progress events:
\`brain-dump session emit-event --session <sessionId> --event-type progress\`

${renderHardGuards()}

${HOOK_ENFORCEMENT}
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

${TOOL_ACCESS}

## Selected Ticket
- **${profile.selectedTicket.title}**
  ID: \`${profile.selectedTicket.id}\`
  PRD: \`${prdRelativePath}\`
${steeringSection}
## Review Workflow
1. Run \`brain-dump review get-review-context --ticket ${profile.selectedTicket.id} --pretty\` FIRST: it returns the acceptance criteria, work history, the exact in-scope file list, prior findings (never re-file resolved ones), and your blocking-findings budget. Then read \`${prdRelativePath}\` for additional context.
2. Review only this ticket's in-scope files for bugs, regressions, silent failures, and acceptance gaps — verify each acceptance criterion against its actual implementation.
3. Log findings with \`brain-dump review submit-finding --ticket ${profile.selectedTicket.id} --agent <agent> --severity <severity> --category <category> --description "<description>" --pretty\`.
4. Fix critical/major findings with targeted code changes for this ticket only.
5. Mark resolved findings with \`brain-dump review mark-fixed --finding <findingId> --status fixed --pretty\`.
6. Run \`brain-dump review check-complete --ticket ${profile.selectedTicket.id} --pretty\` and do not proceed until the result allows verification handoff.
7. Run \`brain-dump review generate-demo --ticket ${profile.selectedTicket.id} --steps-file <steps.json> --pretty\` when the review is complete, then STOP.

## Review Gates
- Fix all critical/major findings before demo generation.
- \`brain-dump review check-complete --ticket ${profile.selectedTicket.id} --pretty\` must allow verification handoff before demo generation.
- Demo steps must include 3-7 verification steps with automation specs for visual/automated UI, API, command, or file checks when a demo is required. Manual steps and \`coverageRationale\` are rejected; every acceptance criterion must be covered via \`covers\` references.
- API/UI demos must declare \`app.start\` argv after inspecting this project's actual docs and runtime config; use \`{port}\`/\`{host}\` tokens and never assume npm or pnpm.

${renderSessionStateTracking(profile.selectedTicket.id)}

${renderHardGuards()}
- Do not pick unrelated tickets or backlog work.

${HOOK_ENFORCEMENT}
`;
}

export function getRalphPrompt(profile: RalphPromptProfile = { type: "implementation" }): string {
  return profile.type === "review"
    ? buildReviewPrompt(profile)
    : buildImplementationPrompt(profile);
}

/**
 * Prompt for the fresh-eyes reviewer invocation inside the Ralph loop.
 *
 * The reviewer is a DIFFERENT provider/model from the implementer. It only
 * reviews: it submits findings, gates completion, and generates the demo. It
 * never writes implementation code — open critical/major findings are fixed
 * by the implementer on the next loop iteration (roles stay stable).
 */
export function getFreshEyesReviewerPrompt(freshEyes: RalphFreshEyesInfo): string {
  return `# Ralph: Fresh Eyes Reviewer

You are the independent AI review agent (${freshEyes.reviewerLabel}) for code written by ${freshEyes.implementerLabel}. Replace the normal self-reviewer for the complete AI Review phase: review with fresh eyes, make only the targeted fixes your review requires, validate them, and hand the ticket directly to AI verification in this ONE invocation.

${TOOL_ACCESS}

## Scope: plans/prd.json is the ONLY ticket source

1. Read \`plans/prd.json\`. Candidates are entries with \`passes: false\`.
2. For each candidate run \`brain-dump ticket get --ticket <id> --pretty\` to check \`status\`. You may ONLY act on tickets whose status is \`ai_review\`.
3. If NO candidate ticket is in \`ai_review\`, output the exact token \`NO_REVIEW_NEEDED\` and stop immediately. Do not implement, fix, or refactor anything.
4. Otherwise review the FIRST unblocked \`ai_review\` candidate in PRD order. Ignore candidates whose PRD entry reports \`blocked: true\` or whose live ticket reports \`isBlocked: true\` while any unblocked review candidate remains. The implementer uses the same deterministic rule, so do not choose a different ticket. If every review candidate is blocked, output \`NO_REVIEW_NEEDED\` and stop. One ticket per invocation.

## Review Workflow

1. Reuse the ticket's active session (\`brain-dump session get --ticket <ticketId> --pretty\`) or create one (\`brain-dump session create --ticket <ticketId> --pretty\`), then \`brain-dump session update-state --session <sessionId> --state reviewing\`.
2. Run \`brain-dump review get-review-context --ticket <ticketId> --pretty\` FIRST. It returns the complete review packet: the ticket's requirements and acceptance criteria, the implementer's work summaries and test reports, \`scope.changedFiles\` (the primary recent-change set), \`openFindings\` (your work batch if non-empty), \`resolvedFindings\` (already litigated — never re-file these), and \`reviewRules\` (your blocking-findings budget and remaining rounds). The changed files are the cause boundary, not a reading boundary: inspect unchanged callers, callees, schemas, shared state, configuration, error handling, and cleanup paths when needed to prove or disprove an effect of a recent change. Do not review unrelated untouched behavior. If currently OPEN critical/major findings exist, they are the review batch — do not rescan the implementation for more issues.
3. When no open blocking findings exist, perform exactly ONE bounded fresh-eyes pass starting from \`scope.changedFiles\`:
   - **Changed behavior:** inspect the actual hunks for correctness, acceptance gaps, silent failures, and unsafe assumptions.
   - **Impact cone:** trace affected production entry points and consumers for API/contract changes, state transitions, persistence/schema effects, errors, cleanup, concurrency, and performance regressions.
   - **Newly exposed defects:** report an existing latent issue only when the recent change makes its failing path newly reachable, more frequent, or observably worse.
   Verify every acceptance criterion against the real production path, not just tests or diff hunks. Submit the complete finding batch with \`brain-dump review submit-finding --ticket <ticketId> --agent <agent> --severity <severity> --category <category> --description "<description>" --file <causal-changed-file> --line <causal-changed-line> --pretty\`. Every critical/major must identify the causal recent change, a concrete reproduction or failing path, the impacted production location (even when unchanged), and user/system impact. Findings with no causal connection to the ticket changes are out of scope. Zero findings is valid.
4. Apply a focused maintainability lens to changed code: reuse existing production components/helpers, avoid parallel logic, preserve existing features, and keep the code readable for a junior engineer. A blocking maintainability finding must cite the bypassed implementation and concrete cost. Style preferences, optional cleanup, test hardening, and speculative abstractions are nonblocking.
5. Use strict severity: critical = crash, data loss, security failure, or a core acceptance criterion demonstrably broken; major = reproducible incorrect user-visible behavior in scope; minor = nonblocking edge case, test gap, or maintainability concern; suggestion = optional. “More robust” hypotheticals are not major. Compare with prior findings and never re-file the same defect. If you cannot state a concrete reproduction or failing path for a critical/major, file it as minor or suggestion instead. When you conclude an OPEN finding is hypothetical, wrong, or not worth its fix cost, close it with \`brain-dump review mark-fixed --finding <findingId> --status wont_fix --pretty\` and say why — do not fix it just to clear the list and do not leave it open.
   Brain Dump enforces anti-loop gates on submit-finding: at most ${OPEN_BLOCKING_FINDINGS_BUDGET} blocking (critical/major) findings may be open at once, and on repair rounds blocking findings must touch a file changed since the last verification handoff. A submission the gate downgrades is recorded as minor with a [severity gate] note — accept the downgrade and move on; never re-submit it re-worded or at a different line to escape the gate.
6. Fix every open critical/major finding yourself with the smallest targeted change. Update the session through \`implementing\`, \`testing\`, and \`committing\`; reuse established code and do not address unrelated minors or refactor beyond the finding.
7. If and only if you changed code for a blocking finding: run focused regression tests plus the project-required validation, add a \`test_report\` comment containing the exact commands and results, commit the review fixes, then mark each resolved finding fixed with \`brain-dump review mark-fixed --finding <findingId> --status fixed --pretty\`. If you made no code changes, do not create an empty commit; proceed directly to completion checking.
8. Verify only that your filed/prior blockers are resolved. Do NOT begin a second broad review of your own repairs and do not invent a new critique after fixing the complete batch.
9. Run \`brain-dump review check-complete --ticket <ticketId> --pretty\`. If a critical/major remains open, finish that same targeted repair before proceeding; do not hand it to another agent iteration.
10. Once review is complete, inspect README, AGENTS.md/CLAUDE.md, Makefile/Justfile, package.json, pyproject.toml, go.mod, Cargo.toml, and relevant runtime config. Declare one \`app: { "start": ["<runtime>", "...", "{port}"], "cwd": "<optional-project-relative-dir>" }\` using the real startup command. Run \`brain-dump review generate-demo --ticket <ticketId> --steps-file <steps.json> --pretty\` with 3-7 criterion-linked automation steps. This hands the ticket directly to AI verification.
11. STOP. \`generate-demo\` already completed the ticket's active sessions during the verification handoff; do not call \`session complete\` afterwards (it is harmless if called, but unnecessary).

## Hard Guards

- Never run \`brain-dump workflow start-work\` or \`complete-work\`.
- Never run verification or move tickets to done; the runner owns completion.
- Never review tickets outside \`plans/prd.json\`.
- Never hand review fixes back to the implementation agent and never start a second critique pass.
- One ticket per invocation, then stop.
`;
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

${TOOL_ACCESS}
${SCOPE_CONSTRAINTS}
${WORKFLOW_PHASES}
${IMPLEMENTATION_DISCIPLINE}
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
${TOOL_ACCESS}

## Review Workflow

1. Run \`brain-dump review get-review-context --ticket ${profile.selectedTicket.id} --pretty\` first for the acceptance criteria, in-scope file list, prior findings, and blocking budget. Inspect only the selected ticket's implementation.
2. Submit findings with \`brain-dump review submit-finding --ticket ${profile.selectedTicket.id} --agent <agent> --severity <severity> --category <category> --description "<description>" --pretty\`.
3. Fix critical/major findings for this ticket only.
4. Mark fixes with \`brain-dump review mark-fixed --finding <findingId> --status fixed --pretty\`.
5. Verify \`brain-dump review check-complete --ticket ${profile.selectedTicket.id} --pretty\` allows verification handoff.
6. Generate 3-7 verification steps with automation specs for visual/automated UI, API, command, or file checks, then STOP. Manual steps and \`coverageRationale\` are rejected; every acceptance criterion needs a \`covers\` reference, and UI/API steps need \`app: { "start": [...argv] }\` discovered from the project's own docs/config with \`{port}\`/\`{host}\` tokens — never assume npm or pnpm.

## Guardrails

- Do not pick unrelated tickets or generic implementation work.
- Do not skip \`brain-dump review check-complete\` before \`brain-dump review generate-demo\`.
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
  verificationFailuresByTicketId: VerificationFailuresByTicketId = {},
  reviewer?: import("../lib/prd-extraction").EnhancedPRDReviewer
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
      status: ticket.status,
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
  if (reviewer !== undefined) {
    result.reviewer = reviewer;
  }

  return result;
}
