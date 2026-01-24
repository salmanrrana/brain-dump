import { useState, useMemo, memo } from "react";
import { ChevronDown, Bot, CheckCircle2, Circle, PlayCircle } from "lucide-react";
import { useClaudeTasks, type ClaudeTask, type ClaudeTaskStatus } from "../../lib/hooks";
import { POLLING_INTERVALS } from "../../lib/constants";

export interface ClaudeTasksProps {
  /** The ticket ID to display tasks for */
  ticketId: string;
  /** The ticket status - used to determine polling interval */
  ticketStatus: string;
  /** Whether the section is initially expanded (default: true) */
  defaultExpanded?: boolean;
}

/**
 * Status icon mapping for task statuses.
 * Uses consistent visual indicators across the UI.
 */
const STATUS_ICONS: Record<ClaudeTaskStatus, typeof Circle> = {
  pending: Circle,
  in_progress: PlayCircle,
  completed: CheckCircle2,
};

const STATUS_COLORS: Record<ClaudeTaskStatus, string> = {
  pending: "text-[var(--text-tertiary)]",
  in_progress: "text-[var(--accent-ai)]",
  completed: "text-[var(--success)]",
};

/**
 * ClaudeTasks - Displays tasks created by Claude while working on a ticket.
 *
 * Features:
 * - Collapsible section with task count in header
 * - Visual status indicators (pending, in_progress, completed)
 * - Auto-polls for updates when ticket is in progress
 * - Shows active form text for in-progress tasks
 * - Graceful empty state
 */
export function ClaudeTasks({ ticketId, ticketStatus, defaultExpanded = true }: ClaudeTasksProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Poll for updates when ticket is in progress (Ralph might be working)
  const pollingInterval =
    ticketStatus === "in_progress" ? POLLING_INTERVALS.COMMENTS_ACTIVE : POLLING_INTERVALS.DISABLED;

  const { tasks, loading, error } = useClaudeTasks(ticketId, { pollingInterval });

  // Compute task counts by status
  const statusCounts = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        const status = task.status as ClaudeTaskStatus;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { pending: 0, in_progress: 0, completed: 0 } as Record<ClaudeTaskStatus, number>
    );
  }, [tasks]);

  const totalTasks = tasks.length;
  const completedTasks = statusCounts.completed;
  const hasInProgress = statusCounts.in_progress > 0;

  // Don't render anything if there are no tasks and not loading
  if (!loading && totalTasks === 0 && !error) {
    return null;
  }

  return (
    <div className="border border-[var(--border-primary)] rounded-lg overflow-hidden">
      {/* Live region for screen readers to announce task updates */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {hasInProgress
          ? `Claude is currently working on ${statusCounts.in_progress} task${statusCounts.in_progress > 1 ? "s" : ""}`
          : totalTasks > 0
            ? `${completedTasks} of ${totalTasks} tasks completed`
            : ""}
      </div>

      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors"
        aria-expanded={isExpanded}
        aria-controls="claude-tasks-content"
      >
        <Bot size={16} className="text-[var(--accent-ai)] flex-shrink-0" />
        <span className="text-sm font-medium text-[var(--text-primary)]">Claude Tasks</span>

        {/* Task count badge */}
        {totalTasks > 0 && (
          <span className="text-xs text-[var(--text-tertiary)]">
            ({completedTasks}/{totalTasks} complete)
          </span>
        )}

        {/* In progress indicator */}
        {hasInProgress && (
          <span className="relative flex h-2 w-2 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-ai)] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-ai)]" />
          </span>
        )}

        <ChevronDown
          size={16}
          className={`ml-auto text-[var(--text-tertiary)] transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Content */}
      {isExpanded && (
        <div id="claude-tasks-content" className="p-3">
          {/* Loading state */}
          {loading && (
            <ul className="space-y-1.5" role="list" aria-label="Loading tasks">
              {[1, 2, 3].map((i) => (
                <li key={i} className="flex items-start gap-2 py-1">
                  <div className="w-4 h-4 bg-[var(--bg-hover)] rounded-full animate-pulse mt-0.5 flex-shrink-0" />
                  <div className="flex-1 h-4 bg-[var(--bg-hover)] rounded animate-pulse" />
                </li>
              ))}
            </ul>
          )}

          {/* Error state */}
          {error && (
            <div className="text-sm text-[var(--accent-danger)] py-2">
              Failed to load tasks: {typeof error === "string" ? error : error.message}
            </div>
          )}

          {/* Empty state (shown only if loaded with no tasks) */}
          {!loading && !error && totalTasks === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] py-2 text-center">
              No tasks recorded for this ticket.
            </p>
          )}

          {/* Task list */}
          {!loading && !error && totalTasks > 0 && (
            <ul className="space-y-1.5" role="list" aria-label="Claude tasks">
              {tasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface TaskItemProps {
  task: ClaudeTask;
}

/**
 * Individual task item with status icon and text.
 * Memoized with custom comparison to prevent re-renders when only parent updates.
 */
const TaskItem = memo(
  function TaskItem({ task }: TaskItemProps) {
    const status = task.status as ClaudeTaskStatus;
    const StatusIcon = STATUS_ICONS[status];
    const colorClass = STATUS_COLORS[status];

    return (
      <li className="flex items-start gap-2 py-1">
        <StatusIcon size={16} className={`flex-shrink-0 mt-0.5 ${colorClass}`} />
        <div className="flex-1 min-w-0">
          <span
            className={`text-sm block ${
              task.status === "completed"
                ? "text-[var(--text-tertiary)] line-through"
                : "text-[var(--text-primary)]"
            }`}
          >
            {task.subject}
          </span>

          {/* Show active form for in-progress tasks */}
          {task.status === "in_progress" && task.activeForm && (
            <span className="text-xs text-[var(--accent-ai)] italic block mt-0.5">
              {task.activeForm}...
            </span>
          )}

          {/* Show description if present and task is expanded (future enhancement) */}
          {task.description && (
            <span className="text-xs text-[var(--text-tertiary)] block mt-0.5">
              {task.description}
            </span>
          )}
        </div>
      </li>
    );
  },
  (prevProps, nextProps) => {
    // Return true if props are equal (don't re-render)
    return (
      prevProps.task.id === nextProps.task.id &&
      prevProps.task.subject === nextProps.task.subject &&
      prevProps.task.status === nextProps.task.status &&
      prevProps.task.activeForm === nextProps.task.activeForm &&
      prevProps.task.description === nextProps.task.description &&
      prevProps.task.completedAt === nextProps.task.completedAt
    );
  }
);

export default ClaudeTasks;
