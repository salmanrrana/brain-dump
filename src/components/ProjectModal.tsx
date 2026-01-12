import { useState, useRef, useCallback } from "react";
import { X, ChevronDown, FolderOpen } from "lucide-react";
import { useCreateProject, useUpdateProject, useDeleteProject, useModalKeyboard, type ProjectBase } from "../lib/hooks";
import { type UpdateProjectInput } from "../api/projects";
import DirectoryPicker from "./DirectoryPicker";
import { COLOR_OPTIONS } from "../lib/constants";

const WORKING_METHOD_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "claude-code", label: "Claude Code" },
  { value: "vscode", label: "VS Code" },
];

interface ProjectModalProps {
  project?: ProjectBase | null;
  onClose: () => void;
  onSave: () => void;
}

export default function ProjectModal({
  project,
  onClose,
  onSave,
}: ProjectModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(project);

  const [name, setName] = useState(project?.name ?? "");
  const [path, setPath] = useState(project?.path ?? "");
  const [color, setColor] = useState(project?.color ?? "");
  const [workingMethod, setWorkingMethod] = useState(project?.workingMethod ?? "auto");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDirectoryPickerOpen, setIsDirectoryPickerOpen] = useState(false);

  // Mutation hooks
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const error = createMutation.error || updateMutation.error || deleteMutation.error;

  // Modal keyboard handling (Escape, focus trap)
  useModalKeyboard(modalRef, onClose, {
    shouldPreventClose: useCallback(() => showDeleteConfirm, [showDeleteConfirm]),
    onPreventedClose: useCallback(() => setShowDeleteConfirm(false), []),
    initialFocusRef: nameInputRef,
  });

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
      if (workingMethod === "auto" || workingMethod === "claude-code" || workingMethod === "vscode") {
        updates.workingMethod = workingMethod;
      }
      updateMutation.mutate(
        { id: project.id, updates },
        { onSuccess: onSave }
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

    deleteMutation.mutate(project.id, {
      onSuccess: onSave,
      onError: () => setShowDeleteConfirm(false),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-100">
            {isEditing ? "Edit Project" : "New Project"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-gray-100"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error instanceof Error ? error.message : "An error occurred"}
            </div>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-red-300 text-sm mb-3">
                Are you sure you want to delete this project? This will also
                delete all epics and tickets in this project.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 rounded text-sm font-medium"
                >
                  {isDeleting ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Path */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Path <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/home/user/projects/my-project"
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="button"
                onClick={() => setIsDirectoryPickerOpen(true)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 transition-colors"
                title="Browse directories"
              >
                <FolderOpen size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Directory must exist on your filesystem
            </p>
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Color
            </label>
            <div className="relative">
              <select
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {COLOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
            {color && (
              <div className="mt-2 flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-slate-400">Preview</span>
              </div>
            )}
          </div>

          {/* Working Method (only show for editing) */}
          {isEditing && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Working Method
              </label>
              <div className="relative">
                <select
                  value={workingMethod}
                  onChange={(e) => setWorkingMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {WORKING_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Controls environment detection for AI assistants
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800">
          <div>
            {isEditing && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={showDeleteConfirm}
                className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-lg transition-colors text-sm"
              >
                Delete Project
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-gray-100 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !name.trim() || !path.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium transition-colors"
            >
              {isSaving
                ? "Saving..."
                : isEditing
                  ? "Save Changes"
                  : "Create Project"}
            </button>
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
    </div>
  );
}
