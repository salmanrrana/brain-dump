import { type FC, useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Plus, X, Check, Pencil } from "lucide-react";

// =============================================================================
// Types
// =============================================================================

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface SubtaskListProps {
  /** Array of subtasks to display and manage */
  value: Subtask[];
  /** Handler called when subtasks change (add, delete, toggle, edit) */
  onChange: (subtasks: Subtask[]) => void;
  /** Whether the list is disabled */
  disabled?: boolean;
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
// SubtaskItem Component
// =============================================================================

interface SubtaskItemProps {
  subtask: Subtask;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  disabled?: boolean | undefined;
}

const SubtaskItem: FC<SubtaskItemProps> = ({ subtask, onToggle, onDelete, onEdit, disabled }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(subtask.text);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    if (disabled) return;
    setEditText(subtask.text);
    setIsEditing(true);
  }, [disabled, subtask.text]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== subtask.text) {
      onEdit(subtask.id, trimmed);
    }
    setIsEditing(false);
  }, [editText, subtask.id, subtask.text, onEdit]);

  const handleCancelEdit = useCallback(() => {
    setEditText(subtask.text);
    setIsEditing(false);
  }, [subtask.text]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSaveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  // Styles
  const itemStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-2)",
    borderRadius: "var(--radius-md)",
    transition: "background var(--transition-fast)",
  };

  const checkboxStyles: React.CSSProperties = {
    width: "18px",
    height: "18px",
    cursor: disabled ? "not-allowed" : "pointer",
    accentColor: "var(--accent-primary)",
    flexShrink: 0,
  };

  const textStyles: React.CSSProperties = {
    flex: 1,
    color: subtask.completed ? "var(--text-muted)" : "var(--text-primary)",
    textDecoration: subtask.completed ? "line-through" : "none",
    fontSize: "var(--font-size-sm)",
    cursor: disabled ? "default" : "pointer",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const inputStyles: React.CSSProperties = {
    flex: 1,
    padding: "var(--spacing-1) var(--spacing-2)",
    background: "var(--bg-primary)",
    border: "1px solid var(--accent-primary)",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    outline: "none",
    minWidth: 0,
  };

  const buttonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-muted)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    flexShrink: 0,
  };

  const deleteButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    color: "#ef4444",
    opacity: 0.6,
  };

  return (
    <li style={itemStyles} className="hover:bg-[var(--bg-hover)]">
      <input
        type="checkbox"
        checked={subtask.completed}
        onChange={() => onToggle(subtask.id)}
        disabled={disabled}
        style={checkboxStyles}
        aria-label={`Mark "${subtask.text}" as ${subtask.completed ? "incomplete" : "complete"}`}
      />

      {isEditing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSaveEdit}
            style={inputStyles}
            aria-label="Edit subtask text"
          />
          <button
            type="button"
            onClick={handleSaveEdit}
            style={{ ...buttonStyles, color: "var(--success)" }}
            aria-label="Save edit"
            className="hover:bg-[var(--success)]/10"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={handleCancelEdit}
            style={buttonStyles}
            aria-label="Cancel edit"
            className="hover:bg-[var(--bg-hover)]"
          >
            <X size={14} />
          </button>
        </>
      ) : (
        <>
          <span
            style={textStyles}
            onDoubleClick={handleStartEdit}
            title={disabled ? undefined : "Double-click to edit"}
          >
            {subtask.text}
          </span>
          {!disabled && (
            <>
              <button
                type="button"
                onClick={handleStartEdit}
                style={buttonStyles}
                aria-label={`Edit "${subtask.text}"`}
                className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(subtask.id)}
                style={deleteButtonStyles}
                aria-label={`Delete "${subtask.text}"`}
                className="hover:bg-red-500/10 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </>
          )}
        </>
      )}
    </li>
  );
};

// =============================================================================
// SubtaskList Component
// =============================================================================

/**
 * SubtaskList - A component for managing a list of subtasks.
 *
 * Features:
 * - **Progress indicator**: Shows X of Y complete
 * - **Checkbox toggle**: Mark subtasks complete/incomplete
 * - **Inline editing**: Double-click or click edit button
 * - **Add subtask**: Input field with Enter to add
 * - **Delete subtask**: X button per item
 * - **Keyboard accessible**: Full keyboard support
 *
 * @example
 * ```tsx
 * const [subtasks, setSubtasks] = useState<Subtask[]>([]);
 * return <SubtaskList value={subtasks} onChange={setSubtasks} />;
 * ```
 */
export const SubtaskList: FC<SubtaskListProps> = ({ value, onChange, disabled }) => {
  const [newSubtaskText, setNewSubtaskText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Computed values
  const completedCount = value.filter((s) => s.completed).length;
  const totalCount = value.length;

  // Handlers
  const handleToggle = useCallback(
    (id: string) => {
      if (disabled) return;
      onChange(value.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)));
    },
    [value, onChange, disabled]
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (disabled) return;
      onChange(value.filter((s) => s.id !== id));
    },
    [value, onChange, disabled]
  );

  const handleEdit = useCallback(
    (id: string, text: string) => {
      if (disabled) return;
      onChange(value.map((s) => (s.id === id ? { ...s, text } : s)));
    },
    [value, onChange, disabled]
  );

  const handleAddSubtask = useCallback(() => {
    const trimmed = newSubtaskText.trim();
    if (!trimmed || disabled) return;

    const newSubtask: Subtask = {
      id: generateSubtaskId(),
      text: trimmed,
      completed: false,
    };

    onChange([...value, newSubtask]);
    setNewSubtaskText("");
    inputRef.current?.focus();
  }, [newSubtaskText, value, onChange, disabled]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddSubtask();
      }
    },
    [handleAddSubtask]
  );

  // Styles
  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-2)",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "var(--spacing-1)",
  };

  const progressStyles: React.CSSProperties = {
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  };

  const progressCountStyles: React.CSSProperties = {
    color: completedCount === totalCount && totalCount > 0 ? "#22c55e" : "var(--text-muted)",
  };

  const listStyles: React.CSSProperties = {
    listStyle: "none",
    padding: 0,
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
  };

  const emptyStateStyles: React.CSSProperties = {
    color: "var(--text-muted)",
    fontSize: "var(--font-size-sm)",
    fontStyle: "italic",
    padding: "var(--spacing-2) 0",
  };

  const addContainerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    marginTop: "var(--spacing-2)",
  };

  const addInputStyles: React.CSSProperties = {
    flex: 1,
    padding: "var(--spacing-2)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-sm)",
    outline: "none",
    transition: "border-color var(--transition-fast)",
  };

  const addButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "transparent",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    transition: "all var(--transition-fast)",
  };

  return (
    <div style={containerStyles}>
      {/* Header with progress */}
      <div style={headerStyles}>
        <span style={progressStyles}>
          Subtasks{" "}
          <span style={progressCountStyles}>
            ({completedCount}/{totalCount} complete)
          </span>
        </span>
      </div>

      {/* Subtask list */}
      {totalCount === 0 ? (
        <p style={emptyStateStyles}>No subtasks yet. Add one below.</p>
      ) : (
        <ul style={listStyles} role="list" aria-label="Subtasks">
          {value.map((subtask) => (
            <SubtaskItem
              key={subtask.id}
              subtask={subtask}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={handleEdit}
              disabled={disabled}
            />
          ))}
        </ul>
      )}

      {/* Add subtask input */}
      {!disabled && (
        <div style={addContainerStyles}>
          <input
            ref={inputRef}
            type="text"
            value={newSubtaskText}
            onChange={(e) => setNewSubtaskText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a subtask..."
            style={addInputStyles}
            className="focus:border-[var(--accent-primary)]"
            aria-label="New subtask text"
          />
          <button
            type="button"
            onClick={handleAddSubtask}
            disabled={!newSubtaskText.trim()}
            style={{
              ...addButtonStyles,
              opacity: newSubtaskText.trim() ? 1 : 0.5,
              cursor: newSubtaskText.trim() ? "pointer" : "not-allowed",
            }}
            className="hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)]"
            aria-label="Add subtask"
          >
            <Plus size={14} />
            Add
          </button>
        </div>
      )}
    </div>
  );
};

export default SubtaskList;
