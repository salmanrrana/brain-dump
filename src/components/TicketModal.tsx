import { useState, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useForm, useStore } from "@tanstack/react-form-start";
import { useNavigate } from "@tanstack/react-router";
import {
  useModalKeyboard,
  useClickOutside,
  useDeleteTicket,
  useTicketDeletePreview,
} from "../lib/hooks";
import DeleteConfirmationModal from "./DeleteConfirmationModal";
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Clipboard,
  Terminal,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Copy,
  FolderOpen,
} from "lucide-react";
import type { Ticket, Epic } from "../lib/hooks";
import {
  useUpdateTicket,
  useSettings,
  useLaunchRalphForTicket,
  useTags,
  useAutoClearState,
  useActiveRalphSessions,
} from "../lib/hooks";
import { RalphStatusBadge } from "./RalphStatusBadge";
import { useToast } from "./Toast";
import ErrorAlert from "./ErrorAlert";
import type { TicketStatus, TicketPriority } from "../api/tickets";
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  POLLING_INTERVALS,
  getPrStatusIconColor,
  getPrStatusBadgeStyle,
} from "../lib/constants";
import type { UiLaunchProviderId } from "../lib/launch-provider-contract";
import {
  dispatchInteractiveUiLaunch,
  dispatchRalphAutonomousUiLaunch,
  defaultRalphLaunchDependencies,
} from "../lib/ui-launch-dispatcher";
import {
  getInteractiveUiLaunchProvider,
  getRalphAutonomousUiLaunchProvider,
} from "../lib/ui-launch-registry";
import { safeJsonParse } from "../lib/utils";
import { LaunchProviderMenu } from "./LaunchProviderMenu";
import { ticketFormOpts } from "./tickets/ticket-form-opts";
import { RemovableCopyableTagPill } from "./tickets/TagInput";
import {
  ticketFormSchema,
  type TicketFormData,
  type AcceptanceCriterion,
  type AcceptanceCriterionStatus,
} from "./tickets/ticket-form-schema";

// Lazy-loaded sections — each owns its own data subscriptions and state
const DemoPanel = lazy(() => import("./tickets/DemoPanel").then((m) => ({ default: m.DemoPanel })));
const TelemetryPanel = lazy(() =>
  import("./TelemetryPanel").then((m) => ({ default: m.TelemetryPanel }))
);
const ClaudeTasks = lazy(() =>
  import("./tickets/ClaudeTasks").then((m) => ({ default: m.ClaudeTasks }))
);
const AttachmentsSection = lazy(() =>
  import("./tickets/AttachmentsSection").then((m) => ({ default: m.AttachmentsSection }))
);
const ModalCommentsSection = lazy(() =>
  import("./tickets/ModalCommentsSection").then((m) => ({ default: m.ModalCommentsSection }))
);
const ServicesSection = lazy(() =>
  import("./tickets/ServicesSection").then((m) => ({ default: m.ServicesSection }))
);

function SectionFallback() {
  return (
    <div className="flex items-center justify-center py-4 text-[var(--text-tertiary)]">
      <Loader2 size={16} className="animate-spin" />
    </div>
  );
}

interface TicketModalProps {
  ticket: Ticket;
  epics: Epic[];
  onClose: () => void;
  onUpdate: () => void;
}

// Stable empty state for tag suggestions to prevent recreation on every render
const EMPTY_TAG_STATE = { tagSuggestions: [] as string[], showCreateHelper: false };

function isClipboardLaunchResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    "method" in result &&
    result.method === "clipboard"
  );
}

/**
 * Convert legacy subtasks to acceptance criteria format.
 * Handles both old {id, text, completed} and new AcceptanceCriterion formats.
 */
function parseAcceptanceCriteria(subtasksJson: string | null): AcceptanceCriterion[] {
  if (!subtasksJson) return [];

  try {
    const parsed = JSON.parse(subtasksJson);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => {
      // Check if it's already in AcceptanceCriterion format
      if ("criterion" in item && "status" in item) {
        return item as AcceptanceCriterion;
      }
      // Convert legacy subtask format
      return {
        id: item.id ?? crypto.randomUUID(),
        criterion: item.text ?? item.criterion ?? "",
        status: item.completed ? "passed" : "pending",
        verifiedBy: item.completed ? "human" : undefined,
        verifiedAt: item.completed ? new Date().toISOString() : undefined,
      } as AcceptanceCriterion;
    });
  } catch {
    return [];
  }
}

export default function TicketModal({ ticket, epics, onClose, onUpdate }: TicketModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const selectedEpic = useMemo(
    () => epics.find((epic) => epic.id === ticket.epicId) ?? null,
    [epics, ticket.epicId]
  );

  // TanStack Form - replaces 10 form-related useState hooks
  const form = useForm({
    ...ticketFormOpts,
    defaultValues: {
      title: ticket.title,
      description: ticket.description ?? "",
      status: ticket.status as TicketFormData["status"],
      priority: (ticket.priority as TicketFormData["priority"]) ?? undefined,
      epicId: ticket.epicId ?? undefined,
      tags: safeJsonParse<string[]>(ticket.tags, []),
      acceptanceCriteria: parseAcceptanceCriteria(ticket.subtasks),
      isBlocked: ticket.isBlocked ?? false,
      blockedReason: ticket.blockedReason ?? "",
    },
    validators: {
      onBlur: ticketFormSchema,
    },
  });

  // UI state for tag input (not form data - intermediate input state)
  const [newTag, setNewTag] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // UI state for acceptance criteria input (not form data - intermediate input state)
  const [newCriterion, setNewCriterion] = useState("");

  // Start work UI state
  const [isStartingWork, setIsStartingWork] = useState(false);
  const [startWorkNotification, setStartWorkNotification] = useAutoClearState<{
    type: "success" | "error";
    message: string;
  }>();
  const [showStartWorkMenu, setShowStartWorkMenu] = useState(false);
  const startWorkMenuRef = useRef<HTMLDivElement>(null);

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Use mutation hook for type-safe updates with cache invalidation
  const updateTicketMutation = useUpdateTicket();

  // Get settings for terminal preference
  const { settings } = useSettings();

  // Toast notifications
  const { showToast } = useToast();

  // Ralph mutation hook
  const launchRalphMutation = useLaunchRalphForTicket();

  // Delete mutation hook
  const deleteTicketMutation = useDeleteTicket();

  // Fetch delete preview when confirmation modal opens (dry-run)
  const { data: deletePreview } = useTicketDeletePreview(ticket.id, showDeleteConfirm);

  // Reactive subscriptions to form state — useStore ensures the component
  // re-renders when these specific values change (useForm alone does NOT
  // subscribe the component to store changes, so reading form.state.values
  // directly gives a stale snapshot that never updates the UI).
  const currentStatus = useStore(form.store, (s) => s.values.status);
  const formTags = useStore(form.store, (s) => s.values.tags);
  const formCriteria = useStore(form.store, (s) => s.values.acceptanceCriteria);

  // Ralph session status - poll when ticket is in progress
  const { getSession: getRalphSession } = useActiveRalphSessions({
    pollingInterval:
      currentStatus === "in_progress"
        ? POLLING_INTERVALS.COMMENTS_ACTIVE
        : POLLING_INTERVALS.DISABLED,
  });
  const ralphSession = getRalphSession(ticket.id);

  // Fetch existing tags for the ticket's project
  const {
    tags: existingTags,
    loading: tagsLoading,
    error: tagsError,
  } = useTags(ticket.projectId ? { projectId: ticket.projectId } : {});

  // Filter suggestions based on input and determine helper visibility
  const { tagSuggestions, showCreateHelper } = useMemo(() => {
    const trimmedInput = newTag.trim();
    if (!trimmedInput) {
      return EMPTY_TAG_STATE;
    }

    const inputLower = trimmedInput.toLowerCase();
    const suggestions = existingTags.filter(
      (tag) => tag.toLowerCase().includes(inputLower) && !formTags.includes(tag)
    );
    const exactMatch = existingTags.some((tag) => tag.toLowerCase() === inputLower);

    return {
      tagSuggestions: suggestions,
      showCreateHelper: suggestions.length === 0 && !exactMatch,
    };
  }, [newTag, existingTags, formTags]);

  // Modal keyboard handling (Escape, focus trap)
  useModalKeyboard(modalRef, onClose, {
    shouldPreventClose: useCallback(() => showStartWorkMenu, [showStartWorkMenu]),
    onPreventedClose: useCallback(() => setShowStartWorkMenu(false), []),
  });

  const handleOpenEpic = useCallback(() => {
    if (!selectedEpic) {
      return;
    }

    void navigate({
      to: "/epic/$id",
      params: { id: selectedEpic.id },
    }).catch(() => {
      showToast("error", "Failed to open epic details");
    });
  }, [navigate, selectedEpic, showToast]);

  // Close dropdown when clicking outside
  useClickOutside(
    startWorkMenuRef,
    useCallback(() => setShowStartWorkMenu(false), []),
    showStartWorkMenu
  );

  // Close tag dropdown when clicking outside
  const closeTagDropdown = useCallback(() => {
    setIsTagDropdownOpen(false);
    setSelectedSuggestionIndex(-1);
  }, []);
  useClickOutside(tagDropdownRef, closeTagDropdown, isTagDropdownOpen, tagInputRef);

  const handleTicketLaunch = useCallback(
    async (providerId: UiLaunchProviderId) => {
      setIsStartingWork(true);
      setStartWorkNotification(null);
      setShowStartWorkMenu(false);

      try {
        const interactiveProvider = getInteractiveUiLaunchProvider(providerId);
        const ralphProvider = getRalphAutonomousUiLaunchProvider(providerId);

        if (interactiveProvider) {
          const launchResult = await dispatchInteractiveUiLaunch(interactiveProvider, {
            kind: "ticket",
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
          });

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            setStartWorkNotification({ type: "success", message: launchResult.message });

            if (!isClipboardLaunchResult(launchResult)) {
              form.setFieldValue("status", "in_progress");
              setTimeout(() => onUpdate(), 500);
            }
          } else {
            showToast("error", launchResult.message);
            setStartWorkNotification({ type: "error", message: launchResult.message });
          }
          return;
        }

        if (ralphProvider) {
          const result = await dispatchRalphAutonomousUiLaunch(
            ralphProvider,
            {
              kind: "ticket",
              ticketId: ticket.id,
              preferredTerminal: settings?.terminalEmulator ?? null,
            },
            {
              ...defaultRalphLaunchDependencies,
              launchTicketRalph: async (payload) => {
                const launchResult = await launchRalphMutation.mutateAsync(payload);
                return {
                  success: launchResult.success,
                  message: launchResult.message,
                  ...(launchResult.warnings ? { warnings: launchResult.warnings } : {}),
                  ...("terminalUsed" in launchResult && launchResult.terminalUsed
                    ? { terminalUsed: launchResult.terminalUsed }
                    : {}),
                };
              },
              launchEpicRalph: async () => ({
                success: false,
                message: "Epic Ralph launch is not available from the ticket modal.",
              }),
            }
          );

          if (result.warnings) {
            result.warnings.forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            form.setFieldValue("status", "in_progress");
            setStartWorkNotification({ type: "success", message: result.message });
            setTimeout(() => onUpdate(), 500);
          } else {
            showToast("error", result.message);
            setStartWorkNotification({ type: "error", message: result.message });
          }
          return;
        }

        showToast("error", `Unknown launch provider: ${providerId}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "An unexpected error occurred";
        showToast("error", `Failed to launch: ${message}`);
        setStartWorkNotification({ type: "error", message: "Failed to launch provider" });
      } finally {
        setIsStartingWork(false);
      }
    },
    [
      ticket.id,
      onUpdate,
      settings?.terminalEmulator,
      showToast,
      setStartWorkNotification,
      form,
      launchRalphMutation,
    ]
  );

  // Handle delete ticket confirmation
  const handleDeleteConfirm = useCallback(() => {
    setDeleteError(null);
    deleteTicketMutation.mutate(
      { ticketId: ticket.id, confirm: true },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false);
          showToast("success", `Ticket "${ticket.title}" deleted`);
          onClose();
          onUpdate();
        },
        onError: (error: Error) => {
          setDeleteError(error.message || "Failed to delete ticket");
        },
      }
    );
  }, [ticket.id, ticket.title, deleteTicketMutation, showToast, onClose, onUpdate]);

  const handleSave = useCallback(() => {
    if (updateTicketMutation.isPending) {
      return;
    }

    const values = form.state.values;

    // Build updates object conditionally to satisfy exactOptionalPropertyTypes
    const updates: Parameters<typeof updateTicketMutation.mutate>[0]["updates"] = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      status: values.status,
      epicId: values.epicId || null,
      isBlocked: values.isBlocked,
      blockedReason: values.isBlocked ? values.blockedReason : null,
    };

    // Only include optional fields if they have values
    if (values.priority) {
      updates.priority = values.priority;
    }
    // Always send tags (including []) so clearing the last tag persists.
    updates.tags = values.tags;
    if (values.acceptanceCriteria.length > 0) {
      updates.acceptanceCriteria = values.acceptanceCriteria;
    }

    updateTicketMutation.mutate({ id: ticket.id, updates }, { onSuccess: onUpdate });
  }, [ticket.id, form, onUpdate, updateTicketMutation]);

  // Tag management functions
  const addTag = useCallback(
    (tagToAdd?: string) => {
      const tag = (tagToAdd ?? newTag).trim();
      const currentTags = form.state.values.tags;
      if (tag && !currentTags.includes(tag)) {
        form.setFieldValue("tags", [...currentTags, tag]);
        setNewTag("");
        closeTagDropdown();
      }
    },
    [newTag, form, closeTagDropdown]
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      const currentTags = form.state.values.tags;
      form.setFieldValue(
        "tags",
        currentTags.filter((t) => t !== tagToRemove)
      );
    },
    [form]
  );

  const handleTagInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "Enter": {
          e.preventDefault();
          const selectedTag = tagSuggestions[selectedSuggestionIndex];
          addTag(selectedTag);
          break;
        }
        case "ArrowDown":
          e.preventDefault();
          setIsTagDropdownOpen(true);
          setSelectedSuggestionIndex((prev) =>
            prev < tagSuggestions.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
          break;
        case "Escape":
          closeTagDropdown();
          break;
      }
    },
    [tagSuggestions, selectedSuggestionIndex, addTag, closeTagDropdown]
  );

  const handleTagInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTag(e.target.value);
    setSelectedSuggestionIndex(-1);
    setIsTagDropdownOpen(!!e.target.value.trim());
  }, []);

  // Acceptance criteria management functions
  const addCriterion = useCallback(() => {
    const criterion = newCriterion.trim();
    if (criterion) {
      const currentCriteria = form.state.values.acceptanceCriteria;
      form.setFieldValue("acceptanceCriteria", [
        ...currentCriteria,
        { id: crypto.randomUUID(), criterion, status: "pending" as const },
      ]);
      setNewCriterion("");
    }
  }, [newCriterion, form]);

  const updateCriterionStatus = useCallback(
    (id: string, newStatus: AcceptanceCriterionStatus) => {
      const currentCriteria = form.state.values.acceptanceCriteria;
      form.setFieldValue(
        "acceptanceCriteria",
        currentCriteria.map((c) =>
          c.id === id
            ? {
                ...c,
                status: newStatus,
                verifiedBy: "human" as const,
                verifiedAt: new Date().toISOString(),
              }
            : c
        )
      );
    },
    [form]
  );

  const removeCriterion = useCallback(
    (id: string) => {
      const currentCriteria = form.state.values.acceptanceCriteria;
      form.setFieldValue(
        "acceptanceCriteria",
        currentCriteria.filter((c) => c.id !== id)
      );
    },
    [form]
  );

  const moveCriterionUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const currentCriteria = [...form.state.values.acceptanceCriteria];
      const current = currentCriteria[index];
      const prev = currentCriteria[index - 1];
      if (!current || !prev) return;
      currentCriteria[index - 1] = current;
      currentCriteria[index] = prev;
      form.setFieldValue("acceptanceCriteria", currentCriteria);
    },
    [form]
  );

  const moveCriterionDown = useCallback(
    (index: number) => {
      const currentCriteria = form.state.values.acceptanceCriteria;
      if (index >= currentCriteria.length - 1) return;
      const newCriteria = [...currentCriteria];
      const current = newCriteria[index];
      const next = newCriteria[index + 1];
      if (!current || !next) return;
      newCriteria[index + 1] = current;
      newCriteria[index] = next;
      form.setFieldValue("acceptanceCriteria", newCriteria);
    },
    [form]
  );

  // Derived from reactive formCriteria (subscribed via useStore above)
  const passedCriteria = formCriteria.filter((c) => c.status === "passed").length;

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
        className="relative bg-[var(--bg-secondary)] rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-visible flex flex-col border border-[var(--glass-border)]"
        style={{
          boxShadow: "var(--shadow-modal)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <div className="flex min-w-0 flex-col items-start gap-2">
            {selectedEpic && (
              <button
                type="button"
                onClick={handleOpenEpic}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                aria-label={`Open epic ${selectedEpic.title}`}
              >
                <FolderOpen size={12} aria-hidden="true" />
                <span className="truncate">{selectedEpic.title}</span>
              </button>
            )}
            <h2
              id="modal-title"
              className="text-lg font-semibold tracking-tight text-[var(--text-primary)]"
            >
              Edit Ticket
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                navigate({ to: `/ticket/${ticket.id}` });
              }}
              className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label="View full ticket details"
              title="View full ticket details"
            >
              <ExternalLink size={20} />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content — Two-panel layout */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-0">
            {/* LEFT PANEL: Content */}
            <div className="space-y-5 min-w-0 pr-0 md:pr-5">
              {/* Title */}
              <form.Field
                name="title"
                children={(field) => (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                      Title
                    </label>
                    <input
                      type="text"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      className={`w-full px-3 py-2.5 bg-[var(--bg-card)] border rounded-xl text-[var(--text-primary)] text-lg font-medium tracking-tight focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors ${
                        field.state.meta.errors.length > 0
                          ? "border-[var(--accent-danger)]"
                          : "border-[var(--border-primary)]"
                      }`}
                    />
                    {field.state.meta.errors.length > 0 && (
                      <p className="mt-1 text-xs text-[var(--accent-danger)]" role="alert">
                        {field.state.meta.errors.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              />

              {/* Ralph Status */}
              {ralphSession && (
                <div className="flex items-center gap-2 p-3 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl">
                  <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Ralph
                  </span>
                  <RalphStatusBadge session={ralphSession} size="md" />
                  <span className="text-xs text-[var(--text-muted)] ml-auto font-mono">
                    {new Date(ralphSession.startedAt).toLocaleTimeString()}
                  </span>
                </div>
              )}

              {/* Description */}
              <form.Field
                name="description"
                children={(field) => (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                      Description
                    </label>
                    <textarea
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      rows={10}
                      className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] resize-y min-h-[160px] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                    />
                  </div>
                )}
              />

              {/* Git/PR Info */}
              {(ticket.branchName || ticket.prNumber) && (
                <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl p-3 space-y-2">
                  <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Git / PR
                  </div>
                  {ticket.branchName && (
                    <div className="flex items-center gap-2">
                      <GitBranch size={14} className="text-[var(--accent-primary)] flex-shrink-0" />
                      <code className="text-sm text-[var(--text-primary)] bg-[var(--bg-hover)] px-2 py-0.5 rounded-lg font-mono truncate flex-1">
                        {ticket.branchName}
                      </code>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(ticket.branchName ?? "");
                          showToast("success", "Branch copied!");
                        }}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                        title="Copy branch name"
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                  )}
                  {ticket.prNumber && (
                    <div className="flex items-center gap-2">
                      <GitPullRequest
                        size={14}
                        className={`flex-shrink-0 ${getPrStatusIconColor(ticket.prStatus)}`}
                      />
                      {ticket.prUrl ? (
                        <a
                          href={ticket.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[var(--accent-primary)] hover:text-[var(--accent-secondary)] hover:underline flex items-center gap-1 font-mono"
                          onClick={(e) => e.stopPropagation()}
                        >
                          PR #{ticket.prNumber}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span className="text-sm text-[var(--text-primary)] font-mono">
                          PR #{ticket.prNumber}
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-lg ${getPrStatusBadgeStyle(ticket.prStatus)}`}
                      >
                        {ticket.prStatus ?? "open"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT PANEL: Metadata sidebar */}
            <div className="space-y-4 min-w-0 pt-5 md:pt-0 md:pl-5 md:border-l border-t md:border-t-0 border-[var(--border-primary)]">
              {/* Status */}
              <form.Field
                name="status"
                children={(field) => (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                      Status
                    </label>
                    <div className="relative">
                      <select
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value as TicketStatus)}
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] appearance-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                      >
                        {STATUS_OPTIONS.map((opt) => (
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
                  </div>
                )}
              />

              {/* Priority */}
              <form.Field
                name="priority"
                children={(field) => (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                      Priority
                    </label>
                    <div className="relative">
                      <select
                        value={field.state.value ?? ""}
                        onChange={(e) =>
                          field.handleChange(
                            e.target.value ? (e.target.value as TicketPriority) : undefined
                          )
                        }
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] appearance-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                      >
                        {PRIORITY_OPTIONS.map((opt) => (
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
                  </div>
                )}
              />

              {/* Epic */}
              <form.Field
                name="epicId"
                children={(field) => (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                      Epic
                    </label>
                    <div className="relative">
                      <select
                        value={field.state.value ?? ""}
                        onChange={(e) => field.handleChange(e.target.value || undefined)}
                        className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] appearance-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                      >
                        <option value="">None</option>
                        {epics.map((epic) => (
                          <option key={epic.id} value={epic.id}>
                            {epic.title}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
                      />
                    </div>
                  </div>
                )}
              />

              {/* Tags */}
              <div className="border-t border-[var(--border-primary)] pt-4">
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                  Tags
                </label>
                {formTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {formTags.map((tag) => (
                      <RemovableCopyableTagPill
                        key={tag}
                        tag={tag}
                        onRemove={() => removeTag(tag)}
                        disabled={updateTicketMutation.isPending}
                      />
                    ))}
                  </div>
                )}
                <div className="relative">
                  <div className="flex gap-2">
                    <input
                      ref={tagInputRef}
                      type="text"
                      value={newTag}
                      onChange={handleTagInputChange}
                      onKeyDown={handleTagInputKeyDown}
                      onFocus={() => {
                        if (newTag.trim()) setIsTagDropdownOpen(true);
                      }}
                      placeholder="Add tag..."
                      className="flex-1 px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors text-sm"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => addTag()}
                      className="px-2 py-1.5 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] rounded-xl text-[var(--text-secondary)]"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {isTagDropdownOpen && (tagsLoading || tagSuggestions.length > 0) && (
                    <div
                      ref={tagDropdownRef}
                      className="absolute z-10 left-0 right-0 mt-1 bg-[var(--bg-secondary)] border border-[var(--border-secondary)] rounded-xl shadow-xl max-h-40 overflow-y-auto"
                    >
                      {tagsLoading ? (
                        <div className="flex items-center justify-center gap-2 px-3 py-2 text-[var(--text-secondary)] text-sm">
                          <Loader2 size={14} className="animate-spin" />
                          <span>Loading tags...</span>
                        </div>
                      ) : (
                        tagSuggestions.map((tag, index) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => addTag(tag)}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-hover)] ${
                              index === selectedSuggestionIndex
                                ? "bg-[var(--bg-hover)] text-[var(--accent-primary)]"
                                : "text-[var(--text-primary)]"
                            }`}
                          >
                            {tag}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {tagsError && (
                    <p className="mt-1 text-xs text-[var(--accent-danger)]">
                      Failed to load tags: {tagsError}
                    </p>
                  )}

                  {showCreateHelper && (
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                      Press Enter to create "{newTag.trim()}"
                    </p>
                  )}
                </div>
              </div>

              {/* Blocked */}
              <div className="border-t border-[var(--border-primary)] pt-4">
                <form.Field
                  name="isBlocked"
                  children={(blockedField) => (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={blockedField.state.value}
                          onChange={(e) => blockedField.handleChange(e.target.checked)}
                          className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-danger)] focus:ring-[var(--accent-danger)] bg-[var(--bg-card)]"
                          style={{ accentColor: "var(--error)" }}
                        />
                        <span className="text-sm text-[var(--text-secondary)] flex items-center gap-1">
                          <AlertCircle size={14} className="text-[var(--accent-danger)]" />
                          Blocked
                        </span>
                      </label>
                      {blockedField.state.value && (
                        <form.Field
                          name="blockedReason"
                          children={(reasonField) => (
                            <input
                              type="text"
                              value={reasonField.state.value}
                              onChange={(e) => reasonField.handleChange(e.target.value)}
                              placeholder="Reason for blocking..."
                              className="w-full px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] text-sm focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors"
                            />
                          )}
                        />
                      )}
                    </div>
                  )}
                />
              </div>
            </div>
          </div>

          {/* Acceptance Criteria */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
              Acceptance Criteria
              {formCriteria.length > 0 && (
                <span className="ml-2 text-[var(--text-tertiary)]">
                  ({passedCriteria}/{formCriteria.length} passed)
                </span>
              )}
            </label>
            <div className="space-y-2 mb-2">
              {formCriteria.map((criterion, index) => (
                <div
                  key={criterion.id}
                  className={`flex items-start gap-2 p-2 rounded-lg group ${
                    criterion.status === "passed"
                      ? "bg-[var(--success-muted)] border border-[var(--success)]/30"
                      : criterion.status === "failed"
                        ? "bg-[var(--accent-danger)]/10 border border-[var(--accent-danger)]/30"
                        : criterion.status === "skipped"
                          ? "bg-[var(--bg-hover)] border border-[var(--border-primary)]"
                          : "bg-[var(--bg-tertiary)] border border-transparent"
                  }`}
                >
                  {/* Status dropdown */}
                  <select
                    value={criterion.status}
                    onChange={(e) =>
                      updateCriterionStatus(
                        criterion.id,
                        e.target.value as AcceptanceCriterionStatus
                      )
                    }
                    className={`w-20 text-xs px-1 py-1 rounded border-none appearance-none cursor-pointer ${
                      criterion.status === "passed"
                        ? "bg-[var(--success)] text-white"
                        : criterion.status === "failed"
                          ? "bg-[var(--accent-danger)] text-white"
                          : criterion.status === "skipped"
                            ? "bg-[var(--text-tertiary)] text-white"
                            : "bg-[var(--bg-hover)] text-[var(--text-secondary)]"
                    }`}
                  >
                    <option value="pending">Pending</option>
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="skipped">Skipped</option>
                  </select>
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-sm block ${
                        criterion.status === "passed"
                          ? "text-[var(--success-text)]"
                          : criterion.status === "failed"
                            ? "text-[var(--accent-danger)]"
                            : criterion.status === "skipped"
                              ? "text-[var(--text-tertiary)] line-through"
                              : "text-[var(--text-primary)]"
                      }`}
                    >
                      {criterion.criterion}
                    </span>
                    {/* Verification info */}
                    {criterion.verifiedBy && (
                      <span className="text-xs text-[var(--text-tertiary)] mt-1 block">
                        Verified by {criterion.verifiedBy}
                        {criterion.verifiedAt && (
                          <> on {new Date(criterion.verifiedAt).toLocaleDateString()}</>
                        )}
                        {criterion.verificationNote && <>: {criterion.verificationNote}</>}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => moveCriterionUp(index)}
                      disabled={index === 0}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] disabled:text-[var(--text-tertiary)]/50 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => moveCriterionDown(index)}
                      disabled={index === formCriteria.length - 1}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] disabled:text-[var(--text-tertiary)]/50 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => removeCriterion(criterion.id)}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--accent-danger)]"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCriterion}
                onChange={(e) => setNewCriterion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCriterion()}
                placeholder="Add acceptance criterion..."
                className="flex-1 px-3 py-2 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-xl text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)]/30 transition-colors text-sm"
              />
              <button
                onClick={addCriterion}
                className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)]"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Attachments — lazy loaded, owns its own state */}
          <Suspense fallback={<SectionFallback />}>
            <AttachmentsSection ticketId={ticket.id} />
          </Suspense>

          {/* Running Services — lazy loaded, owns its own polling subscription */}
          {currentStatus === "in_progress" && (
            <Suspense fallback={<SectionFallback />}>
              <ServicesSection projectId={ticket.projectId} />
            </Suspense>
          )}

          {/* Demo Review Panel — interactive in human_review, read-only after completion */}
          {(currentStatus === "human_review" || currentStatus === "done") && (
            <Suspense fallback={<SectionFallback />}>
              <DemoPanel ticketId={ticket.id} />
            </Suspense>
          )}

          {/* AI Telemetry — lazy loaded */}
          <Suspense fallback={<SectionFallback />}>
            <TelemetryPanel ticketId={ticket.id} />
          </Suspense>

          {/* Claude Tasks — lazy loaded */}
          <Suspense fallback={<SectionFallback />}>
            <ClaudeTasks
              ticketId={ticket.id}
              ticketStatus={currentStatus}
              defaultExpanded={false}
            />
          </Suspense>

          {/* Activity / Comments — lazy loaded, owns its own polling subscription */}
          <Suspense fallback={<SectionFallback />}>
            <ModalCommentsSection ticketId={ticket.id} ticketStatus={currentStatus} />
          </Suspense>

          {/* Metadata */}
          <div className="text-xs text-[var(--text-tertiary)] border-t border-[var(--border-primary)] pt-4">
            <p>Created: {new Date(ticket.createdAt).toLocaleString()}</p>
            <p>Updated: {new Date(ticket.updatedAt).toLocaleString()}</p>
            {ticket.completedAt && (
              <p>Completed: {new Date(ticket.completedAt).toLocaleString()}</p>
            )}
          </div>
        </div>

        {/* Start Work Notification */}
        {startWorkNotification && (
          <div
            className={`mx-4 mb-0 p-3 rounded-lg text-sm flex items-center gap-2 ${
              startWorkNotification.type === "success"
                ? "bg-[var(--success-muted)] text-[var(--success-text)] border border-[var(--success)]/50"
                : "bg-[var(--accent-danger)]/20 text-[var(--accent-danger)] border border-[var(--accent-danger)]/50"
            }`}
          >
            {startWorkNotification.type === "success" ? (
              <Clipboard size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            <span className="flex-1">{startWorkNotification.message}</span>
            <button
              onClick={() => setStartWorkNotification(null)}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <div className="mx-4 mb-0">
          <ErrorAlert error={updateTicketMutation.error} />
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 px-5 py-4 border-t border-[var(--border-primary)]">
          {/* Start Work Split Button */}
          <div className="relative" ref={startWorkMenuRef}>
            <div className="flex">
              <button
                onClick={() => void handleTicketLaunch("claude")}
                disabled={isStartingWork}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--success)] hover:bg-[var(--success)]/80 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] rounded-l-lg font-medium transition-colors"
              >
                {isStartingWork ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Terminal size={16} />
                )}
                <span>Start with Claude</span>
              </button>
              <button
                onClick={() => setShowStartWorkMenu(!showStartWorkMenu)}
                disabled={isStartingWork}
                className="flex items-center px-2 py-2 bg-[var(--success)] hover:bg-[var(--success)]/80 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-muted)] rounded-r-lg border-l border-[var(--success)]/50 transition-colors"
                aria-label="More start options"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Dropdown Menu */}
            {showStartWorkMenu && (
              <div className="absolute left-0 bottom-full mb-2 w-[46rem] max-w-[95vw] bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-[80] overflow-hidden">
                <LaunchProviderMenu
                  interactiveContext="ticket"
                  ralphContext="ticket"
                  onInteractiveLaunch={(provider) => void handleTicketLaunch(provider.id)}
                  onRalphLaunch={(provider) => void handleTicketLaunch(provider.id)}
                  disabled={isStartingWork}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {/* Delete button */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 text-[var(--accent-danger)] hover:text-[var(--accent-danger)]/80 hover:bg-[var(--accent-danger)]/20 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.values.title.trim()]}
              children={([canSubmit, title]) => (
                <button
                  onClick={handleSave}
                  disabled={updateTicketMutation.isPending || !canSubmit || !title}
                  className="px-5 py-2 bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] hover:brightness-110 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] disabled:from-transparent disabled:to-transparent rounded-xl font-medium transition-all shadow-sm"
                >
                  {updateTicketMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              )}
            />
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => {
            setShowDeleteConfirm(false);
            setDeleteError(null);
          }}
          onConfirm={handleDeleteConfirm}
          isLoading={deleteTicketMutation.isPending}
          entityType="ticket"
          entityName={ticket.title}
          preview={{
            commentCount:
              deletePreview && "commentCount" in deletePreview ? deletePreview.commentCount : 0,
          }}
          error={deleteError}
        />
      </div>
    </div>
  );
}
