import { type FC, useState, useRef, useCallback, type FormEvent } from "react";
import { X, Loader2, Layers } from "lucide-react";
import { useCreateEpic, useClickOutside } from "../../lib/hooks";
import { ColorPicker, PRESET_COLORS } from "../ui/ColorPicker";

// =============================================================================
// Component Types
// =============================================================================

export interface CreateEpicModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** The project ID to create the epic in */
  projectId: string;
  /** The project name (for display context) */
  projectName?: string;
  /** Handler called when the modal should close */
  onClose: () => void;
  /** Handler called after successful creation, receives the new epic's ID */
  onSuccess?: (newEpicId: string) => void;
}

// =============================================================================
// Main CreateEpicModal Component
// =============================================================================

/**
 * CreateEpicModal - Modal for creating a new epic within a project.
 *
 * Features:
 * - **Title input**: Required field for epic name
 * - **Description textarea**: Optional detailed description
 * - **Color picker**: Visual color selection from preset palette
 * - **Project context**: Shows which project the epic belongs to
 * - **Form validation**: Prevents empty title submission
 * - **Keyboard accessible**: Escape to close, Tab navigation
 * - **Theme-aware**: Uses CSS custom properties for styling
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │ [📋] Create New Epic                                     [×] │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Project: My Project                                          │
 * │                                                              │
 * │ Epic Title *                                                 │
 * │ [_________________________________________________]          │
 * │                                                              │
 * │ Description                                                  │
 * │ [_________________________________________________]          │
 * │ [_________________________________________________]          │
 * │                                                              │
 * │ Color                                                        │
 * │ [🟣] [🔵] [🟢] [🟡] [🟠] [🔴]                                │
 * ├─────────────────────────────────────────────────────────────┤
 * │                               [Cancel]  [Create Epic]        │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */
export const CreateEpicModal: FC<CreateEpicModalProps> = ({
  isOpen,
  projectId,
  projectName,
  onClose,
  onSuccess,
}) => {
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);

  // Refs
  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Mutation hook
  const createEpicMutation = useCreateEpic();

  // Close on click outside
  useClickOutside(modalRef, onClose, isOpen);

  // Form validation
  const isValid = title.trim().length > 0;
  const isSubmitting = createEpicMutation.isPending;

  /**
   * Reset form to initial state
   */
  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setColor(PRESET_COLORS[0]);
  }, []);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();

      if (!isValid || isSubmitting) return;

      createEpicMutation.mutate(
        {
          title: title.trim(),
          projectId,
          ...(description.trim() && { description: description.trim() }),
          ...(color && { color }),
        },
        {
          onSuccess: (newEpic) => {
            resetForm();
            // Pass the new epic's ID to the callback for auto-selection
            if (newEpic?.id) {
              onSuccess?.(newEpic.id);
            }
            onClose();
          },
        }
      );
    },
    [
      isValid,
      isSubmitting,
      title,
      projectId,
      description,
      color,
      createEpicMutation,
      resetForm,
      onSuccess,
      onClose,
    ]
  );

  /**
   * Handle keyboard events
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Handle cancel button
   */
  const handleCancel = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div style={backdropStyles} data-testid="create-epic-modal-backdrop">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-epic-modal-title"
        style={modalStyles}
        onKeyDown={handleKeyDown}
        data-testid="create-epic-modal"
      >
        {/* Header */}
        <header style={headerStyles}>
          <div style={headerTitleContainerStyles}>
            <span style={headerIconStyles}>
              <Layers size={20} aria-hidden="true" />
            </span>
            <h2 id="create-epic-modal-title" style={headerTitleStyles}>
              Create New Epic
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={closeButtonStyles}
            aria-label="Close modal"
            data-testid="create-epic-modal-close"
            className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {/* Form */}
        <form onSubmit={handleSubmit} style={formStyles}>
          {/* Project Context */}
          {projectName && (
            <div style={projectContextStyles} data-testid="create-epic-project-context">
              <span style={projectContextLabelStyles}>Project:</span>
              <span style={projectContextValueStyles}>{projectName}</span>
            </div>
          )}

          {/* Title Input */}
          <div style={formGroupStyles}>
            <label htmlFor="epic-title" style={labelStyles}>
              Epic Title <span style={requiredStyles}>*</span>
            </label>
            <input
              ref={titleInputRef}
              id="epic-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter epic title..."
              style={inputStyles}
              autoFocus
              required
              data-testid="create-epic-title-input"
              className=""
            />
          </div>

          {/* Description Textarea */}
          <div style={formGroupStyles}>
            <label htmlFor="epic-description" style={labelStyles}>
              Description
            </label>
            <textarea
              id="epic-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description for this epic..."
              rows={3}
              style={textareaStyles}
              data-testid="create-epic-description-input"
              className=""
            />
          </div>

          {/* Color Picker */}
          <div style={formGroupStyles}>
            <label style={labelStyles}>Color</label>
            <ColorPicker
              value={color}
              onChange={setColor}
              testId="create-epic-color"
              aria-label="Select epic color"
            />
          </div>

          {/* Error Display */}
          {createEpicMutation.error && (
            <div style={errorStyles} role="alert" data-testid="create-epic-error">
              {createEpicMutation.error instanceof Error
                ? createEpicMutation.error.message
                : "Failed to create epic"}
            </div>
          )}

          {/* Footer */}
          <footer style={footerStyles}>
            <button
              type="button"
              onClick={handleCancel}
              style={cancelButtonStyles}
              disabled={isSubmitting}
              data-testid="create-epic-cancel-button"
              className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              style={{
                ...submitButtonStyles,
                opacity: !isValid || isSubmitting ? 0.6 : 1,
                cursor: !isValid || isSubmitting ? "not-allowed" : "pointer",
              }}
              data-testid="create-epic-submit-button"
              className="hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Epic</span>
              )}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

// =============================================================================
// Styles
// =============================================================================

const backdropStyles: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0, 0, 0, 0.7)",
  backdropFilter: "blur(4px)",
  WebkitBackdropFilter: "blur(4px)",
  zIndex: 50,
};

const modalStyles: React.CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  maxHeight: "85vh",
  background: "var(--bg-secondary)",
  border: "1px solid var(--glass-border)",
  borderRadius: "var(--radius-2xl)",
  boxShadow: "var(--shadow-modal)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-5)",
  borderBottom: "1px solid var(--border-primary)",
  background: "var(--bg-secondary)",
  position: "sticky",
  top: 0,
  zIndex: 1,
};

const headerTitleContainerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-3)",
};

const headerIconStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  borderRadius: "var(--radius-lg)",
  background: "var(--accent-muted)",
  color: "var(--accent-primary)",
};

const headerTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-tight)",
  color: "var(--text-primary)",
};

const closeButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-xl)",
  color: "var(--text-tertiary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const formStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: "var(--spacing-5)",
  gap: "var(--spacing-5)",
  overflowY: "auto",
};

const projectContextStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-3)",
  background: "var(--bg-card)",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border-primary)",
};

const projectContextLabelStyles: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--font-size-xs)",
  fontFamily: "var(--font-mono)",
  letterSpacing: "var(--tracking-wide)",
  textTransform: "uppercase",
};

const projectContextValueStyles: React.CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
};

const formGroupStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const labelStyles: React.CSSProperties = {
  color: "var(--text-muted)",
  fontSize: "var(--font-size-xs)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  letterSpacing: "var(--tracking-wider)",
  textTransform: "uppercase",
};

const requiredStyles: React.CSSProperties = {
  color: "var(--error)",
};

const inputStyles: React.CSSProperties = {
  width: "100%",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-xl)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-size-base)",
  outline: "none",
  transition: "border-color var(--transition-fast)",
};

const textareaStyles: React.CSSProperties = {
  width: "100%",
  padding: "var(--spacing-2) var(--spacing-3)",
  background: "var(--bg-card)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-xl)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-size-base)",
  outline: "none",
  resize: "vertical",
  minHeight: "80px",
  transition: "border-color var(--transition-fast)",
};

const errorStyles: React.CSSProperties = {
  padding: "var(--spacing-3)",
  background: "var(--error-muted)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  borderRadius: "var(--radius-xl)",
  color: "var(--error)",
  fontSize: "var(--font-size-sm)",
};

const footerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "var(--spacing-3)",
  paddingTop: "var(--spacing-3)",
  borderTop: "1px solid var(--border-primary)",
  marginTop: "var(--spacing-1)",
};

const cancelButtonStyles: React.CSSProperties = {
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-xl)",
  color: "var(--text-tertiary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const submitButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-5)",
  background: "var(--gradient-accent)",
  border: "none",
  borderRadius: "var(--radius-xl)",
  color: "var(--text-on-accent)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  transition: "all var(--transition-fast)",
  boxShadow: "var(--shadow-sm)",
};

export default CreateEpicModal;
