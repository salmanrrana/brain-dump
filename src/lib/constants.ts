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

// Status labels for tickets
export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  ready: "Ready",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};
