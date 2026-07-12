import {
  KANBAN_STATUSES,
  TICKET_STATUSES,
  TICKET_STATUS_METADATA,
  WORKFLOW_TRANSITIONS,
  type WorkflowTransitionAction,
} from "./workflow-steps.ts";

export interface WorkflowPhaseSpec {
  title: string;
  summary: string;
  toolCalls: readonly string[];
}

export const WORKFLOW_PHASES: readonly WorkflowPhaseSpec[] = [
  {
    title: "Implementation",
    summary:
      "start-work -> create or reuse a session -> implement -> validate -> commit -> complete-work. Skip this phase only when the selected ticket is already in ai_review.",
    toolCalls: [
      'workflow({ action: "start-work", ticketId })',
      'session({ action: "create", ticketId }) or session({ action: "get", ticketId })',
      'comment({ action: "add", ticketId, content, commentType: "test_report" })',
      'workflow({ action: "complete-work", ticketId, summary })',
    ],
  },
  {
    title: "AI Review",
    summary:
      "Self-review the diff, submit every finding through Brain Dump, fix critical/major findings, then check completion.",
    toolCalls: [
      'review({ action: "get-findings", ticketId })',
      'review({ action: "submit-finding", ticketId, agent, severity, category, description })',
      'review({ action: "mark-fixed", findingId, fixStatus: "fixed" })',
      'review({ action: "check-complete", ticketId })',
    ],
  },
  {
    title: "Demo",
    summary:
      "Generate 3-7 test steps after review completion, including criterion coverage references plus automation specs for visual/automated UI, API, command, or file checks. Use coverageRationale only for non-certifiable criteria and name each criterion id; rationale keeps the run uncertified. This moves the ticket to ai_verification for runner certification.",
    toolCalls: [
      'review({ action: "generate-demo", ticketId, steps }) with covers references and automation specs on visual/automated steps',
    ],
  },
  {
    title: "Stop",
    summary:
      "Complete the Ralph session and stop. Never run verification or move the ticket to done yourself.",
    toolCalls: ['session({ action: "complete", sessionId, outcome: "success" })'],
  },
];

export const VALIDATION_GATE_RULES = [
  "Before complete-work: Discover and run this project's validation commands from docs/config.",
  "Read AGENTS.md, CLAUDE.md, README, CONTRIBUTING, package scripts, pyproject.toml, go.mod, Makefile/Justfile, and CI files before choosing commands.",
  "Use the project's own commands, not Brain Dump's commands. Do not assume pnpm, npm, TypeScript, lint, or test scripts exist.",
  "If no automated validation command is discoverable, perform a targeted manual smoke check and record that no project validation command was found.",
  "Before complete-work, add a test_report comment with exact pass/fail/skipped command results and omit author so Brain Dump auto-detects the provider.",
  "Before demo, all critical/major findings must be fixed and check-complete must allow verification handoff.",
  "Before session completion, generate-demo must have been called and the ticket must be in ai_verification.",
] as const;

export const HARD_GUARDS = [
  "Do not use local substitutes for Brain Dump MCP/CLI workflow actions.",
  "Do not skip review check-complete before generate-demo.",
  "Do not run verification yourself.",
  "Do not move tickets to done yourself.",
  "Do not continue to another ticket after demo handoff.",
] as const;

export const SESSION_STATES = [
  "analyzing",
  "implementing",
  "testing",
  "committing",
  "reviewing",
] as const;

const TRANSITION_ACTION_LABELS: Record<WorkflowTransitionAction, string> = {
  "start-work": "workflow start-work",
  "complete-work": "workflow complete-work",
  "submit-finding": "review submit-finding",
  "generate-demo": "review generate-demo",
  "verify-pass": "verification runner certified pass",
  "verify-fail": "verification runner failure loop-back",
  "reconcile-learnings": "reconcile learnings",
};

export function getStatusFlowText(): string {
  return TICKET_STATUSES.join(" -> ");
}

/**
 * Shared doctrine for how agents reach Brain Dump workflow actions. Prompts
 * write actions in `brain-dump` CLI form because the CLI works in every
 * provider; MCP tools are an equivalent alternative wherever they are
 * configured. Without the explicit "missing MCP is not an error" rule,
 * CLI-only providers (e.g. Pi) can read MCP-flavored instructions literally
 * and bail out with "MCP tools unavailable" instead of using the CLI.
 */
export function renderWorkflowToolAccess(): string {
  return `## Workflow Tool Access

Brain Dump workflow actions are written as \`brain-dump\` CLI commands (run them with your shell tool). If the Brain Dump MCP tools (\`workflow\`, \`ticket\`, \`session\`, \`review\`, \`comment\`) are available in your environment, each command has an identical MCP action you may use instead — CLI and MCP are interchangeable.

- Missing MCP tools are NOT an error: use the \`brain-dump\` CLI and keep working. Do not stop because MCP tools are unavailable.
- If a \`brain-dump\` command fails, treat it like a failed MCP action: read the error output, fix the inputs, and retry. Do not silently skip the workflow step.
- If \`brain-dump\` cannot run at all (not on PATH, no working install) and no MCP tools are available, record the blocker in \`plans/progress.txt\`, output the exact token \`WORKFLOW_TOOLS_UNAVAILABLE\`, and stop. Do not move on to other tickets; every ticket needs the same tools.
- Never substitute raw git commands, direct file edits, or status guesses for these workflow actions.`;
}

export function renderScopeConstraints(): string {
  return `## Scope: plans/prd.json is the ONLY ticket source

Before anything else, read \`plans/prd.json\` from the project root. That file contains the tickets this Ralph run is scoped to (one epic, or a single ticket). It is the authoritative task list.

1. FIRST action every iteration: read \`plans/prd.json\` and find entries where \`passes: false\`.
2. For each \`passes: false\` candidate, run \`brain-dump ticket get --ticket <id> --pretty\` to check \`status\`. The PRD's \`passes\` flag can lag behind real ticket status between iterations.
3. If any candidate is already \`ai_review\`, pick ONE of those first and resume at the AI Review phase. Do NOT call \`start-work\` or \`complete-work\` for it; use \`brain-dump review get-findings --ticket <id> --status open --pretty\`, fix open critical/major findings, \`brain-dump review check-complete --ticket <id> --pretty\`, then \`brain-dump review generate-demo --ticket <id> --steps-file <steps.json> --pretty\`.
4. Otherwise pick ONE candidate whose status is \`backlog\`, \`ready\`, or \`in_progress\` and work only on that ticket through the full implementation workflow.
5. Skip candidates whose status is \`done\`; those are already complete. Tickets in \`ai_verification\` are incomplete but waiting on the verification runner, not implementation.
6. Do NOT run \`brain-dump ticket list\` (or the \`ticket\` list action) across the whole project to discover work. The PRD is scoped; the project backlog is not.
7. Do NOT pick tickets whose IDs do not appear in \`plans/prd.json\`, even if they look related or higher-priority.
8. If every PRD entry is either \`passes: true\` or has ticket status \`done\`, output the exact token \`PRD_COMPLETE\` and stop. Do not look for more work outside the PRD. A ticket in \`ai_review\` or \`ai_verification\` is NOT complete; resume/retry only when the workflow instructions say to.
9. If \`plans/prd.json\` is missing or empty, output \`PRD_COMPLETE\` and stop. Do not fall back to project-wide ticket discovery.`;
}

export function renderRalphWorkflowPhases(): string {
  return `## 4-Phase Workflow

Use Brain Dump workflow actions literally — \`brain-dump\` CLI commands or their MCP tool equivalents. No local substitutes for branching, review, or status updates.

${WORKFLOW_PHASES.map((phase, index) => `${index + 1}. **${phase.title}** - ${phase.summary}`).join("\n")}

If all tickets are \`done\`, output: \`PRD_COMPLETE\`.`;
}

export function renderWorkflowRules(): string {
  return `## Rules
- Strict phase order: Implementation -> AI Review -> Demo -> STOP
- ONE ticket per iteration, minimal focused changes
- Never run verification or move tickets to done; the runner owns completion
- If stuck, note progress in \`plans/progress.txt\` and move to next ticket
- Scope is fixed by \`plans/prd.json\`. Never work on tickets outside it.`;
}

export function renderValidationChecklist(): string {
  return `## Gates
${VALIDATION_GATE_RULES.map((rule) => `- ${rule}`).join("\n")}`;
}

export function renderSessionStateTracking(ticketId = "<ticketId>"): string {
  return `## Session State Tracking

Use \`brain-dump session\` to keep progress and UI state accurate.

1. Create once after starting ticket work, or when resuming an \`ai_review\` ticket that has no active session:
   \`brain-dump session create --ticket ${ticketId} --pretty\`
   If an active session already exists, reuse it with \`brain-dump session get --ticket ${ticketId} --pretty\` instead of creating another.
2. Update state at each phase transition:
   \`brain-dump session update-state --session <sessionId> --state ${SESSION_STATES.join("|")} --message "..."\`
3. Complete after demo generation, then STOP:
   \`brain-dump session complete --session <sessionId> --outcome success --pretty\``;
}

export function renderHardGuards(): string {
  return `## Hard Guards
${HARD_GUARDS.map((guard) => `- ${guard}`).join("\n")}`;
}

export function renderMcpWorkflowPromptContent(): string {
  return `You are Ralph, the Brain Dump implementation agent.

Follow this workflow exactly:

${WORKFLOW_PHASES.map((phase, index) => `${index + 1}. ${phase.title}\n- ${phase.summary}\n${phase.toolCalls.map((call) => `- Call ${call}`).join("\n")}`).join("\n\n")}

Validation gates:
${VALIDATION_GATE_RULES.map((rule) => `- ${rule}`).join("\n")}

Hard guards:
${HARD_GUARDS.map((guard) => `- ${guard}`).join("\n")}`;
}

export function renderMcpSkillSection(): string {
  return `## Generated Workflow

Status flow: \`${getStatusFlowText()}\`

${WORKFLOW_PHASES.map(
  (phase, index) =>
    `### Step ${index + 1}: ${phase.title}\n\n${phase.summary}\n\n${phase.toolCalls.map((call) => `- \`${call}\``).join("\n")}`
).join("\n\n")}

### Validation Gates

${VALIDATION_GATE_RULES.map((rule) => `- ${rule}`).join("\n")}

### Hard Guards

${HARD_GUARDS.map((guard) => `- ${guard}`).join("\n")}`;
}

export function renderCursorRuleSection(): string {
  return `## Generated Workflow

Status flow: \`${getStatusFlowText()}\`

${WORKFLOW_PHASES.map((phase) => `- **${phase.title}**: ${phase.summary}`).join("\n")}

## Required MCP Actions

${WORKFLOW_PHASES.flatMap((phase) => phase.toolCalls)
  .map((call) => `- \`${call}\``)
  .join("\n")}

## Quality Gates

${VALIDATION_GATE_RULES.map((rule) => `- [ ] ${rule}`).join("\n")}

## Stop Conditions

${HARD_GUARDS.map((guard) => `- ${guard}`).join("\n")}`;
}

export function renderPiCliWorkflowSection(): string {
  return `## Generated CLI Workflow

Status flow: \`${getStatusFlowText()}\`

1. Inspect context: \`brain-dump context --ticket <ticket-id> --pretty\`.
2. Start work: \`brain-dump workflow start-work --ticket <ticket-id> --pretty\`.
3. Implement focused changes and run project validation discovered from docs/config.
4. Record validation before completion: \`brain-dump comment add --ticket <ticket-id> --type test_report --content "<commands and results>" --pretty\`. Stop if this command fails.
5. Commit with \`feat(<ticket-id>): <description>\`.
6. Complete work only after the test_report exists: \`brain-dump workflow complete-work --ticket <ticket-id> --summary "<summary>" --pretty\`.
7. Review: use \`brain-dump review submit-finding\`, \`brain-dump review mark-fixed\`, and \`brain-dump review check-complete --ticket <ticket-id> --pretty\`.
8. Demo: \`brain-dump review generate-demo --ticket <ticket-id> --steps-file <steps.json> --pretty\`; include automation specs for visual/automated UI, API, command, or file checks.
9. Stop after demo handoff. Do not approve or move the ticket to done.

### Validation Gates

${VALIDATION_GATE_RULES.map((rule) => `- ${rule}`).join("\n")}`;
}

export function renderPiPromptWorkflowSection(): string {
  return `## Generated Workflow Guardrails

- Use the \`brain-dump\` CLI only. Do not use MCP.
- Status flow: \`${getStatusFlowText()}\`.
- Run project validation discovered from docs/config before \`workflow complete-work\`.
- Record validation with \`brain-dump comment add --ticket <ticket-id> --type test_report --content "<commands and results>" --pretty\` before \`workflow complete-work\`; stop if the comment command fails.
- Use \`brain-dump review check-complete --ticket <ticket-id> --pretty\` before generating demo steps.
- Stop after \`brain-dump review generate-demo\`; do not approve or move tickets to done.`;
}

export function renderMermaidStatusDiagram(): string {
  return `This diagram is generated from \`core/workflow-steps.ts\`. Run \`pnpm workflow:prompts\` after changing workflow statuses or transitions.

\`\`\`mermaid
stateDiagram-v2
    [*] --> ${TICKET_STATUSES[0]}: ticket created
${WORKFLOW_TRANSITIONS.map((rule) => `    ${rule.from} --> ${rule.to}: ${rule.actions.map((action) => TRANSITION_ACTION_LABELS[action]).join(" / ")}`).join("\n")}
    ${TICKET_STATUSES[TICKET_STATUSES.length - 1]} --> [*]

${TICKET_STATUSES.map((status) => `    note right of ${status}: ${TICKET_STATUS_METADATA[status].label}`).join("\n")}
\`\`\``;
}

export function renderDocsStatusFlow(): string {
  const rows = TICKET_STATUSES.map((status) => {
    const metadata = TICKET_STATUS_METADATA[status];
    return [
      `\`${status}\``,
      metadata.label,
      metadata.active ? "yes" : "no",
      metadata.kanbanColumn ? "yes" : "no",
    ] as const;
  });
  const headers = ["Status", "Label", "Active", "Kanban column"] as const;
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? "").length))
  );
  const renderRow = (row: readonly string[]): string =>
    `| ${row.map((cell, index) => cell.padEnd(widths[index]!)).join(" | ")} |`;

  return `The enforced ticket status specification lives in \`core/workflow-steps.ts\`. Run \`pnpm workflow:prompts\` after changing workflow statuses or transitions.

Status flow: \`${getStatusFlowText()}\`

${renderRow(headers)}
${renderRow(widths.map((width) => "-".repeat(width)))}
${rows.map(renderRow).join("\n")}`;
}

export function renderKanbanWorkflowStatusSection(): string {
  return `${renderDocsStatusFlow()}

### Generated Kanban Columns

\`\`\`mermaid
flowchart LR
    subgraph Board["Kanban Board"]
${KANBAN_STATUSES.map((status, index) => `        subgraph Col${index + 1}["${TICKET_STATUS_METADATA[status].label}"]\n            T${index + 1}["Ticket"]\n        end`).join("\n")}
    end
\`\`\``;
}

export function renderHowToAddWorkflowStepDocs(): string {
  return `## Adding Or Changing A Workflow Step

The workflow source of truth is executable data, not hand-written prompt text.

1. Edit \`core/workflow-steps.ts\` for status order, metadata, and transition guards.
2. Edit \`core/workflow-prompt-spec.ts\` for provider-facing workflow phases, gates, or stop conditions.
3. Run \`pnpm workflow:prompts\` to regenerate provider skills/prompts and docs diagrams.
4. Run \`pnpm check\`. The drift gate fails if generated sections were hand-edited or not regenerated.`;
}
