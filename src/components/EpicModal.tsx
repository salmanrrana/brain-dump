import { useState, useRef, useCallback } from "react";
import { X, ChevronDown, Bot, Loader2, Save, Container } from "lucide-react";
import {
  useCreateEpic,
  useUpdateEpic,
  useDeleteEpic,
  useSettings,
  useLaunchRalphForEpic,
  useModalKeyboard,
  useClickOutside,
  useAutoClearState,
  useDockerAvailability,
} from "../lib/hooks";
import { useToast } from "./Toast";
import ErrorAlert from "./ErrorAlert";
import { COLOR_OPTIONS } from "../lib/constants";

interface Epic {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  color: string | null;
}

interface EpicModalProps {
  epic?: Epic | null;
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}

export default function EpicModal({ epic, projectId, onClose, onSave }: EpicModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(epic);

  const [title, setTitle] = useState(epic?.title ?? "");
  const [description, setDescription] = useState(epic?.description ?? "");
  const [color, setColor] = useState(epic?.color ?? "");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isStartingRalph, setIsStartingRalph] = useState(false);
  // Auto-clears to null after 5 seconds for notification clearing
  const [ralphNotification, setRalphNotification] = useAutoClearState<{
    type: "success" | "error";
    message: string;
    launchMethod?: "vscode" | "terminal";
    contextFile?: string;
  }>();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Toast
  const { showToast } = useToast();

  // Mutation hooks
  const createMutation = useCreateEpic();
  const updateMutation = useUpdateEpic();
  const deleteMutation = useDeleteEpic();

  // Settings and Ralph hooks
  const { settings } = useSettings();
  const launchRalphMutation = useLaunchRalphForEpic();
  const {
    isAvailable: dockerAvailable,
    message: dockerMessage,
    loading: dockerLoading,
  } = useDockerAvailability();

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const error = createMutation.error || updateMutation.error || deleteMutation.error;

  // Modal keyboard handling (Escape, focus trap)
  useModalKeyboard(modalRef, onClose, {
    shouldPreventClose: useCallback(
      () => showActionMenu || showDeleteConfirm,
      [showActionMenu, showDeleteConfirm]
    ),
    onPreventedClose: useCallback(() => {
      if (showActionMenu) setShowActionMenu(false);
      else if (showDeleteConfirm) setShowDeleteConfirm(false);
    }, [showActionMenu, showDeleteConfirm]),
    initialFocusRef: titleInputRef,
  });

  // Close action menu when clicking outside
  useClickOutside(
    actionMenuRef,
    useCallback(() => setShowActionMenu(false), []),
    showActionMenu
  );

  const handleSave = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    if (isEditing && epic) {
      updateMutation.mutate(
        {
          id: epic.id,
          updates: {
            title: trimmedTitle,
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(color ? { color } : {}),
          },
        },
        { onSuccess: onSave }
      );
    } else {
      createMutation.mutate(
        {
          title: trimmedTitle,
          projectId,
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(color ? { color } : {}),
        },
        { onSuccess: onSave }
      );
    }
  };

  const handleDelete = () => {
    if (!epic) return;

    deleteMutation.mutate(
      { epicId: epic.id, confirm: true },
      {
        onSuccess: () => {
          showToast("success", `Epic "${epic.title}" deleted`);
          onSave();
        },
        onError: (error) => {
          setShowDeleteConfirm(false);
          showToast(
            "error",
            `Failed to delete epic: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        },
      }
    );
  };

  // Handle Start Ralph for entire epic
  // useSandbox param allows explicit choice at launch time, overriding settings default
  const handleStartRalph = useCallback(
    async ({ useSandbox }: { useSandbox: boolean }) => {
      if (!epic) return;

      setIsStartingRalph(true);
      setRalphNotification(null);

      try {
        const result = await launchRalphMutation.mutateAsync({
          epicId: epic.id,
          maxIterations: 20, // More iterations for epics with multiple tickets
          preferredTerminal: settings?.terminalEmulator ?? null,
          useSandbox,
        });

        if (result.success) {
          // Check if VS Code launch path was used
          const launchMethod = "launchMethod" in result ? result.launchMethod : undefined;
          const contextFile = "contextFile" in result ? result.contextFile : undefined;

          // Build notification with optional fields only when they have values
          const notification: {
            type: "success";
            message: string;
            launchMethod?: "vscode" | "terminal";
            contextFile?: string;
          } = {
            type: "success",
            message: result.message,
          };
          if (launchMethod) notification.launchMethod = launchMethod;
          if (contextFile) notification.contextFile = contextFile;

          setRalphNotification(notification);
          setTimeout(() => onSave(), 500);
        } else {
          setRalphNotification({
            type: "error",
            message: result.message,
          });
        }
        // Auto-hide is handled by useAutoClearState hook
      } catch (error) {
        console.error("Failed to start Ralph:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to launch Ralph";
        setRalphNotification({
          type: "error",
          message: errorMessage,
        });
      } finally {
        setIsStartingRalph(false);
      }
    },
    [epic, settings?.terminalEmulator, launchRalphMutation, onSave, setRalphNotification]
  );

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
        className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-100">
            {isEditing ? "Edit Epic" : "New Epic"}
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
          <ErrorAlert error={error} />

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="p-4 bg-red-900/30 border border-red-700 rounded-lg">
              <p className="text-red-300 text-sm mb-3">
                Are you sure you want to delete this epic? Tickets in this epic will become orphaned
                (not deleted).
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

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Epic name"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">Color</label>
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
                <span className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                <span className="text-xs text-slate-400">Preview</span>
              </div>
            )}
          </div>
        </div>

        {/* Ralph Notification */}
        {ralphNotification && (
          <div
            className={`mx-4 mb-0 p-3 rounded-lg text-sm ${
              ralphNotification.type === "success"
                ? "bg-green-900/50 text-green-300 border border-green-800"
                : "bg-red-900/50 text-red-300 border border-red-800"
            }`}
          >
            <div className="flex items-start gap-2">
              <Bot size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span>{ralphNotification.message}</span>
                {/* Editor-specific instructions (VS Code, OpenCode, etc.) */}
                {ralphNotification.launchMethod === "vscode" && ralphNotification.contextFile && (
                  <div className="mt-2 text-xs text-green-400/80">
                    <p className="font-medium">Next steps:</p>
                    <ol className="list-decimal list-inside mt-1 space-y-0.5">
                      <li>Open the Ralph context file in your editor</li>
                      <li>Start a new chat with your AI assistant</li>
                      <li>Ask the AI to read and follow the instructions</li>
                    </ol>
                    <p className="mt-1.5 text-green-300/60 font-mono truncate">
                      {ralphNotification.contextFile.replace(/^.*\/\.claude\//, ".claude/")}
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => setRalphNotification(null)}
                className="text-slate-400 hover:text-gray-100 flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-800">
          <div>
            {isEditing && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={showDeleteConfirm}
                className="px-3 py-2 text-red-400 hover:text-red-300 hover:bg-slate-800 rounded-lg transition-colors text-sm"
              >
                Delete Epic
              </button>
            )}
          </div>

          {/* Action Split Button */}
          <div className="relative" ref={actionMenuRef}>
            <div className="flex">
              <button
                onClick={handleSave}
                disabled={isSaving || !title.trim()}
                className={`flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 font-medium transition-colors ${isEditing ? "rounded-l-lg" : "rounded-lg"}`}
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{isEditing ? "Save Changes" : "Create Epic"}</span>
              </button>
              {isEditing && (
                <button
                  onClick={() => setShowActionMenu(!showActionMenu)}
                  disabled={isSaving || isStartingRalph}
                  className="flex items-center px-2 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-r-lg border-l border-cyan-700 transition-colors"
                  aria-label="More actions"
                >
                  <ChevronDown size={16} />
                </button>
              )}
            </div>

            {/* Dropdown Menu */}
            {showActionMenu && isEditing && (
              <div className="absolute right-0 bottom-full mb-2 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 overflow-hidden">
                <button
                  onClick={() => {
                    setShowActionMenu(false);
                    handleSave();
                  }}
                  disabled={isSaving || !title.trim()}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left disabled:opacity-50"
                >
                  <Save size={18} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-100">Save Changes</div>
                    <div className="text-xs text-slate-400">Save epic details</div>
                  </div>
                </button>
                <button
                  onClick={() => void handleStartRalph({ useSandbox: false })}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left border-t border-slate-700"
                >
                  <Bot size={18} className="text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-100">Start Ralph (Native)</div>
                    <div className="text-xs text-slate-400">Runs on your machine directly</div>
                  </div>
                </button>
                <button
                  onClick={() => void handleStartRalph({ useSandbox: true })}
                  disabled={dockerLoading || !dockerAvailable}
                  className={`w-full flex items-start gap-3 px-4 py-3 transition-colors text-left border-t border-slate-700 ${
                    dockerLoading || !dockerAvailable
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-slate-700"
                  }`}
                  title={!dockerAvailable ? dockerMessage : undefined}
                  aria-disabled={!dockerAvailable}
                  aria-describedby={!dockerAvailable ? "docker-unavailable-msg" : undefined}
                >
                  <Container size={18} className="text-cyan-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-100">Start Ralph in Docker</div>
                    <div className="text-xs text-slate-400">
                      {dockerLoading
                        ? "Checking Docker..."
                        : !dockerAvailable
                          ? dockerMessage
                          : "Isolated container environment"}
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
