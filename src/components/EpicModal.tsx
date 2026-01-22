import { useState, useRef, useCallback } from "react";
import { X, ChevronDown, Bot, Loader2, Save, Container, Code2 } from "lucide-react";
import { useForm } from "@tanstack/react-form-start";
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
import { epicFormOpts } from "./epics/epic-form-opts";
import { epicFormSchema } from "./epics/epic-form-schema";

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

  // UI state (not form data)
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
  // Docker availability check - not currently used since Docker options are disabled
  // but keeping the hook call for future re-enablement
  useDockerAvailability();

  // TanStack Form for epic data
  const form = useForm({
    ...epicFormOpts,
    defaultValues: {
      title: epic?.title ?? "",
      description: epic?.description ?? "",
      color: epic?.color ?? "",
    },
    validators: {
      onChange: epicFormSchema,
    },
  });

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
    const formValues = form.state.values;
    const trimmedTitle = formValues.title.trim();
    if (!trimmedTitle) return;

    const trimmedDescription = formValues.description.trim();
    const colorValue = formValues.color;

    if (isEditing && epic) {
      updateMutation.mutate(
        {
          id: epic.id,
          updates: {
            title: trimmedTitle,
            ...(trimmedDescription ? { description: trimmedDescription } : {}),
            ...(colorValue ? { color: colorValue } : {}),
          },
        },
        { onSuccess: onSave }
      );
    } else {
      createMutation.mutate(
        {
          title: trimmedTitle,
          projectId,
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
          ...(colorValue ? { color: colorValue } : {}),
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
  // aiBackend param allows choosing between Claude and OpenCode
  const handleStartRalph = useCallback(
    async ({
      useSandbox,
      aiBackend,
    }: {
      useSandbox: boolean;
      aiBackend: "claude" | "opencode";
    }) => {
      if (!epic) return;

      setIsStartingRalph(true);
      setRalphNotification(null);

      try {
        const result = await launchRalphMutation.mutateAsync({
          epicId: epic.id,
          // maxIterations now uses global setting from Settings
          preferredTerminal: settings?.terminalEmulator ?? null,
          useSandbox,
          aiBackend,
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

      {/* Modal - with theme-colored glow effect */}
      {/* Note: overflow-visible allows the dropdown menu to render outside modal bounds */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-md max-h-[90vh] flex flex-col"
        style={{
          boxShadow: "var(--shadow-modal)",
          overflow: "visible",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2 id="modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            {isEditing ? "Edit Epic" : "New Epic"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
            <div className="p-4 bg-[var(--accent-danger)]/20 border border-[var(--accent-danger)]/50 rounded-lg">
              <p className="text-[var(--accent-danger)] text-sm mb-3">
                Are you sure you want to delete this epic? Tickets in this epic will become orphaned
                (not deleted).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 bg-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/80 disabled:bg-[var(--bg-tertiary)] rounded text-sm font-medium"
                >
                  {isDeleting ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Title */}
          <form.Field
            name="title"
            children={(field) => (
              <div>
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
                >
                  Title <span className="text-[var(--accent-danger)]">*</span>
                </label>
                <input
                  ref={titleInputRef}
                  id={field.name}
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Epic name"
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)]"
                />
                {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                  <p className="mt-1 text-sm text-[var(--accent-danger)]" role="alert">
                    {field.state.meta.errors.join(", ")}
                  </p>
                )}
              </div>
            )}
          />

          {/* Description */}
          <form.Field
            name="description"
            children={(field) => (
              <div>
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
                >
                  Description
                </label>
                <textarea
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  rows={5}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] resize-vertical min-h-[100px]"
                />
              </div>
            )}
          />

          {/* Color */}
          <form.Field
            name="color"
            children={(field) => (
              <div>
                <label
                  htmlFor={field.name}
                  className="block text-sm font-medium text-[var(--text-secondary)] mb-1"
                >
                  Color
                </label>
                <div className="relative">
                  <select
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none"
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
                {field.state.value && (
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: field.state.value }}
                    />
                    <span className="text-xs text-[var(--text-secondary)]">Preview</span>
                  </div>
                )}
              </div>
            )}
          />
        </div>

        {/* Ralph Notification */}
        {ralphNotification && (
          <div
            className={`mx-4 mb-0 p-3 rounded-lg text-sm ${
              ralphNotification.type === "success"
                ? "bg-[var(--success-muted)] text-[var(--success-text)] border border-[var(--success)]/50"
                : "bg-[var(--accent-danger)]/20 text-[var(--accent-danger)] border border-[var(--accent-danger)]/50"
            }`}
          >
            <div className="flex items-start gap-2">
              <Bot size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span>{ralphNotification.message}</span>
                {/* Editor-specific instructions (VS Code, OpenCode, etc.) */}
                {ralphNotification.launchMethod === "vscode" && ralphNotification.contextFile && (
                  <div className="mt-2 text-xs text-[var(--success)]/80">
                    <p className="font-medium">Next steps:</p>
                    <ol className="list-decimal list-inside mt-1 space-y-0.5">
                      <li>Open the Ralph context file in your editor</li>
                      <li>Start a new chat with your AI assistant</li>
                      <li>Ask the AI to read and follow the instructions</li>
                    </ol>
                    <p className="mt-1.5 text-[var(--success-text)]/60 font-mono truncate">
                      {ralphNotification.contextFile.replace(/^.*\/\.claude\//, ".claude/")}
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={() => setRalphNotification(null)}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex-shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-[var(--border-primary)]">
          <div>
            {isEditing && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={showDeleteConfirm}
                className="px-3 py-2 text-[var(--accent-danger)] hover:text-[var(--accent-danger)]/80 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-sm"
              >
                Delete Epic
              </button>
            )}
          </div>

          {/* Action Split Button */}
          <div className="relative" ref={actionMenuRef}>
            <div className="flex">
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  title: state.values.title,
                })}
                children={({ canSubmit, title }) => (
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !title.trim() || !canSubmit}
                    className={`flex items-center gap-2 px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] font-medium transition-colors ${isEditing ? "rounded-l-lg" : "rounded-lg"}`}
                  >
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    <span>{isEditing ? "Save Changes" : "Create Epic"}</span>
                  </button>
                )}
              />
              {isEditing && (
                <button
                  onClick={() => setShowActionMenu(!showActionMenu)}
                  disabled={isSaving || isStartingRalph}
                  className="flex items-center px-2 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-r-lg border-l border-[var(--accent-secondary)] transition-colors"
                  aria-label="More actions"
                >
                  <ChevronDown size={16} />
                </button>
              )}
            </div>

            {/* Dropdown Menu - compact version */}
            {showActionMenu && isEditing && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-[60] overflow-hidden">
                {/* Ralph Section Header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
                  <Bot size={14} className="text-[var(--accent-ai)]" />
                  <span className="text-xs font-semibold text-[var(--accent-ai)]">Start Ralph</span>
                </div>

                {/* Ralph with Claude */}
                <button
                  onClick={() => void handleStartRalph({ useSandbox: false, aiBackend: "claude" })}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <Bot size={14} className="text-[var(--accent-ai)] flex-shrink-0" />
                  <span className="text-sm text-[var(--text-primary)]">Claude</span>
                </button>

                {/* Ralph with Claude - Docker */}
                <button
                  disabled
                  className="w-full flex items-center gap-2 px-3 py-2 transition-colors text-left border-t border-[var(--border-primary)] opacity-40 cursor-not-allowed"
                >
                  <Container size={14} className="text-[var(--text-tertiary)] flex-shrink-0" />
                  <span className="text-sm text-[var(--text-secondary)]">Claude (Docker)</span>
                  <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">WIP</span>
                </button>

                {/* Ralph with OpenCode */}
                <button
                  onClick={() =>
                    void handleStartRalph({ useSandbox: false, aiBackend: "opencode" })
                  }
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] transition-colors text-left border-t border-[var(--border-primary)]"
                >
                  <Code2 size={14} className="text-[var(--accent-ai)] flex-shrink-0" />
                  <span className="text-sm text-[var(--text-primary)]">OpenCode</span>
                </button>

                {/* Ralph with OpenCode - Docker */}
                <button
                  disabled
                  className="w-full flex items-center gap-2 px-3 py-2 transition-colors text-left border-t border-[var(--border-primary)] opacity-40 cursor-not-allowed"
                >
                  <Container size={14} className="text-[var(--text-tertiary)] flex-shrink-0" />
                  <span className="text-sm text-[var(--text-secondary)]">OpenCode (Docker)</span>
                  <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">WIP</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
