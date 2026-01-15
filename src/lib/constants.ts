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

// Status color utility for UI styling
export function getStatusColor(status: string): string {
  switch (status) {
    case "done":
      return "text-green-400";
    case "in_progress":
      return "text-amber-400";
    case "review":
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
