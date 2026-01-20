import { type FC, useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { X, Ticket, Loader2 } from "lucide-react";
import { useCreateTicket, useClickOutside, useProjects } from "../../lib/hooks";
import { useToast } from "../Toast";

/** Priority options for ticket creation */
const PRIORITY_OPTIONS = [
  { value: "", label: "None" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export interface CreateTicketModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Handler to close the modal */
  onClose: () => void;
  /** Handler called after successful ticket creation */
  onSuccess?: () => void;
  /** Pre-selected project ID (optional) */
  defaultProjectId?: string | null;
}

/**
 * CreateTicketModal - Modal shell for creating new tickets.
 *
 * This is the shell component with 2-column form layout.
 * Form fields and validation will be added in subsequent tickets.
 *
 * Features:
 * - **2-column layout**: Project/Priority and Epic/Tags in grid
 * - **Required fields**: Title and Project are required
 * - **Keyboard accessible**: Escape to close, Tab navigation
 * - **TanStack Query**: Uses mutation for ticket creation
 * - **Toast notifications**: Shows success/error feedback
 */
export const CreateTicketModal: FC<CreateTicketModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultProjectId,
}) => {
  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [priority, setPriority] = useState<string>("");
  const [epicId, setEpicId] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Refs
  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Hooks
  const { showToast } = useToast();
  const createMutation = useCreateTicket();
  const { projects } = useProjects();

  const isSaving = createMutation.isPending;
  const error = createMutation.error;

  // Get epics for selected project
  const selectedProject = projects.find((p) => p.id === projectId);
  const projectEpics = selectedProject?.epics ?? [];

  // Reset form helper - called when modal closes
  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setProjectId(defaultProjectId ?? "");
    setPriority("");
    setEpicId("");
    setTags([]);
  }, [defaultProjectId]);

  // Handle close - resets form and calls onClose
  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  // Handle project change - clears epic if it no longer belongs to the project
  const handleProjectChange = useCallback(
    (newProjectId: string) => {
      setProjectId(newProjectId);
      // Clear epic if it doesn't belong to the new project
      if (epicId) {
        const newProject = projects.find((p) => p.id === newProjectId);
        const epicBelongsToProject = newProject?.epics.some((e) => e.id === epicId);
        if (!epicBelongsToProject) {
          setEpicId("");
        }
      }
    },
    [epicId, projects]
  );

  // Handle click outside to close
  useClickOutside(modalRef, handleClose, isOpen);

  // Handle escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [handleClose]
  );

  // Focus title input when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      titleInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle || !projectId) return;

    // Build input object, only including optional fields if they have values
    // (exactOptionalPropertyTypes requires omitting rather than passing undefined)
    const input: Parameters<typeof createMutation.mutate>[0] = {
      title: trimmedTitle,
      projectId,
    };
    const trimmedDesc = description.trim();
    if (trimmedDesc) {
      input.description = trimmedDesc;
    }
    if (priority) {
      input.priority = priority as "high" | "medium" | "low";
    }
    if (epicId) {
      input.epicId = epicId;
    }
    if (tags.length > 0) {
      input.tags = tags;
    }

    createMutation.mutate(input, {
      onSuccess: () => {
        showToast("success", `Ticket "${trimmedTitle}" created`);
        resetForm();
        onSuccess?.();
        onClose();
      },
      onError: (err) => {
        showToast("error", err instanceof Error ? err.message : "Failed to create ticket");
      },
    });
  }, [
    title,
    description,
    projectId,
    priority,
    epicId,
    tags,
    createMutation,
    showToast,
    resetForm,
    onSuccess,
    onClose,
  ]);

  // Handle Enter key in form fields
  const handleFieldKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Only submit on Enter in title field (not textarea)
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        e.currentTarget.tagName !== "TEXTAREA" &&
        title.trim() &&
        projectId &&
        !isSaving
      ) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [title, projectId, isSaving, handleSubmit]
  );

  if (!isOpen) return null;

  // Check if form is valid for submission
  const isFormValid = title.trim().length > 0 && projectId.length > 0;

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
    maxWidth: "36rem", // Wider for 2-column layout
    maxHeight: "90vh",
    background: "var(--bg-secondary)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-xl)",
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

  const textareaStyles: React.CSSProperties = {
    ...inputStyles,
    minHeight: "80px",
    resize: "vertical" as const,
    fontFamily: "inherit",
  };

  const selectStyles: React.CSSProperties = {
    ...inputStyles,
    cursor: "pointer",
  };

  // 2-column grid for Project/Priority and Epic/Tags
  const twoColumnGridStyles: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "var(--spacing-4)",
  };

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
    cursor: isSaving || !isFormValid ? "not-allowed" : "pointer",
    opacity: isSaving || !isFormValid ? 0.5 : 1,
    transition: "all var(--transition-fast)",
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
        aria-labelledby="create-ticket-title"
      >
        {/* Header */}
        <header style={headerStyles}>
          <h2 id="create-ticket-title" style={titleStyles}>
            <Ticket size={20} aria-hidden="true" />
            Create New Ticket
          </h2>
          <button
            type="button"
            style={closeButtonStyles}
            onClick={handleClose}
            aria-label="Close modal"
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {/* Content / Body */}
        <div style={contentStyles}>
          {/* Error display */}
          {error && <div style={errorStyles}>{error.message}</div>}

          {/* Title field - full width */}
          <div>
            <label style={labelStyles} htmlFor="ticket-title">
              Title <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              ref={titleInputRef}
              id="ticket-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleFieldKeyDown}
              placeholder="What needs to be done?"
              style={inputStyles}
              className="focus:border-[var(--accent-primary)]"
              autoComplete="off"
            />
          </div>

          {/* Description field - full width */}
          <div>
            <label style={labelStyles} htmlFor="ticket-description">
              Description
            </label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleFieldKeyDown}
              placeholder="Add more details... (optional)"
              style={textareaStyles}
              className="focus:border-[var(--accent-primary)]"
            />
          </div>

          {/* 2-column row: Project + Priority */}
          <div style={twoColumnGridStyles}>
            {/* Project dropdown */}
            <div>
              <label style={labelStyles} htmlFor="ticket-project">
                Project <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <select
                id="ticket-project"
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                style={selectStyles}
                className="focus:border-[var(--accent-primary)]"
              >
                <option value="">Select a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority dropdown */}
            <div>
              <label style={labelStyles} htmlFor="ticket-priority">
                Priority
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={selectStyles}
                className="focus:border-[var(--accent-primary)]"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2-column row: Epic + Tags (placeholders for now) */}
          <div style={twoColumnGridStyles}>
            {/* Epic dropdown */}
            <div>
              <label style={labelStyles} htmlFor="ticket-epic">
                Epic
              </label>
              <select
                id="ticket-epic"
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
                style={selectStyles}
                className="focus:border-[var(--accent-primary)]"
                disabled={!projectId}
              >
                <option value="">No epic</option>
                {projectEpics.map((epic) => (
                  <option key={epic.id} value={epic.id}>
                    {epic.title}
                  </option>
                ))}
              </select>
              {!projectId && (
                <p
                  style={{
                    marginTop: "var(--spacing-1)",
                    color: "var(--text-tertiary)",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  Select a project first
                </p>
              )}
            </div>

            {/* Tags placeholder - will be replaced by TagInput component */}
            <div>
              <label style={labelStyles} htmlFor="ticket-tags">
                Tags
              </label>
              <div
                style={{
                  ...inputStyles,
                  display: "flex",
                  alignItems: "center",
                  color: "var(--text-tertiary)",
                  fontSize: "var(--font-size-sm)",
                }}
              >
                Tags coming soon...
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={footerStyles}>
          <button
            type="button"
            style={cancelButtonStyles}
            onClick={handleClose}
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            style={submitButtonStyles}
            onClick={handleSubmit}
            disabled={isSaving || !isFormValid}
            className="hover:opacity-90"
          >
            {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {isSaving ? "Creating..." : "Create Ticket"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default CreateTicketModal;
