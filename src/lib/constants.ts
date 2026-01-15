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
  { value: "review", label: "Review" },
  { value: "ai_review", label: "AI Review" },
  { value: "human_review", label: "Human Review" },
  { value: "done", label: "Done" },
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
  review: 3,
  ai_review: 4,
  human_review: 5,
  done: 6,
};

// Priority ordering for sorting (lower = higher priority)
export const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  "": 3, // No priority = lowest
};

// Status labels for tickets (kept for backwards compatibility)
export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};
