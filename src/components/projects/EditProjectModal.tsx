import {
  type FC,
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type KeyboardEvent,
} from "react";
import { X, Folder, Loader2, FolderOpen, Trash2, BarChart3 } from "lucide-react";
import {
  useUpdateProject,
  useDeleteProject,
  useClickOutside,
  useTickets,
  type ProjectBase,
  type Ticket,
} from "../../lib/hooks";
import { useToast } from "../Toast";
import DirectoryPicker from "../DirectoryPicker";
import DeleteConfirmationModal from "../DeleteConfirmationModal";
import { ColorPicker } from "../ui/ColorPicker";

/** Working method options for environment detection */
const WORKING_METHOD_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "claude-code", label: "Claude Code" },
  { value: "vscode", label: "VS Code" },
  { value: "opencode", label: "OpenCode" },
] as const;

type WorkingMethod = (typeof WORKING_METHOD_OPTIONS)[number]["value"];

export interface EditProjectModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** The project to edit */
  project: ProjectBase;
  /** Handler to close the modal */
  onClose: () => void;
  /** Handler called after successful update or delete */
  onSuccess?: () => void;
}

/**
 * EditProjectModal - Modal for editing existing projects.
 *
 * Features:
 * - **Name input**: Edit project name
 * - **Path input**: Edit project path with browse button
 * - **Color picker**: Visual color dots for project color
 * - **Working method selector**: Choose environment detection mode
 * - **Preview section**: Shows ticket stats (total, in progress, done)
 * - **Delete with confirmation**: Delete project with dry-run preview
 * - **Keyboard accessible**: Escape to close, Tab navigation
 *
 * Opens on double-click from ProjectItem.
 */
export const EditProjectModal: FC<EditProjectModalProps> = ({
  isOpen,
  project,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState(project.name);
  const [path, setPath] = useState(project.path);
  const [color, setColor] = useState<string>(project.color ?? "#8b5cf6");
  const [workingMethod, setWorkingMethod] = useState<WorkingMethod>(
    (project.workingMethod as WorkingMethod) ?? "auto"
  );
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { showToast } = useToast();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  // Fetch tickets for this project to compute stats
  const { tickets } = useTickets({ projectId: project.id });

  // Compute ticket stats for preview section
  const projectStats = useMemo(() => {
    const projectTickets = tickets as Ticket[];
    return {
      total: projectTickets.length,
      inProgress: projectTickets.filter((t: Ticket) => t.status === "in_progress").length,
      done: projectTickets.filter((t: Ticket) => t.status === "done").length,
      backlog: projectTickets.filter((t: Ticket) => t.status === "backlog").length,
    };
  }, [tickets]);

  const isSaving = updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const error = updateMutation.error;

  // Note: Parent component should use key={project.id} on EditProjectModal
  // to reset form state when switching projects

  // Handle click outside to close (only when directory picker and delete modal are not open)
  useClickOutside(modalRef, onClose, isOpen && !isDirectoryPickerOpen && !showDeleteModal);

  // Handle escape key to close
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape" && !isDirectoryPickerOpen && !showDeleteModal) {
        e.preventDefault();
        onClose();
      }
    },
    [onClose, isDirectoryPickerOpen, showDeleteModal]
  );

  // Focus name input when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    const trimmedPath = path.trim();

    if (!trimmedName || !trimmedPath) return;

    updateMutation.mutate(
      {
        id: project.id,
        updates: {
          name: trimmedName,
          path: trimmedPath,
          color,
          workingMethod,
        },
      },
      {
        onSuccess: () => {
          showToast("success", `Project "${trimmedName}" updated`);
          onSuccess?.();
          onClose();
        },
        onError: (err) => {
          showToast("error", err instanceof Error ? err.message : "Failed to update project");
        },
      }
    );
  }, [name, path, color, workingMethod, project.id, updateMutation, showToast, onSuccess, onClose]);

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

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(() => {
    setDeleteError(null);
    deleteMutation.mutate(
      { projectId: project.id, confirm: true },
      {
        onSuccess: () => {
          showToast("success", `Project "${project.name}" deleted`);
          setShowDeleteModal(false);
          onSuccess?.();
          onClose();
        },
        onError: (err) => {
          setDeleteError(err instanceof Error ? err.message : "Failed to delete project");
        },
      }
    );
  }, [project.id, project.name, deleteMutation, showToast, onSuccess, onClose]);

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
    boxShadow: "var(--shadow-modal)",
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

  const selectStyles: React.CSSProperties = {
    width: "100%",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "var(--bg-primary)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-md)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-base)",
    outline: "none",
    cursor: "pointer",
  };

  const previewStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-3)",
    background: "var(--bg-tertiary)",
    borderRadius: "var(--radius-md)",
    border: "1px solid var(--border-primary)",
  };

  const previewTitleStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-sm)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    margin: 0,
  };

  const statsGridStyles: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "var(--spacing-2)",
  };

  const statItemStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "var(--spacing-2)",
    background: "var(--bg-secondary)",
    borderRadius: "var(--radius-sm)",
  };

  const statValueStyles: React.CSSProperties = {
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    color: "var(--text-primary)",
  };

  const statLabelStyles: React.CSSProperties = {
    fontSize: "var(--font-size-xs)",
    color: "var(--text-muted)",
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
    justifyContent: "space-between",
    alignItems: "center",
    padding: "var(--spacing-4)",
    borderTop: "1px solid var(--border-primary)",
  };

  const deleteButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-md)",
    color: "var(--color-red-400)",
    fontSize: "var(--font-size-sm)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
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
        aria-labelledby="edit-project-title"
      >
        {/* Header */}
        <header style={headerStyles}>
          <h2 id="edit-project-title" style={titleStyles}>
            <Folder size={20} aria-hidden="true" />
            Edit Project
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

          {/* Preview section - ticket stats */}
          <div style={previewStyles}>
            <h3 style={previewTitleStyles}>
              <BarChart3 size={16} aria-hidden="true" />
              Project Stats
            </h3>
            <div style={statsGridStyles}>
              <div style={statItemStyles}>
                <span style={statValueStyles}>{projectStats.total}</span>
                <span style={statLabelStyles}>Total</span>
              </div>
              <div style={statItemStyles}>
                <span style={{ ...statValueStyles, color: "var(--color-blue-400)" }}>
                  {projectStats.inProgress}
                </span>
                <span style={statLabelStyles}>Active</span>
              </div>
              <div style={statItemStyles}>
                <span style={{ ...statValueStyles, color: "var(--color-green-400)" }}>
                  {projectStats.done}
                </span>
                <span style={statLabelStyles}>Done</span>
              </div>
              <div style={statItemStyles}>
                <span style={{ ...statValueStyles, color: "var(--text-muted)" }}>
                  {projectStats.backlog}
                </span>
                <span style={statLabelStyles}>Backlog</span>
              </div>
            </div>
          </div>

          {/* Name field */}
          <div>
            <label style={labelStyles} htmlFor="edit-project-name">
              Project Name <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              ref={nameInputRef}
              id="edit-project-name"
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
            <label style={labelStyles} htmlFor="edit-project-path">
              Path <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <div style={pathContainerStyles}>
              <input
                id="edit-project-path"
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
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Working method selector */}
          <div>
            <label style={labelStyles} htmlFor="edit-project-working-method">
              Working Method
            </label>
            <select
              id="edit-project-working-method"
              value={workingMethod}
              onChange={(e) => setWorkingMethod(e.target.value as WorkingMethod)}
              style={selectStyles}
              className="focus:border-[var(--accent-primary)]"
            >
              {WORKING_METHOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p style={hintStyles}>Controls environment detection for AI assistants</p>
          </div>
        </div>

        {/* Footer */}
        <footer style={footerStyles}>
          <button
            type="button"
            style={deleteButtonStyles}
            onClick={() => setShowDeleteModal(true)}
            className="hover:bg-[rgba(239,68,68,0.1)]"
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete Project
          </button>
          <div style={{ display: "flex", gap: "var(--spacing-3)" }}>
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
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </footer>
      </div>

      {/* Directory Picker */}
      <DirectoryPicker
        isOpen={isDirectoryPickerOpen}
        initialPath={path || undefined}
        onSelect={(selectedPath) => setPath(selectedPath)}
        onClose={() => setIsDirectoryPickerOpen(false)}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteError(null);
        }}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        entityType="project"
        entityName={project.name}
        preview={{
          ticketCount: projectStats.total,
        }}
        error={deleteError}
      />
    </div>
  );
};

export default EditProjectModal;
