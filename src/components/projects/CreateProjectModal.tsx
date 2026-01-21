import { type FC, useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { X, FolderPlus, FolderOpen, Loader2 } from "lucide-react";
import { useCreateProject, useClickOutside } from "../../lib/hooks";
import { useToast } from "../Toast";
import DirectoryPicker from "../DirectoryPicker";

/** Color options for project picker - displayed as clickable circles */
const COLOR_OPTIONS = [
  { value: "#8b5cf6", label: "Purple" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#22c55e", label: "Green" },
  { value: "#eab308", label: "Yellow" },
  { value: "#f97316", label: "Orange" },
  { value: "#ef4444", label: "Red" },
];

/** Default color for new projects */
const DEFAULT_COLOR = "#8b5cf6";

export interface CreateProjectModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Handler to close the modal */
  onClose: () => void;
  /** Handler called after successful project creation */
  onSuccess?: () => void;
}

/**
 * CreateProjectModal - Modal for creating new projects.
 *
 * Features:
 * - **Name input**: Required text field for project name
 * - **Path input**: Required path with browse button
 * - **Color picker**: Visual color dots for project color
 * - **Path validation**: Validates path exists on filesystem
 * - **Creates via mutation**: Uses TanStack Query mutation
 * - **Toast notification**: Shows success/error toast
 * - **Keyboard accessible**: Escape to close, Tab navigation
 */
export const CreateProjectModal: FC<CreateProjectModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { showToast } = useToast();
  const createMutation = useCreateProject();

  const isSaving = createMutation.isPending;
  const error = createMutation.error;

  // Handle click outside to close (only when directory picker is not open)
  useClickOutside(modalRef, onClose, isOpen && !isDirectoryPickerOpen);

  // Handle escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && !isDirectoryPickerOpen) {
        e.preventDefault();
        onClose();
      }
    },
    [onClose, isDirectoryPickerOpen]
  );

  // Focus name input when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Focus name input after animation
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setName("");
    setPath("");
    setColor(DEFAULT_COLOR);
  }, []);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    const trimmedPath = path.trim();

    if (!trimmedName || !trimmedPath) return;

    createMutation.mutate(
      {
        name: trimmedName,
        path: trimmedPath,
        ...(color ? { color } : {}),
      },
      {
        onSuccess: () => {
          showToast("success", `Project "${trimmedName}" created`);
          resetForm();
          onSuccess?.();
          onClose();
        },
        onError: (err) => {
          showToast("error", err instanceof Error ? err.message : "Failed to create project");
        },
      }
    );
  }, [name, path, color, createMutation, showToast, resetForm, onSuccess, onClose]);

  // Handle Enter key in form fields
  const handleFieldKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && name.trim() && path.trim() && !isSaving) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [name, path, isSaving, handleSubmit]
  );

  if (!isOpen) return null;

  // Styles using CSS variables for theming
  const overlayStyles: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const backdropStyles: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "rgba(0, 0, 0, 0.6)",
  };

  const modalStyles: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: "28rem",
    maxHeight: "90vh",
    background: "var(--bg-secondary)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "0 0 60px var(--accent-glow), 0 25px 50px rgba(0, 0, 0, 0.5)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--spacing-4)",
    borderBottom: "1px solid var(--border-primary)",
  };

  const titleStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    margin: 0,
  };

  const closeButtonStyles: React.CSSProperties = {
    display: "inline-flex",
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
  };

  const contentStyles: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "var(--spacing-4)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-4)",
  };

  const labelStyles: React.CSSProperties = {
    display: "block",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    marginBottom: "var(--spacing-1)",
  };

  const inputStyles: React.CSSProperties = {
    width: "100%",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-base)",
    outline: "none",
    transition: "border-color var(--transition-fast)",
  };

  const pathContainerStyles: React.CSSProperties = {
    display: "flex",
    gap: "var(--spacing-2)",
  };

  const browseButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  const colorPickerStyles: React.CSSProperties = {
    display: "flex",
    gap: "var(--spacing-2)",
    flexWrap: "wrap",
  };

  const colorDotStyles = (optionColor: string, isSelected: boolean): React.CSSProperties => ({
    width: "32px",
    height: "32px",
    borderRadius: "var(--radius-full)",
    background: optionColor,
    border: isSelected ? "2px solid var(--text-primary)" : "2px solid transparent",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    outline: "none",
    boxShadow: isSelected ? "0 0 0 2px var(--bg-secondary), 0 0 0 4px " + optionColor : "none",
  });

  const errorStyles: React.CSSProperties = {
    padding: "var(--spacing-3)",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-md)",
    color: "#f87171",
    fontSize: "var(--font-size-sm)",
  };

  const footerStyles: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "var(--spacing-3)",
    padding: "var(--spacing-4)",
    borderTop: "1px solid var(--border-primary)",
  };

  const cancelButtonStyles: React.CSSProperties = {
    padding: "var(--spacing-2) var(--spacing-4)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  const submitButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-2) var(--spacing-4)",
    background: "var(--accent-primary)",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "var(--text-on-accent)",
    fontSize: "var(--font-size-base)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: isSaving || !name.trim() || !path.trim() ? "not-allowed" : "pointer",
    opacity: isSaving || !name.trim() || !path.trim() ? 0.5 : 1,
    transition: "all var(--transition-fast)",
  };

  const hintStyles: React.CSSProperties = {
    marginTop: "var(--spacing-1)",
    color: "var(--text-tertiary)",
    fontSize: "var(--font-size-xs)",
  };

  return (
    <div style={overlayStyles} onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div style={backdropStyles} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        style={modalStyles}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
      >
        {/* Header */}
        <header style={headerStyles}>
          <h2 id="create-project-title" style={titleStyles}>
            <FolderPlus size={20} aria-hidden="true" />
            Add New Project
          </h2>
          <button
            type="button"
            style={closeButtonStyles}
            onClick={onClose}
            aria-label="Close modal"
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* Content */}
        <div style={contentStyles}>
          {/* Error display */}
          {error && <div style={errorStyles}>{error.message}</div>}

          {/* Name field */}
          <div>
            <label style={labelStyles} htmlFor="project-name">
              Project Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              ref={nameInputRef}
              id="project-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleFieldKeyDown}
              placeholder="My Project"
              style={inputStyles}
              className="focus:border-[var(--accent-primary)]"
              autoComplete="off"
            />
          </div>

          {/* Path field */}
          <div>
            <label style={labelStyles} htmlFor="project-path">
              Path <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={pathContainerStyles}>
              <input
                id="project-path"
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="/Users/me/code/my-project"
                style={{ ...inputStyles, flex: 1 }}
                className="focus:border-[var(--accent-primary)]"
                autoComplete="off"
              />
              <button
                type="button"
                style={browseButtonStyles}
                onClick={() => setIsDirectoryPickerOpen(true)}
                title="Browse directories"
                className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <FolderOpen size={18} aria-hidden="true" />
              </button>
            </div>
            <p style={hintStyles}>Directory must exist on your filesystem</p>
          </div>

          {/* Color picker */}
          <div>
            <label style={labelStyles}>Color</label>
            <div style={colorPickerStyles} role="radiogroup" aria-label="Project color">
              {COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  style={colorDotStyles(option.value, color === option.value)}
                  onClick={() => setColor(option.value)}
                  role="radio"
                  aria-checked={color === option.value}
                  aria-label={option.label}
                  title={option.label}
                  className="hover:scale-110 focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={footerStyles}>
          <button
            type="button"
            style={cancelButtonStyles}
            onClick={onClose}
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            style={submitButtonStyles}
            onClick={handleSubmit}
            disabled={isSaving || !name.trim() || !path.trim()}
            className="hover:opacity-90"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {isSaving ? "Creating..." : "Create Project"}
          </button>
        </footer>
      </div>

      {/* Directory Picker */}
      <DirectoryPicker
        isOpen={isDirectoryPickerOpen}
        initialPath={path || undefined}
        onSelect={(selectedPath) => setPath(selectedPath)}
        onClose={() => setIsDirectoryPickerOpen(false)}
      />
    </div>
  );
};

export default CreateProjectModal;
