import { type FC, useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Plus, Check, X } from "lucide-react";
import { useUpdateTicket } from "../../lib/hooks";

// =============================================================================
// Types
// =============================================================================

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface SubtasksProgressProps {
  /** Ticket ID for persisting changes */
  ticketId: string;
  /** Array of subtasks to display */
  subtasks: Subtask[];
  /** Callback when subtasks are updated (for optimistic UI) */
  onUpdate?: (subtasks: Subtask[]) => void;
  /** Whether editing is disabled (e.g., ticket is done) */
  disabled?: boolean;
  /** Test ID for testing */
  testId?: string;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique ID for subtasks.
 * Uses timestamp + random string for uniqueness.
 */
function generateSubtaskId(): string {
  return `subtask-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// =============================================================================
// SubtaskProgressItem Component
// =============================================================================

interface SubtaskProgressItemProps {
  subtask: Subtask;
  onToggle: (id: string) => void;
  disabled?: boolean | undefined;
  isPending?: boolean | undefined;
}

const SubtaskProgressItem: FC<SubtaskProgressItemProps> = ({
  subtask,
  onToggle,
  disabled,
  isPending,
}) => {
  const handleToggle = useCallback(() => {
    if (!disabled) {
      onToggle(subtask.id);
    }
  }, [disabled, onToggle, subtask.id]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if ((e.key === "Enter" || e.key === " ") && !disabled) {
        e.preventDefault();
        onToggle(subtask.id);
      }
    },
    [disabled, onToggle, subtask.id]
  );

  return (
    <div
      role="checkbox"
      aria-checked={subtask.completed}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      style={{
        ...itemStyles,
        cursor: disabled ? "default" : "pointer",
        opacity: isPending ? 0.7 : 1,
      }}
      className="hover:bg-[var(--bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-1 focus:ring-offset-[var(--bg-primary)]"
    >
      <span style={subtask.completed ? checkboxCheckedStyles : checkboxStyles} aria-hidden="true">
        {subtask.completed ? "☑" : "☐"}
      </span>
      <span style={subtask.completed ? textCompletedStyles : textStyles}>{subtask.text}</span>
    </div>
  );
};

// =============================================================================
// AddSubtaskInline Component
// =============================================================================

interface AddSubtaskInlineProps {
  onAdd: (text: string) => void;
  disabled?: boolean | undefined;
}

const AddSubtaskInline: FC<AddSubtaskInlineProps> = ({ onAdd, disabled }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when adding mode is activated
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed) {
      onAdd(trimmed);
      setText("");
      // Stay in adding mode for quick multiple adds
      inputRef.current?.focus();
    }
  }, [text, onAdd]);

  const handleCancel = useCallback(() => {
    setText("");
    setIsAdding(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSubmit, handleCancel]
  );

  if (disabled) {
    return null;
  }

  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        style={addButtonStyles}
        className="hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
        aria-label="Add subtask"
      >
        <Plus size={14} />
        Add subtask
      </button>
    );
  }

  return (
    <div style={addFormStyles}>
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter subtask..."
        style={inputStyles}
        className="focus:border-[var(--accent-primary)]"
        aria-label="New subtask text"
      />
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!text.trim()}
        style={{
          ...iconButtonStyles,
          color: text.trim() ? "var(--success)" : "var(--text-muted)",
        }}
        className="hover:bg-[var(--success)]/10"
        aria-label="Confirm add"
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        onClick={handleCancel}
        style={iconButtonStyles}
        className="hover:bg-[var(--bg-hover)]"
        aria-label="Cancel add"
      >
        <X size={14} />
      </button>
    </div>
  );
};

// =============================================================================
// SubtasksProgress Component
// =============================================================================

/**
 * SubtasksProgress - Progress bar and interactive checklist for ticket detail view.
 *
 * Features:
 * - **Progress bar**: Visual completion percentage
 * - **Completion text**: "X of Y complete (N%)"
 * - **Interactive checklist**: Click/keyboard to toggle completion
 * - **Add subtask inline**: Quick add new subtasks
 * - **Empty state**: Shows "No subtasks" message
 * - **Persists changes**: Uses updateTicket mutation
 * - **Keyboard accessible**: Full Tab/Enter/Space support
 *
 * @example
 * ```tsx
 * <SubtasksProgress
 *   ticketId="abc-123"
 *   subtasks={subtasks}
 *   onUpdate={(updated) => setSubtasks(updated)}
 * />
 * ```
 */
export const SubtasksProgress: FC<SubtasksProgressProps> = ({
  ticketId,
  subtasks,
  onUpdate,
  disabled,
  testId,
}) => {
  const updateTicketMutation = useUpdateTicket();

  // Computed values
  const totalCount = subtasks.length;
  const completedCount = subtasks.filter((s) => s.completed).length;
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllComplete = completedCount === totalCount && totalCount > 0;

  // Handle toggling a subtask's completion
  const handleToggle = useCallback(
    (subtaskId: string) => {
      const updated = subtasks.map((s) =>
        s.id === subtaskId ? { ...s, completed: !s.completed } : s
      );

      // Optimistic update
      onUpdate?.(updated);

      // Persist to database
      updateTicketMutation.mutate({
        id: ticketId,
        updates: { subtasks: updated },
      });
    },
    [subtasks, ticketId, onUpdate, updateTicketMutation]
  );

  // Handle adding a new subtask
  const handleAdd = useCallback(
    (text: string) => {
      const newSubtask: Subtask = {
        id: generateSubtaskId(),
        text,
        completed: false,
      };
      const updated = [...subtasks, newSubtask];

      // Optimistic update
      onUpdate?.(updated);

      // Persist to database
      updateTicketMutation.mutate({
        id: ticketId,
        updates: { subtasks: updated },
      });
    },
    [subtasks, ticketId, onUpdate, updateTicketMutation]
  );

  return (
    <div style={containerStyles} data-testid={testId}>
      {/* Header with title and progress text */}
      <div style={headerStyles}>
        <h3 style={titleStyles}>Subtasks</h3>
        {totalCount > 0 && (
          <span style={{ ...countStyles, color: isAllComplete ? "#22c55e" : "var(--text-muted)" }}>
            {completedCount}/{totalCount} complete ({percentage}%)
          </span>
        )}
      </div>

      {/* Progress bar (only show if there are subtasks) */}
      {totalCount > 0 && (
        <div
          style={progressBarContainerStyles}
          role="progressbar"
          aria-valuenow={completedCount}
          aria-valuemin={0}
          aria-valuemax={totalCount}
          aria-label={`${completedCount} of ${totalCount} subtasks complete`}
        >
          <div
            style={{
              ...progressBarFillStyles,
              width: `${percentage}%`,
              backgroundColor: isAllComplete ? "#22c55e" : "var(--accent-primary)",
            }}
          />
        </div>
      )}

      {/* Subtask list or empty state */}
      {totalCount === 0 ? (
        <p style={emptyStateStyles}>No subtasks</p>
      ) : (
        <div style={listStyles} role="group" aria-label="Subtasks checklist">
          {subtasks.map((subtask) => (
            <SubtaskProgressItem
              key={subtask.id}
              subtask={subtask}
              onToggle={handleToggle}
              disabled={disabled}
              isPending={updateTicketMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Add subtask inline */}
      <AddSubtaskInline onAdd={handleAdd} disabled={disabled} />
    </div>
  );
};

// =============================================================================
// Styles
// =============================================================================

const containerStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-3)",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--spacing-2)",
};

const titleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: 0,
};

const countStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const progressBarContainerStyles: React.CSSProperties = {
  height: "8px",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-full)",
  overflow: "hidden",
};

const progressBarFillStyles: React.CSSProperties = {
  height: "100%",
  borderRadius: "var(--radius-full)",
  transition: "width 0.3s ease, background-color 0.3s ease",
};

const listStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-1)",
};

const itemStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  transition: "background 0.15s, opacity 0.15s",
};

const checkboxStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  color: "var(--text-muted)",
  flexShrink: 0,
};

const checkboxCheckedStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  color: "var(--accent-primary)",
  flexShrink: 0,
};

const textStyles: React.CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  flex: 1,
};

const textCompletedStyles: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--font-size-sm)",
  textDecoration: "line-through",
  flex: 1,
};

const emptyStateStyles: React.CSSProperties = {
  color: "var(--text-muted)",
  fontStyle: "italic",
  padding: "var(--spacing-4)",
  background: "var(--bg-secondary)",
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-primary)",
  textAlign: "center",
  margin: 0,
};

const addButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--spacing-1)",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "transparent",
  border: "1px dashed var(--border-primary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-sm)",
  cursor: "pointer",
  transition: "all 0.15s",
  width: "100%",
  justifyContent: "center",
};

const addFormStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const inputStyles: React.CSSProperties = {
  flex: 1,
  padding: "var(--spacing-2)",
  background: "var(--bg-primary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  outline: "none",
  transition: "border-color 0.15s",
};

const iconButtonStyles: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "28px",
  height: "28px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  color: "var(--text-muted)",
  cursor: "pointer",
  transition: "all 0.15s",
  flexShrink: 0,
};

export default SubtasksProgress;
