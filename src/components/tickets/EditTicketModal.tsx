import { useNavigate } from "@tanstack/react-router";
import { type FC, useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { X, Ticket, Loader2, Trash2, FolderOpen } from "lucide-react";
import {
  useClickOutside,
  useProjects,
  useTags,
  useUpdateTicket,
  useDeleteTicket,
  useTicketDeletePreview,
  useSettings,
  useLaunchRalphForTicket,
  type Ticket as TicketType,
} from "../../lib/hooks";
import DeleteConfirmationModal from "../DeleteConfirmationModal";
import { useToast } from "../Toast";
import { TagInput } from "./TagInput";
import { EpicSelect } from "./EpicSelect";
import { SubtaskList } from "./SubtaskList";
import { LaunchActions, type LaunchType } from "./LaunchActions";
import { CreateEpicModal } from "../epics/CreateEpicModal";
import { getTicketContext } from "../../api/context";
import {
  launchClaudeInTerminal,
  launchCodexInTerminal,
  launchVSCodeInTerminal,
  launchCursorInTerminal,
  launchCursorAgentInTerminal,
  launchCopilotInTerminal,
  launchOpenCodeInTerminal,
} from "../../api/terminal";
import { startTicketWorkflowFn } from "../../api/workflow-server-fns";
import type { TicketStatus, Subtask } from "../../api/tickets";
import { safeJsonParse } from "../../lib/utils";

/** Priority options for ticket editing */
const PRIORITY_OPTIONS = [
  { value: "", label: "None" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

/** Status options with colors for the status dropdown */
const STATUS_OPTIONS: { value: TicketStatus; label: string; color: string }[] = [
  { value: "backlog", label: "Backlog", color: "#6b7280" }, // gray
  { value: "ready", label: "Ready", color: "#3b82f6" }, // blue
  { value: "in_progress", label: "In Progress", color: "#eab308" }, // yellow
  { value: "ai_review", label: "AI Review", color: "#06b6d4" }, // cyan
  { value: "human_review", label: "Human Review", color: "#ec4899" }, // pink
  { value: "done", label: "Done", color: "#22c55e" }, // green
];

export interface EditTicketModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Handler to close the modal */
  onClose: () => void;
  /** The ticket being edited */
  ticket: TicketType;
  /** Handler called after successful ticket update or deletion */
  onSuccess?: () => void;
}

/**
 * EditTicketModal - Modal for editing existing tickets.
 *
 * Extends the CreateTicketModal pattern with additional sections:
 * - Status dropdown for changing ticket status
 * - Blocked toggle with reason
 * - Subtasks list with add/edit/delete/toggle
 * - Delete button with confirmation modal
 *
 * Features:
 * - **Pre-fills all fields**: Loads existing ticket data
 * - **2-column layout**: Matching CreateTicketModal design
 * - **TanStack Query**: Uses mutation for ticket updates
 * - **Toast notifications**: Shows success/error feedback
 */
export const EditTicketModal: FC<EditTicketModalProps> = ({
  isOpen,
  onClose,
  ticket,
  onSuccess,
}) => {
  const navigate = useNavigate();
  // Parse JSON fields from ticket - use safeJsonParse to handle corrupted data gracefully
  const initialTags = safeJsonParse<string[]>(ticket.tags, []);
  const initialSubtasks = safeJsonParse<Subtask[]>(ticket.subtasks, []);

  // Form state - initialized from ticket data
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [projectId, setProjectId] = useState(ticket.projectId);
  const [priority, setPriority] = useState<string>(ticket.priority ?? "");
  const [epicId, setEpicId] = useState(ticket.epicId ?? "");
  const [tags, setTags] = useState<string[]>(initialTags);
  const [status, setStatus] = useState<TicketStatus>(ticket.status as TicketStatus);
  const [isBlocked, setIsBlocked] = useState(ticket.isBlocked ?? false);
  const [blockedReason, setBlockedReason] = useState(ticket.blockedReason ?? "");
  const [subtasks, setSubtasks] = useState<Subtask[]>(initialSubtasks);

  // Sync form state when ticket changes (defensive against stale state without remount)
  useEffect(() => {
    setTitle(ticket.title);
    setDescription(ticket.description ?? "");
    setProjectId(ticket.projectId);
    setPriority(ticket.priority ?? "");
    setEpicId(ticket.epicId ?? "");
    setTags(safeJsonParse<string[]>(ticket.tags, []));
    setStatus(ticket.status as TicketStatus);
    setIsBlocked(ticket.isBlocked ?? false);
    setBlockedReason(ticket.blockedReason ?? "");
    setSubtasks(safeJsonParse<Subtask[]>(ticket.subtasks, []));
  }, [
    ticket.id,
    ticket.tags,
    ticket.subtasks,
    ticket.title,
    ticket.description,
    ticket.projectId,
    ticket.priority,
    ticket.epicId,
    ticket.status,
    ticket.isBlocked,
    ticket.blockedReason,
  ]);

  // Validation state - tracks which fields user has interacted with
  const [touched, setTouched] = useState<{ title: boolean }>({
    title: false,
  });

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Launch state
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingType, setLaunchingType] = useState<LaunchType | null>(null);

  // Create Epic modal state
  const [isCreateEpicOpen, setIsCreateEpicOpen] = useState(false);

  // Refs
  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const projectSelectRef = useRef<HTMLSelectElement>(null);

  // Hooks
  const { showToast } = useToast();
  const updateMutation = useUpdateTicket();
  const deleteMutation = useDeleteTicket();
  const { projects } = useProjects();
  const { tags: availableTags } = useTags();
  const { settings } = useSettings();
  const launchRalphMutation = useLaunchRalphForTicket();

  // Fetch delete preview when confirmation modal opens (dry-run)
  const { data: deletePreview } = useTicketDeletePreview(ticket.id, showDeleteConfirm);

  const isSaving = updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;
  const error = updateMutation.error;

  // Get epics for selected project
  const selectedProject = projects.find((p) => p.id === projectId);
  const projectEpics = selectedProject?.epics ?? [];
  const selectedEpic = projectEpics.find((epic) => epic.id === epicId) ?? null;

  // Reset form to initial values - called when modal closes
  // Note: When opening the modal for a different ticket, parent should pass
  // key={ticket.id} to force a clean remount and avoid stale state
  const resetForm = useCallback(() => {
    const ticketTags = safeJsonParse<string[]>(ticket.tags, []);
    const ticketSubtasks = safeJsonParse<Subtask[]>(ticket.subtasks, []);

    setTitle(ticket.title);
    setDescription(ticket.description ?? "");
    setProjectId(ticket.projectId);
    setPriority(ticket.priority ?? "");
    setEpicId(ticket.epicId ?? "");
    setTags(ticketTags);
    setStatus(ticket.status as TicketStatus);
    setIsBlocked(ticket.isBlocked ?? false);
    setBlockedReason(ticket.blockedReason ?? "");
    setSubtasks(ticketSubtasks);
    setTouched({ title: false });
  }, [ticket]);

  // Validation errors - computed from current values
  const errors = {
    title: title.trim().length === 0 ? "Title is required" : null,
  };

  // Mark a field as touched (called on blur)
  const handleBlur = useCallback(() => {
    setTouched((prev) => ({ ...prev, title: true }));
  }, []);

  // Handle close - resets form and calls onClose
  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

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
    // Mark all required fields as touched to show any errors
    setTouched({ title: true });

    const trimmedTitle = title.trim();

    // Validate and focus first invalid field
    if (!trimmedTitle) {
      titleInputRef.current?.focus();
      return;
    }
    if (!projectId) {
      projectSelectRef.current?.focus();
      return;
    }

    // Build updates object - only include fields that have changed
    // Note: projectId cannot be changed via update (ticket must be moved)
    const updates: Parameters<typeof updateMutation.mutate>[0]["updates"] = {
      title: trimmedTitle,
      status,
    };

    const trimmedDesc = description.trim();
    if (trimmedDesc !== (ticket.description ?? "")) {
      updates.description = trimmedDesc || null;
    }
    if (priority !== (ticket.priority ?? "")) {
      if (priority) {
        updates.priority = priority as "high" | "medium" | "low";
      }
      // Note: Setting priority to undefined removes it, but UpdateTicketInput
      // doesn't support unsetting - this is expected behavior
    }
    if (epicId !== (ticket.epicId ?? "")) {
      updates.epicId = epicId || null;
    }
    if (JSON.stringify(tags) !== JSON.stringify(safeJsonParse<string[]>(ticket.tags, []))) {
      updates.tags = tags;
    }
    if (isBlocked !== (ticket.isBlocked ?? false)) {
      updates.isBlocked = isBlocked;
    }
    if (blockedReason !== (ticket.blockedReason ?? "")) {
      updates.blockedReason = blockedReason || null;
    }
    if (
      JSON.stringify(subtasks) !== JSON.stringify(safeJsonParse<Subtask[]>(ticket.subtasks, []))
    ) {
      updates.subtasks = subtasks;
    }

    updateMutation.mutate(
      { id: ticket.id, updates },
      {
        onSuccess: () => {
          showToast("success", `Ticket "${trimmedTitle}" updated`);
          onSuccess?.();
          onClose();
        },
        onError: (err) => {
          showToast("error", err instanceof Error ? err.message : "Failed to update ticket");
        },
      }
    );
  }, [
    title,
    description,
    projectId,
    priority,
    epicId,
    tags,
    status,
    isBlocked,
    blockedReason,
    subtasks,
    ticket,
    updateMutation,
    showToast,
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

  // Handle delete button click - opens confirmation modal
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(() => {
    setDeleteError(null);
    deleteMutation.mutate(
      { ticketId: ticket.id, confirm: true },
      {
        onSuccess: () => {
          setShowDeleteConfirm(false);
          showToast("success", `Ticket "${ticket.title}" deleted`);
          onClose();
          onSuccess?.();
        },
        onError: (err: Error) => {
          setDeleteError(err.message);
        },
      }
    );
  }, [ticket.id, ticket.title, deleteMutation, showToast, onClose, onSuccess]);

  // Handle delete modal close
  const handleDeleteModalClose = useCallback(() => {
    setShowDeleteConfirm(false);
    setDeleteError(null);
  }, []);

  // Handle opening the Create Epic modal
  const handleOpenCreateEpic = useCallback(() => {
    setIsCreateEpicOpen(true);
  }, []);

  // Handle successful epic creation - auto-select the new epic
  const handleEpicCreated = useCallback((newEpicId: string) => {
    setEpicId(newEpicId);
  }, []);

  // Handle launch action - launches Claude, OpenCode, or Ralph
  const handleLaunch = useCallback(
    async (type: LaunchType) => {
      setIsLaunching(true);
      setLaunchingType(type);

      try {
        // Get ticket context for all launch types
        const contextResult = await getTicketContext({ data: ticket.id });

        if (type === "claude") {
          // Launch Claude in terminal
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

          // Show warnings if any
          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", `Claude launched in ${launchResult.terminalUsed}`);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "codex") {
          // Launch Codex in terminal
          const launchResult = await launchCodexInTerminal({
            data: {
              ticketId: ticket.id,
              context: contextResult.context,
              projectPath: contextResult.projectPath,
              launchMode: "auto",
              preferredTerminal: settings?.terminalEmulator ?? null,
              projectName: contextResult.projectName,
              epicName: contextResult.epicName,
              ticketTitle: contextResult.ticketTitle,
            },
          });

          // Show warnings if any
          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", `Codex launched in ${launchResult.terminalUsed}`);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "codex-cli") {
          const launchResult = await launchCodexInTerminal({
            data: {
              ticketId: ticket.id,
              context: contextResult.context,
              projectPath: contextResult.projectPath,
              launchMode: "cli",
              preferredTerminal: settings?.terminalEmulator ?? null,
              projectName: contextResult.projectName,
              epicName: contextResult.epicName,
              ticketTitle: contextResult.ticketTitle,
            },
          });

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", "Codex CLI launched");
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "codex-app") {
          const launchResult = await launchCodexInTerminal({
            data: {
              ticketId: ticket.id,
              context: contextResult.context,
              projectPath: contextResult.projectPath,
              launchMode: "app",
              preferredTerminal: settings?.terminalEmulator ?? null,
              projectName: contextResult.projectName,
              epicName: contextResult.epicName,
              ticketTitle: contextResult.ticketTitle,
            },
          });

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", "Codex App launched");
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "vscode") {
          const launchResult = await launchVSCodeInTerminal({
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

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", "VS Code launched");
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "cursor") {
          const launchResult = await launchCursorInTerminal({
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

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast(
              "success",
              `Cursor launched${launchResult.terminalUsed ? ` (${launchResult.terminalUsed})` : ""}`
            );
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "cursor-agent") {
          const launchResult = await launchCursorAgentInTerminal({
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

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast(
              "success",
              `Cursor Agent launched${launchResult.terminalUsed ? ` (${launchResult.terminalUsed})` : ""}`
            );
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "copilot") {
          const launchResult = await launchCopilotInTerminal({
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

          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", `Copilot CLI launched in ${launchResult.terminalUsed}`);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "opencode") {
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

          // Show warnings if any
          if (launchResult.warnings) {
            launchResult.warnings.forEach((warning) => showToast("info", warning));
          }

          if (launchResult.success) {
            showToast("success", `OpenCode launched in ${launchResult.terminalUsed}`);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", launchResult.message);
          }
        } else if (type === "ralph-native") {
          // Initialize workflow first (git branch, status, audit comment)
          const workflowResult = await startTicketWorkflowFn({
            data: { ticketId: ticket.id, projectPath: contextResult.projectPath },
          });
          if (!workflowResult.success) {
            showToast(
              "info",
              `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`
            );
          } else if (workflowResult.warnings?.length) {
            workflowResult.warnings.forEach((warning) => showToast("info", warning));
          }

          // Launch Ralph with Claude backend
          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "claude",
          });

          // Show warnings if any
          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", result.message);
          }
        } else if (type === "ralph-opencode") {
          // Initialize workflow first (git branch, status, audit comment)
          const workflowResult = await startTicketWorkflowFn({
            data: { ticketId: ticket.id, projectPath: contextResult.projectPath },
          });
          if (!workflowResult.success) {
            showToast(
              "info",
              `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`
            );
          } else if (workflowResult.warnings?.length) {
            workflowResult.warnings.forEach((warning) => showToast("info", warning));
          }

          // Launch Ralph with OpenCode backend
          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "opencode",
          });

          // Show warnings if any
          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", result.message);
          }
        } else if (type === "ralph-codex") {
          // Initialize workflow first (git branch, status, audit comment)
          const workflowResult = await startTicketWorkflowFn({
            data: { ticketId: ticket.id, projectPath: contextResult.projectPath },
          });
          if (!workflowResult.success) {
            showToast(
              "info",
              `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`
            );
          } else if (workflowResult.warnings?.length) {
            workflowResult.warnings.forEach((warning) => showToast("info", warning));
          }

          // Launch Ralph with Codex backend
          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "codex",
          });

          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", result.message);
          }
        } else if (type === "ralph-vscode") {
          // Initialize workflow first (git branch, status, audit comment)
          const workflowResult = await startTicketWorkflowFn({
            data: { ticketId: ticket.id, projectPath: contextResult.projectPath },
          });
          if (!workflowResult.success) {
            showToast(
              "info",
              `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`
            );
          } else if (workflowResult.warnings?.length) {
            workflowResult.warnings.forEach((warning) => showToast("info", warning));
          }

          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "claude",
            workingMethodOverride: "vscode",
          });

          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", result.message);
          }
        } else if (type === "ralph-cursor") {
          // Initialize workflow first (git branch, status, audit comment)
          const workflowResult = await startTicketWorkflowFn({
            data: { ticketId: ticket.id, projectPath: contextResult.projectPath },
          });
          if (!workflowResult.success) {
            showToast(
              "info",
              `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`
            );
          } else if (workflowResult.warnings?.length) {
            workflowResult.warnings.forEach((warning) => showToast("info", warning));
          }

          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "claude",
            workingMethodOverride: "cursor",
          });

          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", result.message);
          }
        } else if (type === "ralph-cursor-agent") {
          // Initialize workflow first (git branch, status, audit comment)
          const workflowResult = await startTicketWorkflowFn({
            data: { ticketId: ticket.id, projectPath: contextResult.projectPath },
          });
          if (!workflowResult.success) {
            showToast(
              "info",
              `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`
            );
          } else if (workflowResult.warnings?.length) {
            workflowResult.warnings.forEach((warning) => showToast("info", warning));
          }

          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "cursor-agent",
          });

          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", result.message);
          }
        } else if (type === "ralph-copilot") {
          // Initialize workflow first (git branch, status, audit comment)
          const workflowResult = await startTicketWorkflowFn({
            data: { ticketId: ticket.id, projectPath: contextResult.projectPath },
          });
          if (!workflowResult.success) {
            showToast(
              "info",
              `Branch setup skipped: ${workflowResult.error || "Unknown error"}. Launching on the current branch.`
            );
          } else if (workflowResult.warnings?.length) {
            workflowResult.warnings.forEach((warning) => showToast("info", warning));
          }

          const result = await launchRalphMutation.mutateAsync({
            ticketId: ticket.id,
            preferredTerminal: settings?.terminalEmulator ?? null,
            useSandbox: false,
            aiBackend: "claude",
            workingMethodOverride: "copilot-cli",
          });

          if ("warnings" in result && result.warnings) {
            (result.warnings as string[]).forEach((warning) => showToast("info", warning));
          }

          if (result.success) {
            showToast("success", result.message);
            setStatus("in_progress");
            onSuccess?.();
            onClose();
          } else {
            showToast("error", result.message);
          }
        }
        // Docker launch mode removed from LaunchActions; no docker handler needed here
      } catch (error) {
        console.error("Failed to launch:", error);
        const message = error instanceof Error ? error.message : "An unexpected error occurred";
        showToast("error", `Failed to launch: ${message}`);
      } finally {
        setIsLaunching(false);
        setLaunchingType(null);
      }
    },
    [ticket.id, settings?.terminalEmulator, showToast, launchRalphMutation, onSuccess, onClose]
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
    background: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
  };

  const modalStyles: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: "56rem",
    maxHeight: "85vh",
    background: "var(--bg-secondary)",
    borderRadius: "var(--radius-2xl)",
    border: "1px solid var(--glass-border)",
    boxShadow: "var(--shadow-modal)",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const headerStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--spacing-5)",
    borderBottom: "1px solid var(--border-primary)",
  };

  const titleStyles: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    color: "var(--text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-semibold)" as React.CSSProperties["fontWeight"],
    letterSpacing: "var(--tracking-tight)",
    margin: 0,
  };

  const headerTitleGroupStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "var(--spacing-2)",
    minWidth: 0,
  };

  const epicLinkTagStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-1)",
    padding: "3px var(--spacing-2)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border-primary)",
    background: "var(--bg-card)",
    color: "var(--text-secondary)",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: "pointer",
    transition: "all var(--transition-fast)",
    maxWidth: "100%",
  };

  const closeButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-lg)",
    color: "var(--text-tertiary)",
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  const contentStyles: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "var(--spacing-5)",
    display: "grid",
    gridTemplateColumns: "1fr 280px",
    gap: "0",
    alignContent: "start",
  };

  const labelStyles: React.CSSProperties = {
    display: "block",
    color: "var(--text-muted)",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    letterSpacing: "var(--tracking-wider)",
    textTransform: "uppercase",
    marginBottom: "6px",
  };

  const inputStyles: React.CSSProperties = {
    width: "100%",
    padding: "var(--spacing-2) var(--spacing-3)",
    background: "var(--bg-card)",
    border: "1px solid var(--border-primary)",
    borderRadius: "var(--radius-xl)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--font-size-base)",
    outline: "none",
    transition: "border-color var(--transition-fast)",
  };

  const textareaStyles: React.CSSProperties = {
    ...inputStyles,
    minHeight: "80px",
    resize: "vertical" as const,
    fontFamily: "var(--font-sans)",
  };

  const selectStyles: React.CSSProperties = {
    ...inputStyles,
    cursor: "pointer",
  };

  const errorStyles: React.CSSProperties = {
    padding: "var(--spacing-3)",
    background: "var(--error-muted)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-xl)",
    color: "#f87171",
    fontSize: "var(--font-size-sm)",
  };

  const fieldErrorStyles: React.CSSProperties = {
    marginTop: "var(--spacing-1)",
    color: "#ef4444",
    fontSize: "var(--font-size-xs)",
  };

  const invalidBorderStyle = "1px solid #ef4444";

  const footerStyles: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "var(--spacing-4) var(--spacing-5)",
    borderTop: "1px solid var(--border-primary)",
  };

  const cancelButtonStyles: React.CSSProperties = {
    padding: "var(--spacing-2) var(--spacing-4)",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-lg)",
    color: "var(--text-tertiary)",
    fontSize: "var(--font-size-sm)",
    fontFamily: "var(--font-sans)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  const submitButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-2) var(--spacing-5)",
    background: "var(--gradient-accent)",
    border: "none",
    borderRadius: "var(--radius-xl)",
    color: "var(--text-on-accent)",
    fontSize: "var(--font-size-sm)",
    fontFamily: "var(--font-sans)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: isSaving ? "not-allowed" : "pointer",
    opacity: isSaving ? 0.5 : 1,
    transition: "all var(--transition-fast)",
    boxShadow: "var(--shadow-sm)",
  };

  const deleteButtonStyles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "var(--spacing-2)",
    padding: "var(--spacing-2) var(--spacing-4)",
    background: "transparent",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "var(--radius-xl)",
    color: "#ef4444",
    fontSize: "var(--font-size-sm)",
    fontFamily: "var(--font-sans)",
    fontWeight: "var(--font-weight-medium)" as React.CSSProperties["fontWeight"],
    cursor: "pointer",
    transition: "all var(--transition-fast)",
  };

  // Get status color for the indicator
  const currentStatusOption = STATUS_OPTIONS.find((s) => s.value === status);
  const statusColor = currentStatusOption?.color ?? "#6b7280";

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
        aria-labelledby="edit-ticket-title"
      >
        {/* Header */}
        <header style={headerStyles}>
          <div style={headerTitleGroupStyles}>
            <h2 id="edit-ticket-title" style={titleStyles}>
              <Ticket size={20} aria-hidden="true" />
              Edit Ticket
            </h2>
            {selectedEpic && (
              <button
                type="button"
                onClick={handleOpenEpic}
                style={epicLinkTagStyles}
                className="hover:bg-[var(--bg-hover)]"
                aria-label={`Open epic ${selectedEpic.title}`}
              >
                <FolderOpen size={14} aria-hidden="true" />
                {selectedEpic.title}
              </button>
            )}
          </div>
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

        {/* Content / Body — Two-panel layout */}
        <div style={contentStyles}>
          {/* Error display */}
          {error && <div style={{ ...errorStyles, gridColumn: "1 / -1" }}>{error.message}</div>}

          {/* LEFT PANEL: Content (Title, Description, Subtasks) */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-5)",
              minWidth: 0,
            }}
          >
            {/* Title */}
            <div>
              <label style={labelStyles} htmlFor="edit-ticket-title-input">
                Title <span style={{ color: "var(--error)" }}>*</span>
              </label>
              <input
                ref={titleInputRef}
                id="edit-ticket-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleFieldKeyDown}
                placeholder="What needs to be done?"
                style={{
                  ...inputStyles,
                  fontSize: "var(--font-size-lg)",
                  fontWeight: 600,
                  letterSpacing: "var(--tracking-tight)",
                  padding: "var(--spacing-3) var(--spacing-4)",
                  border: touched.title && errors.title ? invalidBorderStyle : inputStyles.border,
                }}
                className="focus:border-[var(--accent-primary)]"
                autoComplete="off"
                aria-invalid={touched.title && errors.title ? "true" : undefined}
                aria-describedby={touched.title && errors.title ? "edit-title-error" : undefined}
              />
              {touched.title && errors.title && (
                <p id="edit-title-error" style={fieldErrorStyles} role="alert">
                  {errors.title}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label style={labelStyles} htmlFor="edit-ticket-description">
                Description
              </label>
              <textarea
                id="edit-ticket-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onKeyDown={handleFieldKeyDown}
                placeholder="Add more details... (optional)"
                style={{ ...textareaStyles, minHeight: "160px" }}
                className="focus:border-[var(--accent-primary)]"
              />
            </div>

            {/* Subtasks */}
            <div>
              <SubtaskList value={subtasks} onChange={setSubtasks} />
            </div>
          </div>

          {/* RIGHT PANEL: Metadata sidebar */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-4)",
              minWidth: 0,
              paddingLeft: "var(--spacing-5)",
              borderLeft: "1px solid var(--border-primary)",
            }}
          >
            {/* Status */}
            <div>
              <label style={labelStyles} htmlFor="edit-ticket-status">
                Status
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-2)" }}>
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: statusColor,
                    flexShrink: 0,
                    boxShadow: `0 0 6px ${statusColor}`,
                  }}
                  aria-hidden="true"
                />
                <select
                  id="edit-ticket-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                  style={{ ...selectStyles, flex: 1 }}
                  className="focus:border-[var(--accent-primary)]"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Priority */}
            <div>
              <label style={labelStyles} htmlFor="edit-ticket-priority">
                Priority
              </label>
              <select
                id="edit-ticket-priority"
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

            {/* Project (read-only) */}
            <div>
              <label style={labelStyles} htmlFor="edit-ticket-project">
                Project
              </label>
              <select
                ref={projectSelectRef}
                id="edit-ticket-project"
                value={projectId}
                disabled
                style={{
                  ...selectStyles,
                  cursor: "not-allowed",
                  opacity: 0.4,
                }}
                title="Project cannot be changed after creation"
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Epic */}
            <div style={{ minWidth: 0 }}>
              <label style={labelStyles} htmlFor="edit-ticket-epic">
                Epic
              </label>
              <EpicSelect
                id="edit-ticket-epic"
                projectId={projectId || null}
                value={epicId || null}
                onChange={(newEpicId) => setEpicId(newEpicId ?? "")}
                epics={projectEpics}
                onCreateEpic={handleOpenCreateEpic}
              />
            </div>

            {/* Tags */}
            <div>
              <label style={labelStyles} htmlFor="edit-ticket-tags">
                Tags
              </label>
              <TagInput
                id="edit-ticket-tags"
                value={tags}
                onChange={setTags}
                availableTags={availableTags}
                placeholder="Add tags..."
              />
            </div>

            {/* Blocked */}
            <div
              style={{
                borderTop: "1px solid var(--border-primary)",
                paddingTop: "var(--spacing-4)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-3)" }}>
                <input
                  type="checkbox"
                  id="edit-ticket-blocked"
                  checked={isBlocked}
                  onChange={(e) => {
                    setIsBlocked(e.target.checked);
                    if (!e.target.checked) {
                      setBlockedReason("");
                    }
                  }}
                  style={{
                    width: "16px",
                    height: "16px",
                    marginTop: "2px",
                    cursor: "pointer",
                    accentColor: "var(--error)",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <label
                    htmlFor="edit-ticket-blocked"
                    style={{
                      color: "var(--text-primary)",
                      fontSize: "var(--font-size-sm)",
                      cursor: "pointer",
                    }}
                  >
                    Mark as Blocked
                  </label>
                  {isBlocked && (
                    <div style={{ marginTop: "var(--spacing-2)" }}>
                      <input
                        type="text"
                        id="edit-ticket-blocked-reason"
                        value={blockedReason}
                        onChange={(e) => setBlockedReason(e.target.value)}
                        placeholder="Reason for blocking..."
                        style={{ ...inputStyles, fontSize: "var(--font-size-sm)" }}
                        className="focus:border-[var(--accent-primary)]"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Launch Actions */}
            <div
              style={{
                borderTop: "1px solid var(--border-primary)",
                paddingTop: "var(--spacing-4)",
              }}
            >
              <LaunchActions
                ticketStatus={status}
                onLaunch={handleLaunch}
                isLaunching={isLaunching}
                launchingType={launchingType}
                disabled={isSaving || isDeleting}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer style={footerStyles}>
          {/* Delete button on the left */}
          <button
            type="button"
            style={deleteButtonStyles}
            onClick={handleDeleteClick}
            className="hover:bg-red-500/10"
            aria-label="Delete ticket"
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete
          </button>

          {/* Right side buttons */}
          <div style={{ display: "flex", gap: "var(--spacing-3)" }}>
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
              disabled={isSaving}
              className="hover:opacity-90"
            >
              {isSaving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </footer>
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={handleDeleteModalClose}
        onConfirm={handleDeleteConfirm}
        isLoading={isDeleting}
        entityType="ticket"
        entityName={ticket.title}
        preview={{
          commentCount: deletePreview?.commentCount ?? 0,
        }}
        error={deleteError}
      />

      {/* Create Epic Modal - opens when "Create New Epic" is clicked in EpicSelect */}
      {selectedProject && (
        <CreateEpicModal
          isOpen={isCreateEpicOpen}
          projectId={projectId}
          projectName={selectedProject.name}
          onClose={() => setIsCreateEpicOpen(false)}
          onSuccess={handleEpicCreated}
        />
      )}
    </div>
  );
};

export default EditTicketModal;
