// Shared color options for projects and epics
export const COLOR_OPTIONS = [
  { value: "", label: "Default" },
  { value: "#ef4444", label: "Red" },
  { value: "#f97316", label: "Orange" },
  { value: "#eab308", label: "Yellow" },
  { value: "#22c55e", label: "Green" },
  { value: "#06b6d4", label: "Cyan" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#8b5cf6", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
] as const;

// Status options for ticket forms (full list including AI review states)
export const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "ai_review", label: "AI Review" },
  { value: "human_review", label: "Human Review" },
  { value: "done", label: "Done" },
] as const;

/**
 * Status columns in display order for the Kanban board.
 * Shared between KanbanBoard and keyboard navigation hook.
 */
export const COLUMN_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "ai_review",
  "human_review",
  "done",
] as const;

// Priority options for ticket forms
export const PRIORITY_OPTIONS = [
  { value: "", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

// Status ordering for sorting (lower = earlier in workflow, unique values for distinct sorting)
export const STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  ready: 1,
  in_progress: 2,
  ai_review: 3,
  human_review: 4,
  done: 5,
};

// Priority ordering for sorting (lower = higher priority)
export const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  "": 3, // No priority = lowest
};

// Status color utility for UI styling
export function getStatusColor(status: string): string {
  switch (status) {
    case "done":
      return "text-green-400";
    case "in_progress":
      return "text-amber-400";
    case "ai_review":
    case "human_review":
      return "text-purple-400";
    case "ready":
      return "text-blue-400";
    default:
      return "text-slate-400";
  }
}

// Priority style utility for UI styling
export function getPriorityStyle(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-red-900/50 text-red-300";
    case "medium":
      return "bg-yellow-900/50 text-yellow-300";
    default:
      return "bg-green-900/50 text-green-300";
  }
}

// Polling intervals in milliseconds for consistent timing across the app
export const POLLING_INTERVALS = {
  /** Polling interval for service discovery (running dev servers) */
  SERVICES: 5000,
  /** Polling interval for comments during active work (Ralph/Claude updates) */
  COMMENTS_ACTIVE: 3000,
  /** No polling - used when feature is disabled */
  DISABLED: 0,
} as const;

// PR status type for type safety
export type PrStatus = "draft" | "open" | "merged" | "closed";

// PR status icon color utility for UI styling
export function getPrStatusIconColor(status: string | null | undefined): string {
  switch (status) {
    case "merged":
      return "text-purple-400";
    case "closed":
      return "text-red-400";
    case "draft":
      return "text-slate-400";
    default:
      return "text-green-400";
  }
}

// PR status badge style utility for UI styling (icon + background)
export function getPrStatusBadgeStyle(status: string | null | undefined): string {
  switch (status) {
    case "merged":
      return "bg-purple-900/50 text-purple-300";
    case "closed":
      return "bg-red-900/50 text-red-300";
    case "draft":
      return "bg-slate-700 text-slate-300";
    default:
      return "bg-green-900/50 text-green-300";
  }
}

// Status badge configuration for consistent styling across components
export const STATUS_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  backlog: { label: "Backlog", className: "bg-slate-700 text-slate-300" },
  ready: { label: "Ready", className: "bg-blue-900/50 text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-amber-900/50 text-amber-300" },
  ai_review: { label: "AI Review", className: "bg-orange-900/50 text-orange-300" },
  human_review: { label: "Human Review", className: "bg-rose-900/50 text-rose-300" },
  done: { label: "Done", className: "bg-green-900/50 text-green-300" },
};

// Priority badge configuration for consistent styling across components
export const PRIORITY_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-900/50 text-red-300" },
  medium: { label: "Medium", className: "bg-yellow-900/50 text-yellow-300" },
  low: { label: "Low", className: "bg-green-900/50 text-green-300" },
};

// Get status label from status value
export function getStatusLabel(status: string): string {
  return STATUS_BADGE_CONFIG[status]?.label ?? status;
}
