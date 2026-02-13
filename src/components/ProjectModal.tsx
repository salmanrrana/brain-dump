import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import {
  X,
  ChevronDown,
  FolderOpen,
  Upload,
  Loader2,
  AlertTriangle,
  FileArchive,
  FolderPlus,
} from "lucide-react";
import {
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useModalKeyboard,
  type ProjectBase,
} from "../lib/hooks";
import { usePreviewImport, useCreateProjectAndImport } from "../lib/hooks/transfer";
import { type UpdateProjectInput } from "../api/projects";
import DirectoryPicker from "./DirectoryPicker";
import DeleteProjectModal from "./DeleteProjectModal";
import { useToast } from "./Toast";
import ErrorAlert from "./ErrorAlert";
import { COLOR_OPTIONS } from "../lib/constants";
import type { ConflictResolution, ManifestPreview } from "../../core/index.ts";

const WORKING_METHOD_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "claude-code", label: "Claude Code" },
  { value: "vscode", label: "VS Code" },
  { value: "opencode", label: "OpenCode" },
  { value: "cursor", label: "Cursor" },
  { value: "copilot-cli", label: "Copilot CLI" },
  { value: "codex", label: "Codex" },
];

type CreateMode = "new" | "import";

interface ProjectModalProps {
  project?: ProjectBase | null;
  onClose: () => void;
  onSave: () => void;
}

export default function ProjectModal({ project, onClose, onSave }: ProjectModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(project);

  // Shared state
  const [name, setName] = useState(project?.name ?? "");
  const [path, setPath] = useState(project?.path ?? "");
  const [color, setColor] = useState(project?.color ?? "");
  const [workingMethod, setWorkingMethod] = useState(project?.workingMethod ?? "auto");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false);

  // Create mode tab (only relevant when !isEditing)
  const [createMode, setCreateMode] = useState<CreateMode>("new");

  // Import state
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [resetStatuses, setResetStatuses] = useState(false);
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution>("create-new");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const { showToast } = useToast();

  // Mutation hooks
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();
  const previewMutation = usePreviewImport();
  const createAndImportMutation = useCreateProjectAndImport();

  const isSaving =
    createMutation.isPending || updateMutation.isPending || createAndImportMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const error = createMutation.error || updateMutation.error || createAndImportMutation.error;

  // Modal keyboard handling (Escape, focus trap)
  useModalKeyboard(modalRef, onClose, {
    shouldPreventClose: useCallback(() => showDeleteModal, [showDeleteModal]),
    onPreventedClose: useCallback(() => setShowDeleteModal(false), []),
    initialFocusRef: nameInputRef,
  });

  // Process import file
  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".braindump")) {
        showToast("error", "Please select a .braindump file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result;
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          showToast("error", "Failed to read file contents. Please try again.");
          return;
        }
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const b64 = btoa(binary);
        setBase64Data(b64);
        setFileName(file.name);

        previewMutation.mutate(b64, {
          onSuccess: (result) => {
            if (result.success) {
              setPreview(result.preview);
              // Auto-fill project name from archive source if empty
              if (!name.trim()) {
                setName(result.preview.sourceProject.name);
              }
            }
          },
          onError: (err) => {
            showToast("error", err instanceof Error ? err.message : "Failed to read archive");
          },
        });
      };
      reader.onerror = () => {
        showToast("error", `Failed to read file "${file.name}". Please try again.`);
      };
      reader.readAsArrayBuffer(file);
    },
    [previewMutation, showToast, name]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // Reset import state
  const resetImportState = useCallback(() => {
    setBase64Data(null);
    setFileName("");
    setPreview(null);
    setResetStatuses(false);
    setConflictResolution("create-new");
    previewMutation.reset();
    createAndImportMutation.reset();
  }, [previewMutation, createAndImportMutation]);

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedPath = path.trim();

    if (!trimmedName || !trimmedPath) return;

    if (isEditing && project) {
      const updates: UpdateProjectInput = {
        name: trimmedName,
        path: trimmedPath,
      };
      if (color) {
        updates.color = color;
      }
      if (
        workingMethod === "auto" ||
        workingMethod === "claude-code" ||
        workingMethod === "vscode" ||
        workingMethod === "opencode" ||
        workingMethod === "cursor" ||
        workingMethod === "copilot-cli" ||
        workingMethod === "codex"
      ) {
        updates.workingMethod = workingMethod;
      }
      updateMutation.mutate({ id: project.id, updates }, { onSuccess: onSave });
    } else if (createMode === "import" && base64Data) {
      createAndImportMutation.mutate(
        {
          projectName: trimmedName,
          projectPath: trimmedPath,
          ...(color ? { projectColor: color } : {}),
          base64Data,
          resetStatuses,
          conflictResolution,
        },
        {
          onSuccess: (result) => {
            showToast(
              "success",
              `Created "${trimmedName}" with ${result.result.ticketCount} imported tickets`
            );
            onSave();
          },
          onError: (err) => {
            showToast("error", err instanceof Error ? err.message : "Import failed");
          },
        }
      );
    } else {
      createMutation.mutate(
        {
          name: trimmedName,
          path: trimmedPath,
          ...(color ? { color } : {}),
        },
        { onSuccess: onSave }
      );
    }
  };

  const handleDelete = () => {
    if (!project) return;

    setDeleteError(null);
    deleteMutation.mutate(
      { projectId: project.id, confirm: true },
      {
        onSuccess: () => {
          showToast("success", `Project "${project.name}" deleted`);
          onSave();
        },
        onError: (err) => {
          setDeleteError(err instanceof Error ? err.message : "Failed to delete project");
        },
      }
    );
  };

  const isImportReady = createMode === "import" && preview && base64Data;
  const canSubmit =
    createMode === "import"
      ? isImportReady && name.trim() && path.trim()
      : name.trim() && path.trim();

  // Show form fields when editing, in new mode, or in import mode with preview loaded
  const showFormFields = isEditing || createMode === "new" || (createMode === "import" && preview);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: "var(--shadow-modal)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2 id="modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            {isEditing ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab toggle (create mode only) */}
        {!isEditing && (
          <div className="flex border-b border-[var(--border-primary)]">
            <button
              type="button"
              onClick={() => {
                setCreateMode("new");
                resetImportState();
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                createMode === "new"
                  ? "text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <FolderPlus size={16} />
              New Project
            </button>
            <button
              type="button"
              onClick={() => setCreateMode("import")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                createMode === "import"
                  ? "text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
              }`}
            >
              <Upload size={16} />
              Import .braindump
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error */}
          <ErrorAlert error={error} />

          {/* Import file selection (import mode, no preview yet) */}
          {!isEditing && createMode === "import" && !preview && (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  isDragging
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                    : "border-[var(--border-primary)] hover:border-[var(--text-tertiary)]"
                }`}
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 size={32} className="animate-spin text-[var(--accent-primary)]" />
                    <p className="text-sm text-[var(--text-secondary)]">Reading archive...</p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="text-[var(--text-tertiary)]" />
                    <p className="text-sm text-[var(--text-secondary)]">
                      Drag & drop a .braindump file, or click to browse
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Only .braindump files are accepted
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".braindump"
                onChange={handleFileChange}
                className="hidden"
              />
              {previewMutation.isError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10">
                  <AlertTriangle size={16} className="text-[var(--accent-danger)] flex-shrink-0" />
                  <p className="text-sm text-[var(--accent-danger)]">
                    {previewMutation.error instanceof Error
                      ? previewMutation.error.message
                      : "Failed to read archive"}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Import preview banner */}
          {!isEditing && createMode === "import" && preview && (
            <div className="rounded-lg bg-[var(--bg-tertiary)] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <FileArchive size={16} className="text-[var(--accent-primary)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">{fileName}</span>
                <button
                  type="button"
                  onClick={resetImportState}
                  className="ml-auto text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  Change file
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                <span>Source: {preview.sourceProject.name}</span>
                <span>By: {preview.exportedBy}</span>
                <span>Epics: {preview.epicNames.length}</span>
                <span>Tickets: {preview.ticketCount}</span>
                <span>Comments: {preview.commentCount}</span>
                <span>Attachments: {preview.attachmentCount}</span>
              </div>
            </div>
          )}

          {/* Name */}
          {showFormFields && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Name <span className="text-[var(--accent-danger)]">*</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] "
              />
            </div>
          )}

          {/* Path */}
          {showFormFields && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Path <span className="text-[var(--accent-danger)]">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/home/user/projects/my-project"
                  className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] "
                />
                <button
                  type="button"
                  onClick={() => setIsDirectoryPickerOpen(true)}
                  className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] rounded-lg text-[var(--text-secondary)] transition-colors"
                  title="Browse directories"
                >
                  <FolderOpen size={18} />
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Directory must exist on your filesystem
              </p>
            </div>
          )}

          {/* Color */}
          {showFormFields && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Color
              </label>
              <div className="relative">
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none "
                >
                  {COLOR_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                />
              </div>
              {color && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                  <span className="text-xs text-[var(--text-secondary)]">Preview</span>
                </div>
              )}
            </div>
          )}

          {/* Import options */}
          {!isEditing && createMode === "import" && preview && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetStatuses}
                  onChange={(e) => setResetStatuses(e.target.checked)}
                  className="rounded border-[var(--border-primary)]"
                />
                Reset all ticket statuses to backlog
              </label>

              <div>
                <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                  If epic names conflict:
                </p>
                <div className="space-y-1">
                  {(
                    [
                      ["create-new", "Create as new epic (safe)"],
                      ["replace", "Replace existing epic"],
                      ["merge", "Merge into existing epic"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="conflict"
                        value={value}
                        checked={conflictResolution === value}
                        onChange={() => setConflictResolution(value)}
                        className="border-[var(--border-primary)]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Working Method (only show for editing) */}
          {isEditing && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Working Method
              </label>
              <div className="relative">
                <select
                  value={workingMethod}
                  onChange={(e) => setWorkingMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none "
                >
                  {WORKING_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                />
              </div>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Controls environment detection for AI assistants
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-primary)]">
          <div>
            {isEditing && (
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={showDeleteModal}
                className="px-3 py-2 text-[var(--accent-danger)] hover:text-[var(--accent-danger)]/80 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-sm"
              >
                Delete Project
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            {showFormFields && (
              <button
                onClick={handleSave}
                disabled={isSaving || !canSubmit}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg font-medium transition-colors"
              >
                {isSaving && <Loader2 size={16} className="animate-spin" />}
                {isSaving
                  ? createMode === "import"
                    ? "Importing..."
                    : "Saving..."
                  : isEditing
                    ? "Save Changes"
                    : createMode === "import"
                      ? "Create & Import"
                      : "Create Project"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Directory Picker */}
      <DirectoryPicker
        isOpen={isDirectoryPickerOpen}
        initialPath={path || undefined}
        onSelect={(selectedPath) => setPath(selectedPath)}
        onClose={() => setIsDirectoryPickerOpen(false)}
      />

      {/* Delete Project Modal */}
      {project && (
        <DeleteProjectModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false);
            setDeleteError(null);
          }}
          onConfirm={handleDelete}
          isLoading={isDeleting}
          projectId={project.id}
          projectName={project.name}
          error={deleteError}
        />
      )}
    </div>
  );
}
