import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Plus, ChevronDown, Upload, FileIcon, Loader2, Trash2 } from "lucide-react";
import type { Epic, ProjectWithEpics } from "../lib/hooks";
import { useCreateTicket, useTags } from "../lib/hooks";
import {
  uploadPendingAttachment,
  deletePendingAttachment,
  deletePendingAttachments,
  type Attachment,
} from "../api/attachments";
import { PRIORITY_OPTIONS } from "../lib/constants";

interface NewTicketModalProps {
  projects: ProjectWithEpics[];
  epics: Epic[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreate: () => void;
}

export default function NewTicketModal({
  projects,
  epics,
  defaultProjectId,
  onClose,
  onCreate,
}: NewTicketModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [epicId, setEpicId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  const pendingTicketId = useMemo(() => crypto.randomUUID(), []);

  const createTicketMutation = useCreateTicket();

  // Fetch existing tags for the selected project
  const {
    tags: existingTags,
    loading: tagsLoading,
    error: tagsError,
  } = useTags(projectId ? { projectId } : {});

  // Filter suggestions based on input
  const tagSuggestions = useMemo(() => {
    if (!newTag.trim()) return [];
    const input = newTag.toLowerCase().trim();
    return existingTags.filter((tag) => tag.toLowerCase().includes(input) && !tags.includes(tag));
  }, [newTag, existingTags, tags]);

  // Check if current input exactly matches an existing tag (case-insensitive)
  const inputMatchesExistingTag = useMemo(() => {
    const input = newTag.toLowerCase().trim();
    return existingTags.some((tag) => tag.toLowerCase() === input);
  }, [newTag, existingTags]);

  // Determine if we should show "press Enter" helper
  const showCreateHelper =
    newTag.trim().length > 0 && tagSuggestions.length === 0 && !inputMatchesExistingTag;

  const filteredEpics = projectId ? epics.filter((e) => e.projectId === projectId) : [];

  const selectedProject = projects.find((p) => p.id === projectId);

  useEffect(() => {
    if (epicId) {
      const epic = epics.find((e) => e.id === epicId);
      if (epic && epic.projectId !== projectId) {
        setEpicId("");
      }
    }
  }, [projectId, epicId, epics]);

  // Handle file upload - uploads files in parallel for better performance
  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      // Filter out oversized files first
      const validFiles: File[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`File "${file.name}" exceeds 10MB limit`);
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

          const attachment = await uploadPendingAttachment({
            data: {
              ticketId: pendingTicketId,
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
          alert(`Failed to upload ${failed.length} file(s):\n${failed.join("\n")}`);
        }
      } catch (error) {
        console.error("Failed to upload attachments:", error);
        alert(error instanceof Error ? error.message : "Failed to upload attachments");
      } finally {
        setIsUploadingAttachment(false);
      }
    },
    [pendingTicketId]
  );

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

  const handleDeleteAttachment = useCallback(
    async (attachment: Attachment) => {
      try {
        await deletePendingAttachment({
          data: {
            ticketId: pendingTicketId,
            filename: attachment.filename,
          },
        });
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } catch (error) {
        console.error("Failed to delete attachment:", error);
        alert(error instanceof Error ? error.message : "Failed to delete attachment");
      }
    },
    [pendingTicketId]
  );

  const handleClose = useCallback(async () => {
    if (attachments.length > 0) {
      try {
        await deletePendingAttachments({ data: pendingTicketId });
      } catch (error) {
        console.error("Failed to clean up attachments:", error);
      }
    }
    onClose();
  }, [attachments.length, pendingTicketId, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTabKey);
    titleInputRef.current?.focus();

    return () => document.removeEventListener("keydown", handleTabKey);
  }, []);

  const handleCreate = () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !projectId) return;

    const ticketData: {
      id: string;
      title: string;
      projectId: string;
      description?: string;
      priority?: "high" | "medium" | "low";
      epicId?: string;
      tags?: string[];
      attachments?: string[];
    } = {
      id: pendingTicketId,
      title: trimmedTitle,
      projectId,
    };

    if (description.trim()) {
      ticketData.description = description.trim();
    }
    if (priority) {
      ticketData.priority = priority as "high" | "medium" | "low";
    }
    if (epicId) {
      ticketData.epicId = epicId;
    }
    if (tags.length > 0) {
      ticketData.tags = tags;
    }
    if (attachments.length > 0) {
      ticketData.attachments = attachments.map((a) => a.filename);
    }

    createTicketMutation.mutate(ticketData, {
      onSuccess: () => {
        onCreate();
      },
    });
  };

  const addTag = (tagToAdd?: string) => {
    const tag = (tagToAdd ?? newTag).trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag("");
      setIsTagDropdownOpen(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const isValidIndex =
        selectedSuggestionIndex >= 0 && selectedSuggestionIndex < tagSuggestions.length;
      if (isValidIndex) {
        addTag(tagSuggestions[selectedSuggestionIndex]);
      } else {
        addTag();
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsTagDropdownOpen(true);
      setSelectedSuggestionIndex((prev) => (prev < tagSuggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Escape") {
      setIsTagDropdownOpen(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTag(e.target.value);
    setSelectedSuggestionIndex(-1);
    if (e.target.value.trim()) {
      setIsTagDropdownOpen(true);
    } else {
      setIsTagDropdownOpen(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        tagDropdownRef.current &&
        !tagDropdownRef.current.contains(e.target as Node) &&
        tagInputRef.current &&
        !tagInputRef.current.contains(e.target as Node)
      ) {
        setIsTagDropdownOpen(false);
        setSelectedSuggestionIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => void handleClose()}
        aria-hidden="true"
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          boxShadow: "0 0 60px var(--accent-glow), 0 25px 50px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2 id="modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            New Ticket
          </h2>
          <button
            onClick={() => void handleClose()}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {createTicketMutation.error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {createTicketMutation.error instanceof Error
                ? createTicketMutation.error.message
                : "Failed to create ticket"}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Title <span className="text-[var(--accent-danger)]">*</span>
            </label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Additional details..."
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] resize-y min-h-[100px]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Project <span className="text-[var(--accent-danger)]">*</span>
            </label>
            <div className="relative">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none "
              >
                <option value="">Select a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none"
              />
            </div>
            {selectedProject && (
              <p className="mt-1 text-xs text-[var(--text-tertiary)] truncate">
                {selectedProject.path}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Priority
              </label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none "
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

            <div>
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                Epic
              </label>
              <div className="relative">
                <select
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  disabled={!projectId}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] appearance-none  disabled:opacity-50"
                >
                  <option value="">{projectId ? "None" : "Select project first"}</option>
                  {filteredEpics.map((epic) => (
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
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Tags
            </label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-[var(--accent-danger)]"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X size={12} aria-hidden="true" />
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
                  onFocus={() => newTag.trim() && setIsTagDropdownOpen(true)}
                  placeholder="Add tag..."
                  className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] text-sm "
                  autoComplete="off"
                  aria-label="Add tag"
                  aria-expanded={isTagDropdownOpen && (tagsLoading || tagSuggestions.length > 0)}
                  aria-controls="tag-suggestions"
                  aria-autocomplete="list"
                />
                <button
                  type="button"
                  onClick={() => addTag()}
                  className="px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-secondary)]"
                  aria-label="Add tag"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>

              {/* Tag suggestions dropdown */}
              {isTagDropdownOpen && (tagsLoading || tagSuggestions.length > 0) && (
                <div
                  ref={tagDropdownRef}
                  id="tag-suggestions"
                  role="listbox"
                  aria-label="Tag suggestions"
                  className="absolute z-10 left-0 right-12 mt-1 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg shadow-lg max-h-40 overflow-y-auto"
                >
                  {tagsLoading ? (
                    <div
                      className="flex items-center justify-center gap-2 px-3 py-2 text-[var(--text-secondary)] text-sm"
                      role="status"
                    >
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      <span>Loading tags...</span>
                    </div>
                  ) : (
                    tagSuggestions.map((tag, index) => (
                      <button
                        key={tag}
                        type="button"
                        role="option"
                        aria-selected={index === selectedSuggestionIndex}
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

          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Attachments
              {attachments.length > 0 && (
                <span className="ml-2 text-[var(--text-tertiary)]">({attachments.length})</span>
              )}
            </label>

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
                      aria-label={`Delete attachment ${attachment.filename}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-[var(--text-tertiary)]">
            Ticket will be created in <strong>Backlog</strong> status.
          </div>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-[var(--border-primary)]">
          <button
            onClick={() => void handleClose()}
            className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={createTicketMutation.isPending || !title.trim() || !projectId}
            className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg font-medium transition-colors"
          >
            {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
