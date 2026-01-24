import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm } from "@tanstack/react-form-start";
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
  Upload,
  FileIcon,
  Loader2,
  Clipboard,
  Bot,
  Terminal,
  MessageSquare,
  Send,
  Globe,
  Server,
  BookOpen,
  Database,
  ExternalLink,
  Code2,
  GitBranch,
  GitPullRequest,
  Copy,
  Container,
} from "lucide-react";
import type { Ticket, Epic } from "../lib/hooks";
import {
  useUpdateTicket,
  useSettings,
  useLaunchRalphForTicket,
  useComments,
  useCreateComment,
  useTags,
  useAutoClearState,
  useProjectServices,
  useProjects,
  useActiveRalphSessions,
} from "../lib/hooks";
import { RalphStatusBadge } from "./RalphStatusBadge";
import { TelemetryPanel } from "./TelemetryPanel";
import { ClaudeTasks } from "./tickets/ClaudeTasks";
import type { ServiceType } from "../lib/service-discovery";
import { useToast } from "./Toast";
import type { TicketStatus, TicketPriority } from "../api/tickets";
import {
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  type Attachment,
} from "../api/attachments";
import {
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  POLLING_INTERVALS,
  getPrStatusIconColor,
  getPrStatusBadgeStyle,
} from "../lib/constants";
import { getTicketContext } from "../api/context";
import { launchClaudeInTerminal, launchOpenCodeInTerminal } from "../api/terminal";
import { safeJsonParse } from "../lib/utils";
import { ticketFormOpts } from "./tickets/ticket-form-opts";
import {
  ticketFormSchema,
  type TicketFormData,
  type AcceptanceCriterion,
  type AcceptanceCriterionStatus,
} from "./tickets/ticket-form-schema";

interface TicketModalProps {
  ticket: Ticket;
  epics: Epic[];
  onClose: () => void;
  onUpdate: () => void;
}

// Comment type styling lookup objects to avoid nested ternaries
const COMMENT_CONTAINER_STYLES: Record<string, string> = {
  progress: "p-2 bg-[var(--info-muted)] border border-[var(--info)]/50",
  work_summary: "p-3 bg-[var(--status-review)]/20 border border-[var(--status-review)]/50",
  test_report: "p-3 bg-[var(--success-muted)] border border-[var(--success)]/50",
  comment: "p-3 bg-[var(--bg-tertiary)]",
};

const COMMENT_AUTHOR_STYLES: Record<string, string> = {
  ralph: "text-[var(--status-review)]",
  claude: "text-[var(--accent-ai)]",
  user: "text-[var(--text-primary)]",
};

const COMMENT_BADGE_STYLES: Record<string, string> = {
  progress: "bg-[var(--info)] text-white",
  work_summary: "bg-[var(--status-review)] text-white",
  test_report: "bg-[var(--success)] text-white",
};

const COMMENT_BADGE_LABELS: Record<string, string> = {
  progress: "Working...",
  work_summary: "Work Summary",
  test_report: "Test Report",
};

// Service type icons for the services panel
const SERVICE_TYPE_ICONS: Record<ServiceType, typeof Globe> = {
  frontend: Globe,
  backend: Server,
  storybook: BookOpen,
  docs: BookOpen,
  database: Database,
  other: Server,
};

const SERVICE_TYPE_COLORS: Record<ServiceType, string> = {
  frontend: "text-[var(--accent-ai)]",
  backend: "text-[var(--status-review)]",
  storybook: "text-[var(--accent-primary)]",
  docs: "text-[var(--success)]",
  database: "text-[var(--warning)]",
  other: "text-[var(--text-secondary)]",
};

// Stable empty state for tag suggestions to prevent recreation on every render
const EMPTY_TAG_STATE = { tagSuggestions: [] as string[], showCreateHelper: false };

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
      onChange: ticketFormSchema,
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

  // Attachments - kept as separate state per acceptance criteria (file uploads don't fit form model)
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Comments state
  const [newComment, setNewComment] = useState("");
  const [showComments, setShowComments] = useState(true);

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

  // Get project path for service discovery
  const { projects } = useProjects();
  const projectPath = useMemo(() => {
    const project = projects.find((p) => p.id === ticket.projectId);
    return project?.path ?? null;
  }, [projects, ticket.projectId]);

  // Get current status from form for conditional rendering
  const currentStatus = form.state.values.status;

  // Service discovery - poll when ticket is in progress
  const { runningServices, error: servicesError } = useProjectServices(projectPath, {
    enabled: currentStatus === "in_progress",
    pollingInterval: POLLING_INTERVALS.SERVICES,
  });

  // Comments - poll when ticket is in progress (Ralph might be working)
  const { comments, loading: commentsLoading } = useComments(ticket.id, {
    pollingInterval:
      currentStatus === "in_progress"
        ? POLLING_INTERVALS.COMMENTS_ACTIVE
        : POLLING_INTERVALS.DISABLED,
  });
  const createCommentMutation = useCreateComment();

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
    const currentTags = form.state.values.tags;
    const suggestions = existingTags.filter(
      (tag) => tag.toLowerCase().includes(inputLower) && !currentTags.includes(tag)
    );
    const exactMatch = existingTags.some((tag) => tag.toLowerCase() === inputLower);

    return {
      tagSuggestions: suggestions,
      showCreateHelper: suggestions.length === 0 && !exactMatch,
    };
  }, [newTag, existingTags, form.state.values.tags]);

  // Modal keyboard handling (Escape, focus trap)
  useModalKeyboard(modalRef, onClose, {
    shouldPreventClose: useCallback(() => showStartWorkMenu, [showStartWorkMenu]),
    onPreventedClose: useCallback(() => setShowStartWorkMenu(false), []),
  });

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

  // Fetch attachments on mount
  useEffect(() => {
    const fetchAttachments = async () => {
      try {
        const data = await getAttachments({ data: ticket.id });
        setAttachments(data);
      } catch (error) {
        console.error("Failed to fetch attachments:", error);
        showToast(
          "error",
          `Failed to load attachments: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    };
    void fetchAttachments();
  }, [ticket.id, showToast]);

  // Handle file upload - uploads files in parallel for better performance
  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      // Filter out oversized files first
      const validFiles: File[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          showToast("error", `File "${file.name}" exceeds 10MB limit`);
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) return;

      setIsUploadingAttachment(true);
      try {
        // Upload all valid files in parallel using allSettled for partial success handling
        const uploadPromises = validFiles.map(async (file) => {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => {
              const errorName = reader.error?.name ?? "UnknownError";
              const errorMessage = reader.error?.message ?? "Unknown file read error";
              reject(new Error(`Failed to read "${file.name}": ${errorName} - ${errorMessage}`));
            };
            reader.readAsDataURL(file);
          });

          const attachment = await uploadAttachment({
            data: {
              ticketId: ticket.id,
              filename: file.name,
              data: base64,
            },
          });
          return { file: file.name, attachment };
        });

        const results = await Promise.allSettled(uploadPromises);
        const succeeded: Attachment[] = [];
        const failed: string[] = [];

        for (const result of results) {
          if (result.status === "fulfilled") {
            succeeded.push(result.value.attachment);
          } else {
            failed.push(result.reason?.message || "Unknown error");
          }
        }

        if (succeeded.length > 0) {
          setAttachments((prev) => [...prev, ...succeeded]);
        }

        if (failed.length > 0) {
          console.error("Some file uploads failed:", failed);
          showToast("error", `Failed to upload ${failed.length} file(s): ${failed.join(", ")}`);
        }
      } catch (error) {
        console.error("Failed to upload attachments:", error);
        showToast(
          "error",
          `Failed to upload attachments: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [ticket.id, showToast]
  );

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      void handleFileUpload(e.dataTransfer.files);
    },
    [handleFileUpload]
  );

  // Handle delete attachment
  const handleDeleteAttachment = useCallback(
    async (attachment: Attachment) => {
      if (!confirm(`Delete "${attachment.filename}"?`)) return;

      try {
        await deleteAttachment({
          data: {
            ticketId: ticket.id,
            filename: attachment.filename,
          },
        });
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } catch (error) {
        console.error("Failed to delete attachment:", error);
        showToast(
          "error",
          `Failed to delete attachment: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    },
    [ticket.id, showToast]
  );

  // Handle Start Work - launch Claude in terminal with context
  const handleStartWork = useCallback(async () => {
    setIsStartingWork(true);
    setStartWorkNotification(null);

    try {
      // Get ticket context
      const contextResult = await getTicketContext({ data: ticket.id });

      // Try to launch Claude in terminal with preferred terminal from settings
      // Window title format: [Project][Epic][Ticket] or [Project][Ticket]
      const launchResult = await launchClaudeInTerminal({
        data: {
          ticketId: ticket.id,
          context: contextResult.context,
          projectPath: contextResult.projectPath,
          preferredTerminal: settings?.terminalEmulator ?? null,
          projectName: contextResult.projectName,
          epicName: contextResult.epicName,
          ticketTitle: contextResult.ticketTitle,
        },
      });

      // Show any warnings (e.g., preferred terminal not available)
      if (launchResult.warnings) {
        launchResult.warnings.forEach((warning) => showToast("info", warning));
      }

      if (launchResult.success && launchResult.method === "terminal") {
        // Update form status to in_progress
        form.setFieldValue("status", "in_progress");

        setStartWorkNotification({
          type: "success",
          message: `Claude launched in ${launchResult.terminalUsed}! Ticket moved to In Progress.`,
        });

        // Trigger parent update to refresh ticket list
        setTimeout(() => onUpdate(), 500);
      } else if (!launchResult.success) {
        // Terminal launch failed - show error toast
        showToast("error", launchResult.message);

        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(contextResult.context);

        setStartWorkNotification({
          type: "success",
          message: `Context copied to clipboard. Run: cd "${contextResult.projectPath}" && claude`,
        });
      } else {
        // Clipboard fallback (success but not terminal method)
        await navigator.clipboard.writeText(contextResult.context);

        setStartWorkNotification({
          type: "success",
          message: launchResult.message,
        });
      }
      // Auto-hide is handled by useAutoClearState hook
    } catch (error) {
      console.error("Failed to start work:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      showToast("error", `Failed to start work: ${message}`);

      // Ultimate fallback: try clipboard only
      try {
        const contextResult = await getTicketContext({ data: ticket.id });
        await navigator.clipboard.writeText(contextResult.context);
        setStartWorkNotification({
          type: "success",
          message: `Context copied! Run: cd "${contextResult.projectPath}" && claude`,
        });
      } catch (fallbackError) {
        console.error("Failed to copy context to clipboard:", fallbackError);
        const errorMessage =
          fallbackError instanceof Error ? fallbackError.message : "Could not copy context";
        setStartWorkNotification({
          type: "error",
          message: `Failed to start work: ${errorMessage}`,
        });
      }
    } finally {
      setIsStartingWork(false);
    }
  }, [ticket.id, onUpdate, settings?.terminalEmulator, showToast, setStartWorkNotification, form]);

  // Handle Start Ralph - autonomous mode
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
      setIsStartingWork(true);
      setStartWorkNotification(null);
      setShowStartWorkMenu(false);

      try {
        const result = await launchRalphMutation.mutateAsync({
          ticketId: ticket.id,
          // maxIterations now uses global setting from Settings
          preferredTerminal: settings?.terminalEmulator ?? null,
          useSandbox,
          aiBackend,
        });

        // Show any warnings (e.g., preferred terminal not available)
        if ("warnings" in result && result.warnings) {
          (result.warnings as string[]).forEach((warning: string) => showToast("info", warning));
        }

        if (result.success) {
          form.setFieldValue("status", "in_progress");
          setStartWorkNotification({
            type: "success",
            message: result.message,
          });
          setTimeout(() => onUpdate(), 500);
        } else {
          showToast("error", result.message);
          setStartWorkNotification({
            type: "error",
            message: result.message,
          });
        }
        // Auto-hide is handled by useAutoClearState hook
      } catch (error) {
        console.error("Failed to start Ralph:", error);
        const message = error instanceof Error ? error.message : "An unexpected error occurred";
        showToast("error", `Failed to launch Ralph: ${message}`);
        setStartWorkNotification({
          type: "error",
          message: "Failed to launch Ralph",
        });
      } finally {
        setIsStartingWork(false);
      }
    },
    [
      ticket.id,
      onUpdate,
      settings?.terminalEmulator,
      launchRalphMutation,
      showToast,
      setStartWorkNotification,
      form,
    ]
  );

  // Handle Start OpenCode - open-source AI assistant
  const handleStartOpenCode = useCallback(async () => {
    setIsStartingWork(true);
    setStartWorkNotification(null);
    setShowStartWorkMenu(false);

    try {
      // Get ticket context
      const contextResult = await getTicketContext({ data: ticket.id });

      // Launch OpenCode in terminal
      const launchResult = await launchOpenCodeInTerminal({
        data: {
          ticketId: ticket.id,
          context: contextResult.context,
          projectPath: contextResult.projectPath,
          preferredTerminal: settings?.terminalEmulator ?? null,
          projectName: contextResult.projectName,
          epicName: contextResult.epicName,
          ticketTitle: contextResult.ticketTitle,
        },
      });

      // Show any warnings
      if (launchResult.warnings) {
        launchResult.warnings.forEach((warning) => showToast("info", warning));
      }

      if (launchResult.success && launchResult.method === "terminal") {
        form.setFieldValue("status", "in_progress");
        setStartWorkNotification({
          type: "success",
          message: `OpenCode launched in ${launchResult.terminalUsed}! Ticket moved to In Progress.`,
        });
        setTimeout(() => onUpdate(), 500);
      } else if (!launchResult.success) {
        showToast("error", launchResult.message);

        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(contextResult.context);

        setStartWorkNotification({
          type: "success",
          message: `Context copied to clipboard. Run: cd "${contextResult.projectPath}" && opencode`,
        });
      } else {
        // Clipboard fallback
        await navigator.clipboard.writeText(contextResult.context);
        setStartWorkNotification({
          type: "success",
          message: launchResult.message,
        });
      }
    } catch (error) {
      console.error("Failed to start OpenCode:", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred";
      showToast("error", `Failed to launch OpenCode: ${message}`);

      // Ultimate fallback: try clipboard only
      try {
        const contextResult = await getTicketContext({ data: ticket.id });
        await navigator.clipboard.writeText(contextResult.context);
        setStartWorkNotification({
          type: "success",
          message: `Context copied! Run: cd "${contextResult.projectPath}" && opencode`,
        });
      } catch (fallbackError) {
        console.error("Failed to copy context to clipboard:", fallbackError);
        setStartWorkNotification({
          type: "error",
          message: `Failed to start OpenCode: ${fallbackError instanceof Error ? fallbackError.message : "Could not copy context to clipboard"}`,
        });
      }
    } finally {
      setIsStartingWork(false);
    }
  }, [ticket.id, onUpdate, settings?.terminalEmulator, showToast, setStartWorkNotification, form]);

  // Handle adding a comment
  const handleAddComment = useCallback(() => {
    const content = newComment.trim();
    if (!content) return;

    createCommentMutation.mutate(
      {
        ticketId: ticket.id,
        content,
        author: "user",
        type: "comment",
      },
      {
        onSuccess: () => {
          setNewComment("");
        },
        onError: (error) => {
          showToast(
            "error",
            `Failed to add comment: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        },
      }
    );
  }, [newComment, ticket.id, createCommentMutation, showToast]);

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
    if (values.tags.length > 0) {
      updates.tags = values.tags;
    }
    if (values.acceptanceCriteria.length > 0) {
      updates.acceptanceCriteria = values.acceptanceCriteria;
    }

    updateTicketMutation.mutate({ id: ticket.id, updates }, { onSuccess: onUpdate });
  }, [ticket.id, form.state.values, onUpdate, updateTicketMutation]);

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

  // Computed values from form state
  const formTags = form.state.values.tags;
  const formCriteria = form.state.values.acceptanceCriteria;
  const passedCriteria = formCriteria.filter((c) => c.status === "passed").length;

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
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: "var(--shadow-modal)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2 id="modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            Edit Ticket
          </h2>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Title Field with Validation */}
          <form.Field
            name="title"
            children={(field) => (
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  className={`w-full px-3 py-2 bg-[var(--bg-tertiary)] border rounded-lg text-[var(--text-primary)] ${
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

          {/* Ralph Status - show when Ralph is working on this ticket */}
          {ralphSession && (
            <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg">
              <span className="text-sm text-[var(--text-secondary)]">Ralph Status:</span>
              <RalphStatusBadge session={ralphSession} size="md" />
              <span className="text-xs text-[var(--text-tertiary)] ml-auto">
                Started {new Date(ralphSession.startedAt).toLocaleTimeString()}
              </span>
            </div>
          )}

          {/* Description Field */}
          <form.Field
            name="description"
            children={(field) => (
              <div>
                <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                  Description
                </label>
                <textarea
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  rows={8}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] resize-y min-h-[120px]"
                />
              </div>
            )}
          />

          {/* Status, Priority, Epic */}
          <div className="grid grid-cols-3 gap-4">
            <form.Field
              name="status"
              children={(field) => (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Status
                  </label>
                  <div className="relative">
                    <select
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value as TicketStatus)}
                      className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none"
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

            <form.Field
              name="priority"
              children={(field) => (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
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
                      className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none"
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

            <form.Field
              name="epicId"
              children={(field) => (
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                    Epic
                  </label>
                  <div className="relative">
                    <select
                      value={field.state.value ?? ""}
                      onChange={(e) => field.handleChange(e.target.value || undefined)}
                      className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none"
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
          </div>

          {/* Git/PR Info (read-only, populated by MCP tools) */}
          {(ticket.branchName || ticket.prNumber) && (
            <div className="bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg p-3 space-y-2">
              <div className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                Git / PR
              </div>

              {/* Branch name */}
              {ticket.branchName && (
                <div className="flex items-center gap-2">
                  <GitBranch size={14} className="text-[var(--accent-primary)] flex-shrink-0" />
                  <code className="text-sm text-[var(--text-primary)] bg-[var(--bg-hover)] px-2 py-0.5 rounded font-mono truncate flex-1">
                    {ticket.branchName}
                  </code>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(ticket.branchName ?? "");
                      showToast("success", "Branch copied!");
                    }}
                    className="p-1 hover:bg-[var(--bg-hover)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    title="Copy branch name"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              )}

              {/* PR link */}
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
                      className="text-sm text-[var(--accent-primary)] hover:text-[var(--accent-secondary)] hover:underline flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      PR #{ticket.prNumber}
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span className="text-sm text-[var(--text-primary)]">
                      PR #{ticket.prNumber}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${getPrStatusBadgeStyle(ticket.prStatus)}`}
                  >
                    {ticket.prStatus ?? "open"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Blocked */}
          <form.Field
            name="isBlocked"
            children={(blockedField) => (
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={blockedField.state.value}
                    onChange={(e) => blockedField.handleChange(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-danger)] focus:ring-[var(--accent-danger)] bg-[var(--bg-tertiary)]"
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
                        className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)]"
                      />
                    )}
                  />
                )}
              </div>
            )}
          />

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Tags
            </label>
            {formTags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {formTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-[var(--accent-danger)]"
                    >
                      <X size={12} />
                    </button>
                  </span>
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
                  className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] text-sm"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => addTag()}
                  className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)]"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Tag suggestions dropdown */}
              {isTagDropdownOpen && (tagsLoading || tagSuggestions.length > 0) && (
                <div
                  ref={tagDropdownRef}
                  className="absolute z-10 left-0 right-12 mt-1 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg shadow-lg max-h-40 overflow-y-auto"
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

              {/* Tag loading error */}
              {tagsError && (
                <p className="mt-1 text-xs text-[var(--accent-danger)]">
                  Failed to load tags: {tagsError}
                </p>
              )}

              {/* Helper text for creating new tags */}
              {showCreateHelper && (
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Press{" "}
                  <kbd className="px-1 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
                    Enter
                  </kbd>{" "}
                  to create &quot;{newTag.trim()}&quot; as a new tag
                </p>
              )}
            </div>
          </div>

          {/* Acceptance Criteria */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
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
                className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] text-sm"
              />
              <button
                onClick={addCriterion}
                className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)]"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Attachments
              {attachments.length > 0 && (
                <span className="ml-2 text-[var(--text-tertiary)]">({attachments.length})</span>
              )}
            </label>

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                isDraggingOver
                  ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                  : "border-[var(--border-primary)] hover:border-[var(--border-secondary)]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => void handleFileUpload(e.target.files)}
                className="hidden"
              />
              {isUploadingAttachment ? (
                <div className="flex items-center justify-center gap-2 text-[var(--text-secondary)]">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Uploading...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={24} className="mx-auto text-[var(--text-tertiary)]" />
                  <p className="text-sm text-[var(--text-secondary)]">
                    Drag and drop files here, or{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[var(--accent-primary)] hover:text-[var(--accent-secondary)] underline"
                    >
                      browse
                    </button>
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">Max file size: 10MB</p>
                </div>
              )}
            </div>

            {/* Attachment list */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-2 bg-[var(--bg-tertiary)] rounded-lg group"
                  >
                    {attachment.isImage ? (
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        <img
                          src={attachment.url}
                          alt={attachment.filename}
                          className="w-12 h-12 object-cover rounded"
                        />
                      </a>
                    ) : (
                      <div className="w-12 h-12 bg-[var(--bg-hover)] rounded flex items-center justify-center">
                        <FileIcon size={20} className="text-[var(--text-secondary)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[var(--text-primary)] hover:text-[var(--accent-primary)] truncate block"
                      >
                        {attachment.filename}
                      </a>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {(attachment.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => void handleDeleteAttachment(attachment)}
                      className="p-1 text-[var(--text-tertiary)] hover:text-[var(--accent-danger)] opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Running Services - Only show when ticket is in progress */}
          {currentStatus === "in_progress" && servicesError && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-300">
              <span className="font-medium">Service discovery error:</span> {servicesError}
            </div>
          )}
          {currentStatus === "in_progress" && runningServices.length > 0 && (
            <div className="bg-[var(--bg-tertiary)]/50 border border-[var(--border-secondary)] rounded-lg p-3">
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
                <Globe size={14} className="text-[var(--accent-ai)]" />
                Running Services
              </h4>
              <div className="space-y-1">
                {runningServices.map((service) => {
                  // Lookup tables are exhaustive for all ServiceType values, no fallback needed
                  const IconComponent = SERVICE_TYPE_ICONS[service.type];
                  const colorClass = SERVICE_TYPE_COLORS[service.type];
                  return (
                    <a
                      key={service.port}
                      href={`http://localhost:${service.port}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-2 py-1.5 bg-[var(--bg-primary)]/50 rounded hover:bg-[var(--bg-hover)]/50 transition-colors group"
                    >
                      <IconComponent size={14} className={colorClass} />
                      <span className="text-sm text-[var(--text-primary)] flex-1">
                        {service.name}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        localhost:{service.port}
                      </span>
                      <ExternalLink
                        size={12}
                        className="text-[var(--text-muted)] group-hover:text-[var(--accent-ai)] transition-colors"
                      />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Telemetry */}
          <TelemetryPanel ticketId={ticket.id} />

          {/* Claude Tasks */}
          <ClaudeTasks ticketId={ticket.id} ticketStatus={currentStatus} defaultExpanded={false} />

          {/* Activity / Comments */}
          <div>
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] mb-2 hover:text-[var(--text-primary)] transition-colors"
            >
              <MessageSquare size={16} />
              <span>Activity</span>
              {comments.length > 0 && (
                <span className="text-[var(--text-tertiary)]">({comments.length})</span>
              )}
              <ChevronDown
                size={14}
                className={`transition-transform ${showComments ? "rotate-180" : ""}`}
              />
            </button>

            {showComments && (
              <div className="space-y-3">
                {/* Add comment input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] text-sm"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || createCommentMutation.isPending}
                    className="px-3 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg transition-colors"
                  >
                    {createCommentMutation.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>

                {/* Comments list */}
                {commentsLoading ? (
                  <div className="flex items-center justify-center py-4 text-[var(--text-tertiary)]">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : comments.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`rounded-lg text-sm ${COMMENT_CONTAINER_STYLES[comment.type] ?? COMMENT_CONTAINER_STYLES.comment}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {comment.type === "progress" && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--info)] opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--info)]"></span>
                            </span>
                          )}
                          <span
                            className={`font-medium ${COMMENT_AUTHOR_STYLES[comment.author] ?? COMMENT_AUTHOR_STYLES.user}`}
                          >
                            {comment.author === "ralph" && (
                              <Bot size={12} className="inline mr-1" />
                            )}
                            {comment.author === "claude" && (
                              <Terminal size={12} className="inline mr-1" />
                            )}
                            {comment.author.charAt(0).toUpperCase() + comment.author.slice(1)}
                          </span>
                          <span className="text-[var(--text-tertiary)] text-xs">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                          {comment.type !== "comment" && COMMENT_BADGE_STYLES[comment.type] && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${COMMENT_BADGE_STYLES[comment.type]}`}
                            >
                              {COMMENT_BADGE_LABELS[comment.type]}
                            </span>
                          )}
                        </div>
                        <p
                          className={`whitespace-pre-wrap ${comment.type === "progress" ? "text-[var(--info-text)] text-xs" : "text-[var(--text-primary)]"}`}
                        >
                          {comment.content}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-tertiary)] py-2">
                    No activity yet. Comments from Claude and Ralph will appear here.
                  </p>
                )}
              </div>
            )}
          </div>

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

        {/* Footer */}
        <div className="flex justify-between gap-3 p-4 border-t border-[var(--border-primary)]">
          {/* Start Work Split Button */}
          <div className="relative" ref={startWorkMenuRef}>
            <div className="flex">
              <button
                onClick={() => void handleStartWork()}
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
              <div className="absolute left-0 bottom-full mb-2 w-64 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg shadow-xl z-10 overflow-hidden">
                {/* Interactive Sessions */}
                <button
                  onClick={() => {
                    setShowStartWorkMenu(false);
                    void handleStartWork();
                  }}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <Terminal size={18} className="text-[var(--success)] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">Start with Claude</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Interactive session - you guide Claude
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => void handleStartOpenCode()}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left border-t border-[var(--border-primary)]"
                >
                  <Code2 size={18} className="text-[var(--info)] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">
                      Start with OpenCode
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Interactive session - you guide OpenCode
                    </div>
                  </div>
                </button>

                {/* Ralph Section Divider */}
                <div className="px-4 py-2 bg-[var(--bg-secondary)]/50 border-t border-[var(--border-primary)]">
                  <div className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Autonomous (Ralph)
                  </div>
                </div>

                {/* Ralph with Claude - Native */}
                <button
                  onClick={() => void handleStartRalph({ useSandbox: false, aiBackend: "claude" })}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  <Bot size={18} className="text-[var(--accent-ai)] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">
                      Start Ralph (Claude)
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Runs on your machine directly
                    </div>
                  </div>
                </button>

                {/* Ralph with Claude - Docker (Disabled for now) */}
                <button
                  disabled
                  className="w-full flex items-start gap-3 px-4 py-3 transition-colors text-left border-t border-[var(--border-primary)] opacity-50 cursor-not-allowed"
                  aria-disabled="true"
                  aria-label="Start Ralph (Claude) in Docker - Coming soon"
                >
                  <Container size={18} className="text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-[var(--text-secondary)]">
                      Start Ralph (Claude) in Docker
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Coming soon - sandbox mode in progress
                    </div>
                  </div>
                </button>

                {/* Ralph with OpenCode - Native */}
                <button
                  onClick={() =>
                    void handleStartRalph({ useSandbox: false, aiBackend: "opencode" })
                  }
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left border-t border-[var(--border-primary)]"
                >
                  <Code2 size={18} className="text-[var(--info)] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">
                      Start Ralph (OpenCode)
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Runs on your machine directly
                    </div>
                  </div>
                </button>

                {/* Ralph with OpenCode - Docker (Disabled for now) */}
                <button
                  disabled
                  className="w-full flex items-start gap-3 px-4 py-3 transition-colors text-left border-t border-[var(--border-primary)] opacity-50 cursor-not-allowed"
                  aria-disabled="true"
                  aria-label="Start Ralph (OpenCode) in Docker - Coming soon"
                >
                  <Container size={18} className="text-[var(--text-muted)] mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-[var(--text-secondary)]">
                      Start Ralph (OpenCode) in Docker
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      Coming soon - needs OpenCode Docker image
                    </div>
                  </div>
                </button>
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
                  className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg font-medium transition-colors"
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
