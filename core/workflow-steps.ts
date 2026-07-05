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
  "human_review",
  "done",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

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
  human_review: {
    label: "Human Review",
    colorToken: "var(--status-review)",
    kanbanColumn: true,
    workable: true,
    active: true,
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

export const STATUS_OPTIONS = TICKET_STATUSES.map((status) => ({
  value: status,
  label: TICKET_STATUS_METADATA[status].label,
}));

export const STATUS_ORDER: Record<TicketStatus, number> = {
  backlog: 0,
  ready: 1,
  in_progress: 2,
  ai_review: 3,
  human_review: 4,
  done: 5,
};

export type WorkflowTransitionAction =
  | "start-work"
  | "complete-work"
  | "submit-finding"
  | "generate-demo"
  | "submit-feedback-pass"
  | "submit-feedback-reject"
  | "reconcile-learnings";

interface TransitionRule {
  from: TicketStatus;
  to: TicketStatus;
  actions: readonly WorkflowTransitionAction[];
}

const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: "backlog", to: "in_progress", actions: ["start-work"] },
  { from: "ready", to: "in_progress", actions: ["start-work"] },
  { from: "in_progress", to: "in_progress", actions: ["start-work"] },
  { from: "in_progress", to: "ai_review", actions: ["complete-work"] },
  { from: "ai_review", to: "ai_review", actions: ["submit-finding"] },
  { from: "ai_review", to: "human_review", actions: ["generate-demo"] },
  { from: "human_review", to: "done", actions: ["submit-feedback-pass"] },
  { from: "human_review", to: "ready", actions: ["submit-feedback-reject"] },
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
  return (TICKET_STATUSES as readonly string[]).includes(value);
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
  return TRANSITION_RULES.filter((rule) => rule.to === to && rule.actions.includes(action)).map(
    (rule) => rule.from
  );
}

export function canTransition(
  from: TicketStatus,
  to: TicketStatus,
  action: WorkflowTransitionAction
): boolean {
  return TRANSITION_RULES.some(
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
