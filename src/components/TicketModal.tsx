import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useModalKeyboard, useClickOutside } from "../lib/hooks";
import {
  X,
  Check,
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
} from "lucide-react";
import type { Ticket, Epic } from "../lib/hooks";
import { useUpdateTicket, useSettings, useLaunchRalphForTicket, useComments, useCreateComment, useTags } from "../lib/hooks";
import { useToast } from "./Toast";
import type { Subtask, TicketStatus, TicketPriority } from "../api/tickets";
import {
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  type Attachment,
} from "../api/attachments";
import { getTicketContext } from "../api/context";
import { launchClaudeInTerminal } from "../api/terminal";
import { safeJsonParse } from "../lib/utils";

interface TicketModalProps {
  ticket: Ticket;
  epics: Epic[];
  onClose: () => void;
  onUpdate: () => void;
}

const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "ai_review", label: "AI Review" },
  { value: "human_review", label: "Human Review" },
  { value: "done", label: "Done" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export default function TicketModal({
  ticket,
  epics,
  onClose,
  onUpdate,
}: TicketModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? "");
  const [status, setStatus] = useState<TicketStatus>(ticket.status as TicketStatus);
  const [priority, setPriority] = useState<TicketPriority | "">(
    (ticket.priority as TicketPriority) ?? ""
  );
  const [epicId, setEpicId] = useState(ticket.epicId ?? "");
  const [tags, setTags] = useState<string[]>(() => safeJsonParse(ticket.tags, []));
  const [subtasks, setSubtasks] = useState<Subtask[]>(() => safeJsonParse(ticket.subtasks, []));
  const [isBlocked, setIsBlocked] = useState(ticket.isBlocked);
  const [blockedReason, setBlockedReason] = useState(
    ticket.blockedReason ?? ""
  );
  const [newTag, setNewTag] = useState("");
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [newSubtask, setNewSubtask] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isStartingWork, setIsStartingWork] = useState(false);
  const [startWorkNotification, setStartWorkNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [showStartWorkMenu, setShowStartWorkMenu] = useState(false);
  const startWorkMenuRef = useRef<HTMLDivElement>(null);

  // Use mutation hook for type-safe updates with cache invalidation
  const updateTicketMutation = useUpdateTicket();

  // Get settings for terminal preference
  const { settings } = useSettings();

  // Toast notifications
  const { showToast } = useToast();

  // Ralph mutation hook
  const launchRalphMutation = useLaunchRalphForTicket();

  // Comments - poll every 3 seconds when ticket is in progress (Ralph might be working)
  const { comments, loading: commentsLoading } = useComments(ticket.id, {
    pollingInterval: status === "in_progress" ? 3000 : 0,
  });
  const createCommentMutation = useCreateComment();
  const [newComment, setNewComment] = useState("");
  const [showComments, setShowComments] = useState(true);

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
      return { tagSuggestions: [], showCreateHelper: false };
    }

    const inputLower = trimmedInput.toLowerCase();
    const suggestions = existingTags.filter(
      (tag) => tag.toLowerCase().includes(inputLower) && !tags.includes(tag)
    );
    const exactMatch = existingTags.some((tag) => tag.toLowerCase() === inputLower);

    return {
      tagSuggestions: suggestions,
      showCreateHelper: suggestions.length === 0 && !exactMatch,
    };
  }, [newTag, existingTags, tags]);

  // Modal keyboard handling (Escape, focus trap)
  useModalKeyboard(modalRef, onClose, {
    shouldPreventClose: useCallback(() => showStartWorkMenu, [showStartWorkMenu]),
    onPreventedClose: useCallback(() => setShowStartWorkMenu(false), []),
  });

  // Close dropdown when clicking outside
  useClickOutside(startWorkMenuRef, useCallback(() => setShowStartWorkMenu(false), []), showStartWorkMenu);

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
      }
    };
    void fetchAttachments();
  }, [ticket.id]);

  // Handle file upload
  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setIsUploadingAttachment(true);
      try {
        for (const file of Array.from(files)) {
          // Check file size (10MB max)
          if (file.size > 10 * 1024 * 1024) {
            alert(`File "${file.name}" exceeds 10MB limit`);
            continue;
          }

          // Convert to base64
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const newAttachment = await uploadAttachment({
            data: {
              ticketId: ticket.id,
              filename: file.name,
              data: base64,
            },
          });

          setAttachments((prev) => [...prev, newAttachment]);
        }
      } catch (error) {
        console.error("Failed to upload attachment:", error);
        alert("Failed to upload attachment");
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [ticket.id]
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
        alert("Failed to delete attachment");
      }
    },
    [ticket.id]
  );

  // Handle Start Work - launch Claude in terminal with context
  const handleStartWork = useCallback(async () => {
    setIsStartingWork(true);
    setStartWorkNotification(null);

    try {
      // Get ticket context
      const contextResult = await getTicketContext({ data: ticket.id });

      // Try to launch Claude in terminal with preferred terminal from settings
      const launchResult = await launchClaudeInTerminal({
        data: {
          ticketId: ticket.id,
          context: contextResult.context,
          projectPath: contextResult.projectPath,
          preferredTerminal: settings?.terminalEmulator ?? null,
        },
      });

      // Show any warnings (e.g., preferred terminal not available)
      if (launchResult.warnings) {
        launchResult.warnings.forEach((warning) => showToast("info", warning));
      }

      if (launchResult.success && launchResult.method === "terminal") {
        // Update local status to in_progress
        setStatus("in_progress");

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

      // Auto-hide notification after 5 seconds
      setTimeout(() => setStartWorkNotification(null), 5000);
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
      } catch {
        setStartWorkNotification({
          type: "error",
          message: "Failed to start work",
        });
      }
    } finally {
      setIsStartingWork(false);
    }
  }, [ticket.id, onUpdate, settings?.terminalEmulator, showToast]);

  // Handle Start Ralph - autonomous mode
  const handleStartRalph = useCallback(async () => {
    setIsStartingWork(true);
    setStartWorkNotification(null);
    setShowStartWorkMenu(false);

    try {
      const result = await launchRalphMutation.mutateAsync({
        ticketId: ticket.id,
        maxIterations: 5,
        preferredTerminal: settings?.terminalEmulator ?? null,
        useSandbox: settings?.ralphSandbox ?? false,
      });

      // Show any warnings (e.g., preferred terminal not available)
      if ("warnings" in result && result.warnings) {
        (result.warnings as string[]).forEach((warning: string) => showToast("info", warning));
      }

      if (result.success) {
        setStatus("in_progress");
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

      setTimeout(() => setStartWorkNotification(null), 5000);
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
  }, [ticket.id, onUpdate, settings?.terminalEmulator, settings?.ralphSandbox, launchRalphMutation, showToast]);

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
      }
    );
  }, [newComment, ticket.id, createCommentMutation]);

  const handleSave = useCallback(() => {
    // Build updates object conditionally to satisfy exactOptionalPropertyTypes
    const updates: Parameters<typeof updateTicketMutation.mutate>[0]["updates"] = {
      title: title.trim(),
      description: description.trim() || null,
      status,
      epicId: epicId || null,
      isBlocked,
      blockedReason: isBlocked ? blockedReason : null,
    };

    // Only include optional fields if they have values
    if (priority) {
      updates.priority = priority;
    }
    if (tags.length > 0) {
      updates.tags = tags;
    }
    if (subtasks.length > 0) {
      updates.subtasks = subtasks;
    }

    updateTicketMutation.mutate(
      { id: ticket.id, updates },
      { onSuccess: onUpdate }
    );
  }, [
    ticket.id,
    title,
    description,
    status,
    priority,
    epicId,
    tags,
    subtasks,
    isBlocked,
    blockedReason,
    onUpdate,
    updateTicketMutation,
  ]);

  const addTag = (tagToAdd?: string) => {
    const tag = (tagToAdd ?? newTag).trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag("");
      closeTagDropdown();
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
  };

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTag(e.target.value);
    setSelectedSuggestionIndex(-1);
    setIsTagDropdownOpen(!!e.target.value.trim());
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const addSubtask = () => {
    const text = newSubtask.trim();
    if (text) {
      setSubtasks([
        ...subtasks,
        { id: crypto.randomUUID(), text, completed: false },
      ]);
      setNewSubtask("");
    }
  };

  const toggleSubtask = (id: string) => {
    setSubtasks(
      subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s))
    );
  };

  const removeSubtask = (id: string) => {
    setSubtasks(subtasks.filter((s) => s.id !== id));
  };

  const moveSubtaskUp = (index: number) => {
    if (index <= 0) return;
    const newSubtasks = [...subtasks];
    const current = newSubtasks[index];
    const prev = newSubtasks[index - 1];
    if (!current || !prev) return;
    newSubtasks[index - 1] = current;
    newSubtasks[index] = prev;
    setSubtasks(newSubtasks);
  };

  const moveSubtaskDown = (index: number) => {
    if (index >= subtasks.length - 1) return;
    const newSubtasks = [...subtasks];
    const current = newSubtasks[index];
    const next = newSubtasks[index + 1];
    if (!current || !next) return;
    newSubtasks[index + 1] = current;
    newSubtasks[index] = next;
    setSubtasks(newSubtasks);
  };

  const completedSubtasks = subtasks.filter((s) => s.completed).length;

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
        className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-100">
            Edit Ticket
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
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-y min-h-[120px]"
            />
          </div>

          {/* Status, Priority, Epic */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Status
              </label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {STATUS_OPTIONS.map((opt) => (
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
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Priority
              </label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority | "")}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {PRIORITY_OPTIONS.map((opt) => (
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
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Epic
              </label>
              <div className="relative">
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          {/* Blocked */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isBlocked}
                onChange={(e) => setIsBlocked(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-red-500 focus:ring-red-500 bg-slate-800"
              />
              <span className="text-sm text-slate-300 flex items-center gap-1">
                <AlertCircle size={14} className="text-red-500" />
                Blocked
              </span>
            </label>
            {isBlocked && (
              <input
                type="text"
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value)}
                placeholder="Reason for blocking..."
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Tags
            </label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-300 rounded text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-400"
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
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => addTag()}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Tag suggestions dropdown */}
              {isTagDropdownOpen && (tagsLoading || tagSuggestions.length > 0) && (
                <div
                  ref={tagDropdownRef}
                  className="absolute z-10 left-0 right-12 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto"
                >
                  {tagsLoading ? (
                    <div className="flex items-center justify-center gap-2 px-3 py-2 text-slate-400 text-sm">
                      <Loader2 size={14} className="animate-spin" />
                      <span>Loading tags...</span>
                    </div>
                  ) : (
                    tagSuggestions.map((tag, index) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-700 ${
                          index === selectedSuggestionIndex
                            ? "bg-slate-700 text-cyan-400"
                            : "text-gray-100"
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
                <p className="mt-1 text-xs text-red-400">
                  Failed to load tags: {tagsError}
                </p>
              )}

              {/* Helper text for creating new tags */}
              {showCreateHelper && (
                <p className="mt-1 text-xs text-slate-500">
                  Press{" "}
                  <kbd className="px-1 py-0.5 bg-slate-700 rounded text-slate-400">
                    Enter
                  </kbd>{" "}
                  to create &quot;{newTag.trim()}&quot; as a new tag
                </p>
              )}
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Subtasks
              {subtasks.length > 0 && (
                <span className="ml-2 text-slate-500">
                  ({completedSubtasks}/{subtasks.length})
                </span>
              )}
            </label>
            <div className="space-y-2 mb-2">
              {subtasks.map((subtask, index) => (
                <div
                  key={subtask.id}
                  className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg group"
                >
                  <button
                    onClick={() => toggleSubtask(subtask.id)}
                    className={`w-5 h-5 rounded border flex items-center justify-center ${
                      subtask.completed
                        ? "bg-cyan-600 border-cyan-600"
                        : "border-slate-600 hover:border-slate-500"
                    }`}
                  >
                    {subtask.completed && <Check size={12} />}
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      subtask.completed
                        ? "text-slate-500 line-through"
                        : "text-gray-100"
                    }`}
                  >
                    {subtask.text}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => moveSubtaskUp(index)}
                      disabled={index === 0}
                      className="p-1 text-slate-500 hover:text-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => moveSubtaskDown(index)}
                      disabled={index === subtasks.length - 1}
                      className="p-1 text-slate-500 hover:text-slate-300 disabled:text-slate-700 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => removeSubtask(subtask.id)}
                      className="p-1 text-slate-500 hover:text-red-400"
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
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSubtask()}
                placeholder="Add subtask..."
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={addSubtask}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Attachments
              {attachments.length > 0 && (
                <span className="ml-2 text-slate-500">({attachments.length})</span>
              )}
            </label>

            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
                isDraggingOver
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-slate-700 hover:border-slate-600"
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
                <div className="flex items-center justify-center gap-2 text-slate-400">
                  <Loader2 size={20} className="animate-spin" />
                  <span>Uploading...</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload size={24} className="mx-auto text-slate-500" />
                  <p className="text-sm text-slate-400">
                    Drag and drop files here, or{" "}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-cyan-400 hover:text-cyan-300 underline"
                    >
                      browse
                    </button>
                  </p>
                  <p className="text-xs text-slate-500">Max file size: 10MB</p>
                </div>
              )}
            </div>

            {/* Attachment list */}
            {attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-3 p-2 bg-slate-800 rounded-lg group"
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
                      <div className="w-12 h-12 bg-slate-700 rounded flex items-center justify-center">
                        <FileIcon size={20} className="text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <a
                        href={attachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-100 hover:text-cyan-400 truncate block"
                      >
                        {attachment.filename}
                      </a>
                      <p className="text-xs text-slate-500">
                        {(attachment.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => void handleDeleteAttachment(attachment)}
                      className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity / Comments */}
          <div>
            <button
              onClick={() => setShowComments(!showComments)}
              className="flex items-center gap-2 text-sm font-medium text-slate-400 mb-2 hover:text-gray-100 transition-colors"
            >
              <MessageSquare size={16} />
              <span>Activity</span>
              {comments.length > 0 && (
                <span className="text-slate-500">({comments.length})</span>
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
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || createCommentMutation.isPending}
                    className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg transition-colors"
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
                  <div className="flex items-center justify-center py-4 text-slate-500">
                    <Loader2 size={20} className="animate-spin" />
                  </div>
                ) : comments.length > 0 ? (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className={`rounded-lg text-sm ${
                          comment.type === "progress"
                            ? "p-2 bg-blue-900/20 border border-blue-800/50"
                            : comment.type === "work_summary"
                              ? "p-3 bg-purple-900/30 border border-purple-800"
                              : comment.type === "test_report"
                                ? "p-3 bg-green-900/30 border border-green-800"
                                : "p-3 bg-slate-800"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {comment.type === "progress" && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                            </span>
                          )}
                          <span
                            className={`font-medium ${
                              comment.author === "ralph"
                                ? "text-purple-400"
                                : comment.author === "claude"
                                  ? "text-cyan-400"
                                  : "text-slate-300"
                            }`}
                          >
                            {comment.author === "ralph" && <Bot size={12} className="inline mr-1" />}
                            {comment.author === "claude" && <Terminal size={12} className="inline mr-1" />}
                            {comment.author.charAt(0).toUpperCase() + comment.author.slice(1)}
                          </span>
                          <span className="text-slate-500 text-xs">
                            {new Date(comment.createdAt).toLocaleString()}
                          </span>
                          {comment.type !== "comment" && (
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                comment.type === "progress"
                                  ? "bg-blue-800 text-blue-200"
                                  : comment.type === "work_summary"
                                    ? "bg-purple-800 text-purple-200"
                                    : "bg-green-800 text-green-200"
                              }`}
                            >
                              {comment.type === "progress"
                                ? "Working..."
                                : comment.type === "work_summary"
                                  ? "Work Summary"
                                  : "Test Report"}
                            </span>
                          )}
                        </div>
                        <p className={`whitespace-pre-wrap ${comment.type === "progress" ? "text-blue-100 text-xs" : "text-gray-100"}`}>{comment.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 py-2">
                    No activity yet. Comments from Claude and Ralph will appear here.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="text-xs text-slate-500 border-t border-slate-800 pt-4">
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
                ? "bg-green-900/50 text-green-300 border border-green-800"
                : "bg-red-900/50 text-red-300 border border-red-800"
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
              className="text-slate-400 hover:text-gray-100"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between gap-3 p-4 border-t border-slate-800">
          {/* Start Work Split Button */}
          <div className="relative" ref={startWorkMenuRef}>
            <div className="flex">
              <button
                onClick={() => void handleStartWork()}
                disabled={isStartingWork}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-l-lg font-medium transition-colors"
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
                className="flex items-center px-2 py-2 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-r-lg border-l border-green-700 transition-colors"
                aria-label="More start options"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Dropdown Menu */}
            {showStartWorkMenu && (
              <div className="absolute left-0 bottom-full mb-2 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-10 overflow-hidden">
                <button
                  onClick={() => {
                    setShowStartWorkMenu(false);
                    void handleStartWork();
                  }}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left"
                >
                  <Terminal size={18} className="text-green-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-100">Start with Claude</div>
                    <div className="text-xs text-slate-400">Interactive session - you guide Claude</div>
                  </div>
                </button>
                <button
                  onClick={() => void handleStartRalph()}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-700 transition-colors text-left border-t border-slate-700"
                >
                  <Bot size={18} className="text-purple-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="font-medium text-gray-100">Start with Ralph</div>
                    <div className="text-xs text-slate-400">Autonomous mode - runs until complete</div>
                  </div>
                </button>
              </div>
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
              disabled={updateTicketMutation.isPending || !title.trim()}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium transition-colors"
            >
              {updateTicketMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
