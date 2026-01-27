import { type FC, useState, useRef, useCallback, useMemo, useEffect, type FormEvent } from "react";
import { X, Loader2, GitBranch, FolderTree, Check } from "lucide-react";
import { useClickOutside, useUpdateEpic, useUpdateProject } from "../lib/hooks";

// =============================================================================
// Types
// =============================================================================

export type IsolationMode = "branch" | "worktree";

export interface StartEpicModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Epic details */
  epic: {
    id: string;
    title: string;
    isolationMode: IsolationMode | null;
  };
  /** Project details */
  project: {
    id: string;
    name: string;
    path: string;
    defaultIsolationMode?: "branch" | "worktree" | "ask" | null;
  };
  /** Handler called when the modal should close */
  onClose: () => void;
  /** Handler called after successful mode selection */
  onConfirm?: (epicId: string, isolationMode: IsolationMode) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a slugified version of a string for use in paths/URLs.
 * Matches the server-side slugify behavior.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 30);
}

/**
 * Generate a short ID from a UUID (first 8 characters).
 */
function shortId(uuid: string): string {
  return uuid.substring(0, 8);
}

/**
 * Shorten a path for display by replacing the home directory with ~.
 */
function shortenPath(path: string): string {
  // On client side, assume /Users/<user> pattern for macOS
  // and /home/<user> pattern for Linux
  const macMatch = path.match(/^\/Users\/[^/]+/);
  if (macMatch) {
    return path.replace(macMatch[0], "~");
  }
  const linuxMatch = path.match(/^\/home\/[^/]+/);
  if (linuxMatch) {
    return path.replace(linuxMatch[0], "~");
  }
  return path;
}

/**
 * Generate a preview of the worktree path.
 * Matches the server-side generateWorktreePath behavior for sibling location.
 */
function generateWorktreePathPreview(
  projectPath: string,
  epicId: string,
  epicTitle: string
): string {
  const projectName = projectPath.split("/").pop() ?? "project";
  const epicSlug = slugify(epicTitle);
  const epicShortId = shortId(epicId);

  // Default to sibling location format
  const worktreeName = epicSlug
    ? `${projectName}-epic-${epicShortId}-${epicSlug}`
    : `${projectName}-epic-${epicShortId}`;

  const projectParent = projectPath.substring(0, projectPath.lastIndexOf("/"));
  return `${projectParent}/${worktreeName}`;
}

// =============================================================================
// Main StartEpicModal Component
// =============================================================================

/**
 * StartEpicModal - Modal for choosing isolation mode when starting AI work on an epic.
 *
 * Features:
 * - **Two options**: Branch (default) and Worktree (isolated)
 * - **Clear descriptions**: Explains tradeoffs of each option
 * - **Path preview**: Shows projected worktree path for worktree option
 * - **Remember option**: Saves choice as project default
 * - **Keyboard accessible**: Escape to close, Tab navigation
 * - **Theme-aware**: Uses CSS custom properties for styling
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Start Epic: "Git Worktree Integration"                    [×] │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Choose working method:                                       │
 * │                                                              │
 * │ ○ Branch (Default)                                           │
 * │   Work in current directory. Simple but requires clean tree. │
 * │                                                              │
 * │ ● Worktree (Isolated)                                        │
 * │   Create separate directory at:                              │
 * │   ~/code/brain-dump-epic-abc12345-git-worktree               │
 * │   Enables parallel AI sessions.                              │
 * │                                                              │
 * │ ☐ Remember as default for this project                       │
 * ├─────────────────────────────────────────────────────────────┤
 * │                               [Cancel]  [Start Work]         │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 */
export const StartEpicModal: FC<StartEpicModalProps> = ({
  isOpen,
  epic,
  project,
  onClose,
  onConfirm,
}) => {
  // Determine initial selection based on epic's current mode or project default
  const initialMode = useMemo<IsolationMode>(() => {
    // If epic already has a mode set, use it
    if (epic.isolationMode === "branch" || epic.isolationMode === "worktree") {
      return epic.isolationMode;
    }
    // If project has a default (excluding "ask"), use it
    if (project.defaultIsolationMode === "branch") {
      return "branch";
    }
    if (project.defaultIsolationMode === "worktree") {
      return "worktree";
    }
    // Default to branch
    return "branch";
  }, [epic.isolationMode, project.defaultIsolationMode]);

  // Form state
  const [selectedMode, setSelectedMode] = useState<IsolationMode>(initialMode);
  const [rememberChoice, setRememberChoice] = useState(false);

  // Refs
  const modalRef = useRef<HTMLDivElement>(null);

  // Mutation hooks
  const updateEpicMutation = useUpdateEpic();
  const updateProjectMutation = useUpdateProject();

  // Close on click outside
  useClickOutside(modalRef, onClose, isOpen);

  // Handle Escape key globally (like the base Modal component)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Derived state
  const isSubmitting = updateEpicMutation.isPending || updateProjectMutation.isPending;

  // Generate worktree path preview
  const worktreePathPreview = useMemo(
    () => generateWorktreePathPreview(project.path, epic.id, epic.title),
    [project.path, epic.id, epic.title]
  );

  // Shorten path for display (use ~ for home directory)
  // This is a pure function of worktreePathPreview, so we derive it directly
  const displayPath = shortenPath(worktreePathPreview);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (isSubmitting) return;

      // Update epic's isolation mode
      await updateEpicMutation.mutateAsync({
        id: epic.id,
        updates: { isolationMode: selectedMode },
      });

      // Optionally update project default
      if (rememberChoice) {
        await updateProjectMutation.mutateAsync({
          id: project.id,
          updates: { defaultIsolationMode: selectedMode },
        });
      }

      // Call success handler
      onConfirm?.(epic.id, selectedMode);
      onClose();
    },
    [
      isSubmitting,
      epic.id,
      selectedMode,
      rememberChoice,
      project.id,
      updateEpicMutation,
      updateProjectMutation,
      onConfirm,
      onClose,
    ]
  );

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div style={backdropStyles} data-testid="start-epic-modal-backdrop">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-epic-modal-title"
        style={modalStyles}
        data-testid="start-epic-modal"
      >
        {/* Header */}
        <header style={headerStyles}>
          <div style={headerTitleContainerStyles}>
            <h2 id="start-epic-modal-title" style={headerTitleStyles}>
              Start Epic: &ldquo;{epic.title}&rdquo;
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={closeButtonStyles}
            aria-label="Close modal"
            data-testid="start-epic-modal-close"
            className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        {/* Form */}
        <form onSubmit={handleSubmit} style={formStyles}>
          <p style={instructionStyles}>Choose working method:</p>

          {/* Branch Option */}
          <label
            style={{
              ...optionStyles,
              ...(selectedMode === "branch" ? optionSelectedStyles : {}),
            }}
            data-testid="start-epic-option-branch"
          >
            <input
              type="radio"
              name="isolationMode"
              value="branch"
              checked={selectedMode === "branch"}
              onChange={() => setSelectedMode("branch")}
              style={radioInputStyles}
            />
            <div style={optionContentStyles}>
              <div style={optionHeaderStyles}>
                <GitBranch size={20} style={optionIconStyles} aria-hidden="true" />
                <span style={optionTitleStyles}>Branch (Default)</span>
                {selectedMode === "branch" && (
                  <Check size={16} style={checkIconStyles} aria-hidden="true" />
                )}
              </div>
              <p style={optionDescriptionStyles}>
                Work in current directory. Simple but requires clean working tree before switching
                tasks.
              </p>
            </div>
          </label>

          {/* Worktree Option */}
          <label
            style={{
              ...optionStyles,
              ...(selectedMode === "worktree" ? optionSelectedStyles : {}),
            }}
            data-testid="start-epic-option-worktree"
          >
            <input
              type="radio"
              name="isolationMode"
              value="worktree"
              checked={selectedMode === "worktree"}
              onChange={() => setSelectedMode("worktree")}
              style={radioInputStyles}
            />
            <div style={optionContentStyles}>
              <div style={optionHeaderStyles}>
                <FolderTree size={20} style={optionIconStyles} aria-hidden="true" />
                <span style={optionTitleStyles}>Worktree (Isolated)</span>
                {selectedMode === "worktree" && (
                  <Check size={16} style={checkIconStyles} aria-hidden="true" />
                )}
              </div>
              <p style={optionDescriptionStyles}>
                Create separate directory. Enables parallel AI sessions without checkout conflicts.
              </p>
              <div style={pathPreviewStyles} data-testid="worktree-path-preview">
                <span style={pathLabelStyles}>Path:</span>
                <code style={pathCodeStyles}>{displayPath}</code>
              </div>
            </div>
          </label>

          {/* Remember Choice Checkbox */}
          <label style={checkboxLabelStyles} data-testid="start-epic-remember-checkbox">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={(e) => setRememberChoice(e.target.checked)}
              style={checkboxInputStyles}
            />
            <span style={checkboxTextStyles}>Remember as default for this project</span>
          </label>

          {/* Error Display */}
          {(updateEpicMutation.error || updateProjectMutation.error) && (
            <div style={errorStyles} role="alert" data-testid="start-epic-error">
              {updateEpicMutation.error instanceof Error
                ? updateEpicMutation.error.message
                : updateProjectMutation.error instanceof Error
                  ? updateProjectMutation.error.message
                  : "Failed to update settings"}
            </div>
          )}

          {/* Footer */}
          <footer style={footerStyles}>
            <button
              type="button"
              onClick={onClose}
              style={cancelButtonStyles}
              disabled={isSubmitting}
              data-testid="start-epic-cancel-button"
              className="hover:bg-[var(--bg-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                ...submitButtonStyles,
                opacity: isSubmitting ? 0.6 : 1,
                cursor: isSubmitting ? "not-allowed" : "pointer",
              }}
              data-testid="start-epic-submit-button"
              className="hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--accent-primary)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                  <span>Starting...</span>
                </>
              ) : (
                <span>Start Work</span>
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
  background: "rgba(0, 0, 0, 0.6)",
  zIndex: 50,
};

const modalStyles: React.CSSProperties = {
  width: "100%",
  maxWidth: "520px",
  maxHeight: "90vh",
  background: "var(--bg-secondary)",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-modal)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--spacing-4)",
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
  flex: 1,
  minWidth: 0,
};

const headerTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-lg)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const closeButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "32px",
  height: "32px",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
  flexShrink: 0,
};

const formStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  padding: "var(--spacing-4)",
  gap: "var(--spacing-4)",
  overflowY: "auto",
};

const instructionStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-base)",
  color: "var(--text-secondary)",
};

const optionStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "var(--spacing-3)",
  padding: "var(--spacing-3)",
  background: "var(--bg-primary)",
  borderWidth: "2px",
  borderStyle: "solid",
  borderColor: "var(--border-primary)",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const optionSelectedStyles: React.CSSProperties = {
  borderColor: "var(--accent-primary)",
  background: "var(--accent-muted)",
};

const radioInputStyles: React.CSSProperties = {
  // Visually hidden but still accessible
  position: "absolute",
  opacity: 0,
  pointerEvents: "none",
};

const optionContentStyles: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "var(--spacing-2)",
};

const optionHeaderStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
};

const optionIconStyles: React.CSSProperties = {
  color: "var(--text-secondary)",
  flexShrink: 0,
};

const optionTitleStyles: React.CSSProperties = {
  fontSize: "var(--font-size-base)",
  fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
  color: "var(--text-primary)",
};

const checkIconStyles: React.CSSProperties = {
  color: "var(--accent-primary)",
  marginLeft: "auto",
};

const optionDescriptionStyles: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
  lineHeight: 1.5,
};

const pathPreviewStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  marginTop: "var(--spacing-1)",
  padding: "var(--spacing-2)",
  background: "var(--bg-tertiary)",
  borderRadius: "var(--radius-sm)",
  overflow: "hidden",
};

const pathLabelStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--text-muted)",
  flexShrink: 0,
};

const pathCodeStyles: React.CSSProperties = {
  fontSize: "var(--font-size-xs)",
  color: "var(--accent-primary)",
  fontFamily: "var(--font-mono)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const checkboxLabelStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  cursor: "pointer",
};

const checkboxInputStyles: React.CSSProperties = {
  width: "16px",
  height: "16px",
  accentColor: "var(--accent-primary)",
  cursor: "pointer",
};

const checkboxTextStyles: React.CSSProperties = {
  fontSize: "var(--font-size-sm)",
  color: "var(--text-secondary)",
};

const errorStyles: React.CSSProperties = {
  padding: "var(--spacing-3)",
  background: "var(--status-error-bg)",
  border: "1px solid var(--status-error)",
  borderRadius: "var(--radius-md)",
  color: "var(--status-error)",
  fontSize: "var(--font-size-sm)",
};

const footerStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "var(--spacing-3)",
  paddingTop: "var(--spacing-2)",
  borderTop: "1px solid var(--border-primary)",
  marginTop: "var(--spacing-2)",
};

const cancelButtonStyles: React.CSSProperties = {
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "transparent",
  border: "1px solid var(--border-primary)",
  borderRadius: "var(--radius-md)",
  color: "var(--text-secondary)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  cursor: "pointer",
  transition: "all var(--transition-fast)",
};

const submitButtonStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--spacing-2)",
  padding: "var(--spacing-2) var(--spacing-4)",
  background: "var(--gradient-accent)",
  border: "none",
  borderRadius: "var(--radius-md)",
  color: "white",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
  transition: "all var(--transition-fast)",
};

export default StartEpicModal;
