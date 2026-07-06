/**
 * Canonical ticket workflow status specification.
 *
 * The adapter-level executable transition spec is
 * `mcp-server/tools/__tests__/status-transitions.test.ts`. Core transition
 * behavior is covered next to this module in `core/__tests__/workflow-steps.test.ts`.
 */

export const TICKET_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "ai_verification",
  "done",
] as const;

export const DIRECT_STATUS_UPDATE_STATUSES = ["backlog", "ready", "in_progress"] as const;

export const LEGACY_TICKET_STATUSES = ["human_review"] as const;

export type ActiveTicketStatus = (typeof TICKET_STATUSES)[number];
export type LegacyTicketStatus = (typeof LEGACY_TICKET_STATUSES)[number];
export type TicketStatus = ActiveTicketStatus | LegacyTicketStatus;

export interface TicketStatusMetadata {
  label: string;
  colorToken: string;
  kanbanColumn: boolean;
  workable: boolean;
  active: boolean;
}

export const TICKET_STATUS_METADATA: Record<TicketStatus, TicketStatusMetadata> = {
  backlog: {
    label: "Backlog",
    colorToken: "var(--status-backlog)",
    kanbanColumn: true,
    workable: true,
    active: false,
  },
  ready: {
    label: "Ready",
    colorToken: "var(--status-ready)",
    kanbanColumn: true,
    workable: true,
    active: false,
  },
  in_progress: {
    label: "In Progress",
    colorToken: "var(--status-in-progress)",
    kanbanColumn: true,
    workable: true,
    active: true,
  },
  ai_review: {
    label: "AI Review",
    colorToken: "var(--status-review)",
    kanbanColumn: true,
    workable: true,
    active: true,
  },
  ai_verification: {
    label: "AI Verification",
    colorToken: "var(--status-review)",
    kanbanColumn: true,
    workable: true,
    active: true,
  },
  human_review: {
    label: "Human Review (Legacy)",
    colorToken: "var(--status-review)",
    kanbanColumn: false,
    workable: false,
    active: false,
  },
  done: {
    label: "Done",
    colorToken: "var(--status-done)",
    kanbanColumn: true,
    workable: false,
    active: false,
  },
};

export const KANBAN_STATUSES = TICKET_STATUSES.filter(
  (status) => TICKET_STATUS_METADATA[status].kanbanColumn
);

export const OPEN_TICKET_STATUSES = TICKET_STATUSES.filter((status) => status !== "done");

export const RALPH_PRD_TICKET_STATUSES = [
  ...OPEN_TICKET_STATUSES,
  ...LEGACY_TICKET_STATUSES,
] as const;

export const STATUS_OPTIONS = TICKET_STATUSES.map((status) => ({
  value: status,
  label: TICKET_STATUS_METADATA[status].label,
}));

export const STATUS_ORDER: Record<TicketStatus, number> = {
  backlog: 0,
  ready: 1,
  in_progress: 2,
  ai_review: 3,
  ai_verification: 4,
  done: 5,
  human_review: 99,
};

export type WorkflowTransitionAction =
  | "start-work"
  | "complete-work"
  | "submit-finding"
  | "generate-demo"
  | "verify-pass"
  | "verify-fail"
  | "reconcile-learnings";

export interface WorkflowTransitionRule {
  from: TicketStatus;
  to: TicketStatus;
  actions: readonly WorkflowTransitionAction[];
}

export const WORKFLOW_TRANSITIONS: readonly WorkflowTransitionRule[] = [
  { from: "backlog", to: "in_progress", actions: ["start-work"] },
  { from: "ready", to: "in_progress", actions: ["start-work"] },
  { from: "in_progress", to: "in_progress", actions: ["start-work"] },
  { from: "in_progress", to: "ai_review", actions: ["complete-work"] },
  { from: "ai_review", to: "ai_review", actions: ["submit-finding"] },
  { from: "ai_review", to: "ai_verification", actions: ["generate-demo"] },
  { from: "ai_verification", to: "done", actions: ["verify-pass"] },
  { from: "ai_verification", to: "in_progress", actions: ["verify-fail"] },
  { from: "done", to: "done", actions: ["reconcile-learnings"] },
];

export class WorkflowTransitionError extends Error {
  constructor(
    public readonly from: TicketStatus,
    public readonly to: TicketStatus,
    public readonly action: WorkflowTransitionAction,
    public readonly allowedFrom: readonly TicketStatus[]
  ) {
    super(
      `Cannot ${action}: ticket transition ${from} -> ${to} is not allowed. Allowed from: ${allowedFrom.join(", ")}.`
    );
    this.name = "WorkflowTransitionError";
  }
}

export function isTicketStatus(value: string): value is TicketStatus {
  return (
    (TICKET_STATUSES as readonly string[]).includes(value) ||
    (LEGACY_TICKET_STATUSES as readonly string[]).includes(value)
  );
}

export function isActiveTicketStatus(value: string): value is ActiveTicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(value);
}

export function isDirectStatusUpdateStatus(
  value: string
): value is (typeof DIRECT_STATUS_UPDATE_STATUSES)[number] {
  return (DIRECT_STATUS_UPDATE_STATUSES as readonly string[]).includes(value);
}

export function canDirectlyUpdateTicketStatus(from: string, to: string): boolean {
  return isDirectStatusUpdateStatus(from) && isDirectStatusUpdateStatus(to);
}

export function getDirectStatusUpdateErrorMessage(from: string, to: string): string {
  return `Cannot directly set ticket status from ${from} to ${to}. Use workflow/review/verification actions for ai_review, ai_verification, and done transitions. Direct status updates are limited to transitions between: ${DIRECT_STATUS_UPDATE_STATUSES.join(", ")}.`;
}

export function getTicketStatusLabel(status: TicketStatus): string {
  return TICKET_STATUS_METADATA[status].label;
}

export function getTicketStatusColorToken(status: TicketStatus): string {
  return TICKET_STATUS_METADATA[status].colorToken;
}

export function getAllowedTransitionSources(
  to: TicketStatus,
  action: WorkflowTransitionAction
): TicketStatus[] {
  return WORKFLOW_TRANSITIONS.filter((rule) => rule.to === to && rule.actions.includes(action)).map(
    (rule) => rule.from
  );
}

export function canTransition(
  from: TicketStatus,
  to: TicketStatus,
  action: WorkflowTransitionAction
): boolean {
  return WORKFLOW_TRANSITIONS.some(
    (rule) => rule.from === from && rule.to === to && rule.actions.includes(action)
  );
}

export function assertTransition(
  from: TicketStatus,
  to: TicketStatus,
  action: WorkflowTransitionAction
): void {
  if (canTransition(from, to, action)) return;
  throw new WorkflowTransitionError(from, to, action, getAllowedTransitionSources(to, action));
}
