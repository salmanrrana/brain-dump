import { useState, useRef, useCallback } from "react";
import {
  X,
  ChevronDown,
  Bot,
  Loader2,
  Save,
  Code2,
  Terminal,
  Monitor,
  Github,
  Download,
} from "lucide-react";
import { useForm } from "@tanstack/react-form-start";
import {
  useCreateEpic,
  useUpdateEpic,
  useDeleteEpic,
  useSettings,
  useTicketSummaries,
  useLaunchRalphForEpic,
  useModalKeyboard,
  useClickOutside,
  useAutoClearState,
} from "../lib/hooks";
import { useToast } from "./Toast";
import ErrorAlert from "./ErrorAlert";
import ExportModal from "./transfer/ExportModal";
import { COLOR_OPTIONS } from "../lib/constants";
import { epicFormOpts } from "./epics/epic-form-opts";
import { epicFormSchema } from "./epics/epic-form-schema";
import { startEpicWorkflowFn } from "../api/workflow-server-fns";
import { getEpicContext, getTicketContext } from "../api/context";
import {
  launchClaudeInTerminal,
  launchCodexInTerminal,
  launchVSCodeInTerminal,
  launchCursorInTerminal,
  launchCursorAgentInTerminal,
  launchCopilotInTerminal,
  launchOpenCodeInTerminal,
} from "../api/terminal";

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
    type: "success" | "error" | "info";
    message: string;
    launchMethod?: "vscode" | "cursor" | "copilot-cli" | "terminal";
    contextFile?: string;
  }>();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
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
  const { tickets } = useTicketSummaries(epic ? { projectId, epicId: epic.id } : {}, {
    enabled: Boolean(epic?.id),
  });

  // TanStack Form for epic data
  const form = useForm({
    ...epicFormOpts,
    defaultValues: {
      title: epic?.title ?? "",
      description: epic?.description ?? "",
      color: epic?.color ?? "",
    },
    validators: {
      onBlur: epicFormSchema,
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
    if (!trimmedTitle) {
      // Show feedback for empty title instead of silent return
      showToast("error", "Epic title is required");
      return;
    }

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
        {
          onSuccess: onSave,
          onError: (err) => {
            showToast(
              "error",
              `Failed to update epic: ${err instanceof Error ? err.message : "Unknown error"}`
            );
          },
        }
      );
    } else {
      createMutation.mutate(
        {
          title: trimmedTitle,
          projectId,
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
          ...(colorValue ? { color: colorValue } : {}),
        },
        {
          onSuccess: onSave,
          onError: (err) => {
            showToast(
              "error",
              `Failed to create epic: ${err instanceof Error ? err.message : "Unknown error"}`
            );
          },
        }
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
  // aiBackend param allows choosing between Claude, Codex, and OpenCode
  const handleStartRalph = useCallback(
    async ({
      useSandbox,
      aiBackend,
      workingMethodOverride,
    }: {
      useSandbox: boolean;
      aiBackend: "claude" | "opencode" | "codex" | "cursor-agent";
      workingMethodOverride?:
        | "auto"
        | "claude-code"
        | "vscode"
        | "opencode"
        | "cursor"
        | "cursor-agent"
        | "copilot-cli"
        | "codex";
    }) => {
      if (!epic) return;

      setIsStartingRalph(true);
      setRalphNotification(null);
      setShowActionMenu(false);

      try {
        // Get epic context (including project path for workflow initialization)
        const contextResult = await getEpicContext({ data: epic.id });

        // Initialize epic workflow first (git branch, workflow state, audit comment)
        const workflowResult = await startEpicWorkflowFn({
          data: {
            epicId: epic.id,
            projectPath: contextResult.projectPath,
          },
        });

        if (!workflowResult.success) {
          // Git checkout failed — warn but continue on current branch
          setRalphNotification({
            type: "info",
            message: `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`,
          });
        } else if (workflowResult.warnings?.length) {
          setRalphNotification({
            type: "info",
            message: workflowResult.warnings.join(". "),
          });
        }

        // Launch Ralph
        const result = await launchRalphMutation.mutateAsync({
          epicId: epic.id,
          // maxIterations now uses global setting from Settings
          preferredTerminal: settings?.terminalEmulator ?? null,
          useSandbox,
          aiBackend,
          ...(workingMethodOverride !== undefined ? { workingMethodOverride } : {}),
        });

        if (result.success) {
          // Check if VS Code launch path was used
          const launchMethod = "launchMethod" in result ? result.launchMethod : undefined;
          const contextFile = "contextFile" in result ? result.contextFile : undefined;

          // Build notification with optional fields only when they have values
          const notification: {
            type: "success";
            message: string;
            launchMethod?: "vscode" | "cursor" | "copilot-cli" | "terminal";
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
        // Error is displayed to user via notification - no console.error needed
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

  // Handle interactive launch for the next non-done ticket in this epic.
  const handleStartInteractive = useCallback(
    async (
      provider:
        | "claude"
        | "codex"
        | "codex-cli"
        | "codex-app"
        | "vscode"
        | "cursor"
        | "cursor-agent"
        | "copilot"
        | "opencode"
    ) => {
      if (!epic) return;

      const launchableTicket = tickets.find((ticket) => ticket.status !== "done");
      if (!launchableTicket) {
        setRalphNotification({
          type: "error",
          message: "No launchable tickets in this epic (all tickets are done).",
        });
        return;
      }

      setIsStartingRalph(true);
      setRalphNotification(null);
      setShowActionMenu(false);

      try {
        const contextResult = await getTicketContext({ data: launchableTicket.id });
        const payload = {
          ticketId: launchableTicket.id,
          context: contextResult.context,
          projectPath: contextResult.projectPath,
          preferredTerminal: settings?.terminalEmulator ?? null,
          projectName: contextResult.projectName,
          epicName: contextResult.epicName,
          ticketTitle: contextResult.ticketTitle,
        };

        const launchResult = await (async () => {
          switch (provider) {
            case "claude":
              return launchClaudeInTerminal({ data: payload });
            case "codex":
              return launchCodexInTerminal({ data: { ...payload, launchMode: "auto" } });
            case "codex-cli":
              return launchCodexInTerminal({ data: { ...payload, launchMode: "cli" } });
            case "codex-app":
              return launchCodexInTerminal({ data: { ...payload, launchMode: "app" } });
            case "vscode":
              return launchVSCodeInTerminal({ data: payload });
            case "cursor":
              return launchCursorInTerminal({ data: payload });
            case "cursor-agent":
              return launchCursorAgentInTerminal({ data: payload });
            case "copilot":
              return launchCopilotInTerminal({ data: payload });
            case "opencode":
              return launchOpenCodeInTerminal({ data: payload });
          }
        })();

        if (launchResult.warnings?.length) {
          setRalphNotification({
            type: "info",
            message: launchResult.warnings.join(". "),
          });
        }

        if (launchResult.success) {
          setRalphNotification({
            type: "success",
            message: `${launchResult.message} (Ticket: ${launchableTicket.title})`,
          });
          setTimeout(() => onSave(), 500);
        } else {
          setRalphNotification({
            type: "error",
            message: launchResult.message,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to launch provider";
        setRalphNotification({
          type: "error",
          message: errorMessage,
        });
      } finally {
        setIsStartingRalph(false);
      }
    },
    [epic, onSave, setRalphNotification, settings?.terminalEmulator, tickets]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-[var(--glass-border)]"
        style={{
          boxShadow: "var(--shadow-modal)",
          overflow: "visible",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <h2
            id="modal-title"
            className="text-lg font-semibold tracking-tight text-[var(--text-primary)]"
          >
            {isEditing ? "Edit Epic" : "New Epic"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-xl transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {/* Error */}
          <ErrorAlert error={error} />

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="p-4 bg-[var(--error-muted)] border border-[var(--error)]/30 rounded-xl">
              <p className="text-[var(--error)] text-sm mb-3">
                Are you sure you want to delete this epic? Tickets will become orphaned (not
                deleted).
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 bg-[var(--error)] text-white hover:brightness-110 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-xl text-sm font-medium transition-all"
                >
                  {isDeleting ? "Deleting..." : "Yes, Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] rounded-xl text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Title + Color row */}
          <div className="grid grid-cols-[1fr_140px] gap-4">
            <form.Field
              name="title"
              children={(field) => (
                <div>
                  <label
                    htmlFor={field.name}
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider"
                  >
                    Title <span className="text-[var(--error)]">*</span>
                  </label>
                  <input
                    ref={titleInputRef}
                    id={field.name}
                    type="text"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    placeholder="Epic name"
                    className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] text-base font-medium tracking-tight focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                  />
                  {field.state.meta.isTouched && field.state.meta.errors.length > 0 && (
                    <p className="mt-1 text-sm text-[var(--error)]" role="alert">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  )}
                </div>
              )}
            />

            <form.Field
              name="color"
              children={(field) => (
                <div>
                  <label
                    htmlFor={field.name}
                    className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider"
                  >
                    Color
                  </label>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      {field.state.value && (
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: field.state.value,
                            boxShadow: `0 0 6px ${field.state.value}`,
                          }}
                        />
                      )}
                      <select
                        id={field.name}
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        className="w-full px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] text-sm appearance-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                      >
                        {COLOR_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            />
          </div>

          {/* Description - full width, more room */}
          <form.Field
            name="description"
            children={(field) => (
              <div>
                <label
                  htmlFor={field.name}
                  className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider"
                >
                  Description
                </label>
                <textarea
                  id={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  rows={8}
                  placeholder="Optional description..."
                  className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] resize-vertical min-h-[140px] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                />
              </div>
            )}
          />
        </div>

        {/* Ralph Notification */}
        {ralphNotification && (
          <div
            className={`mx-5 mb-0 p-3 rounded-xl text-sm ${
              ralphNotification.type === "success"
                ? "bg-[var(--success-muted)] text-[var(--success-text)] border border-[var(--success)]/50"
                : ralphNotification.type === "info"
                  ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)]"
                  : "bg-[var(--accent-danger)]/20 text-[var(--accent-danger)] border border-[var(--accent-danger)]/50"
            }`}
          >
            <div className="flex items-start gap-2">
              <Bot size={16} className="mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span>{ralphNotification.message}</span>
                {/* Editor-specific instructions (VS Code, OpenCode, etc.) */}
                {ralphNotification.launchMethod &&
                  ralphNotification.launchMethod !== "terminal" &&
                  ralphNotification.contextFile && (
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
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--border-primary)]">
          <div>
            {isEditing && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={showDeleteConfirm}
                className="px-3 py-2 text-[var(--error)] hover:bg-[var(--error-muted)] rounded-xl transition-colors text-sm font-medium"
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
                    className={`flex items-center gap-2 px-5 py-2 bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:brightness-110 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] font-medium transition-all shadow-sm ${isEditing ? "rounded-l-xl" : "rounded-xl"}`}
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
                  className="flex items-center px-2 py-2 bg-[var(--accent-primary)] text-[var(--text-on-accent)] hover:brightness-110 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-r-xl border-l border-[var(--text-on-accent)]/20 transition-all"
                  aria-label="More actions"
                >
                  <ChevronDown size={16} />
                </button>
              )}
            </div>

            {/* Dropdown Menu */}
            {showActionMenu && isEditing && (
              <div className="absolute right-0 bottom-full mb-2 w-[46rem] max-w-[95vw] bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-xl shadow-xl z-[80] overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-primary)]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
                      <Terminal size={14} className="text-[var(--success)]" />
                      <span className="text-xs font-semibold text-[var(--success)] uppercase tracking-wider">
                        Interactive
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3">
                      <button
                        onClick={() => void handleStartInteractive("claude")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Terminal size={14} className="text-[var(--success)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Claude</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("codex")}
                        title="Try Codex CLI first, then Codex App if CLI is unavailable."
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Terminal size={14} className="text-[var(--success)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Codex Auto</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("codex-cli")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Terminal size={14} className="text-[var(--success)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Codex CLI</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("codex-app")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Code2 size={14} className="text-[var(--success)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Codex App</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("vscode")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Code2 size={14} className="text-[var(--accent-primary)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">VS Code</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("cursor")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Monitor size={14} className="text-[var(--warning)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Cursor Editor</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("cursor-agent")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Terminal size={14} className="text-[var(--warning)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Cursor Agent</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("copilot")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Github size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Copilot CLI</span>
                      </button>
                      <button
                        onClick={() => void handleStartInteractive("opencode")}
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Code2 size={14} className="text-[var(--info)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">OpenCode</span>
                      </button>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-primary)] border-b border-[var(--border-primary)]">
                      <Bot size={14} className="text-[var(--accent-ai)]" />
                      <span className="text-xs font-semibold text-[var(--accent-ai)] uppercase tracking-wider">
                        Ralph
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 p-3">
                      <button
                        onClick={() =>
                          void handleStartRalph({ useSandbox: false, aiBackend: "claude" })
                        }
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Bot size={14} className="text-[var(--accent-ai)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Claude</span>
                      </button>
                      <button
                        onClick={() =>
                          void handleStartRalph({ useSandbox: false, aiBackend: "codex" })
                        }
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Terminal size={14} className="text-[var(--success)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Codex</span>
                      </button>
                      <button
                        onClick={() =>
                          void handleStartRalph({
                            useSandbox: false,
                            aiBackend: "cursor-agent",
                          })
                        }
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Terminal size={14} className="text-[var(--warning)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Cursor Agent</span>
                      </button>
                      <button
                        onClick={() =>
                          void handleStartRalph({
                            useSandbox: false,
                            aiBackend: "claude",
                            workingMethodOverride: "copilot-cli",
                          })
                        }
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Github size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">Copilot CLI</span>
                      </button>
                      <button
                        onClick={() =>
                          void handleStartRalph({ useSandbox: false, aiBackend: "opencode" })
                        }
                        className="flex items-center gap-2 rounded-xl border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] hover:border-[var(--border-secondary)] transition-all"
                      >
                        <Code2 size={14} className="text-[var(--accent-ai)] flex-shrink-0" />
                        <span className="text-sm text-[var(--text-primary)]">OpenCode</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Export section */}
                <div className="border-t border-[var(--border-primary)] p-3">
                  <button
                    onClick={() => {
                      setShowActionMenu(false);
                      setShowExportModal(true);
                    }}
                    className="flex items-center gap-2 w-full rounded-md border border-[var(--border-primary)] px-2.5 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Download size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
                    <span className="text-sm text-[var(--text-primary)]">Export Epic</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {epic && showExportModal && (
        <ExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          mode="epic"
          targetId={epic.id}
          targetName={epic.title}
        />
      )}
    </div>
  );
}
