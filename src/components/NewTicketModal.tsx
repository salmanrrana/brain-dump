import { useState, useEffect, useRef } from "react";
import { X, Plus, ChevronDown } from "lucide-react";
import type { Epic, ProjectWithEpics } from "../lib/hooks";
import { useCreateTicket } from "../lib/hooks";

interface NewTicketModalProps {
  projects: ProjectWithEpics[];
  epics: Epic[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreate: () => void;
}

const PRIORITY_OPTIONS = [
  { value: "", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

export default function NewTicketModal({
  projects,
  epics,
  defaultProjectId,
  onClose,
  onCreate,
}: NewTicketModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [epicId, setEpicId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  // Use mutation hook - handles loading state and cache invalidation automatically
  const createTicketMutation = useCreateTicket();

  // Filter epics by selected project
  const filteredEpics = projectId
    ? epics.filter((e) => e.projectId === projectId)
    : [];

  // Get selected project for display
  const selectedProject = projects.find((p) => p.id === projectId);

  // Clear epic when project changes (if epic doesn't belong to new project)
  useEffect(() => {
    if (epicId) {
      const epic = epics.find((e) => e.id === epicId);
      if (epic && epic.projectId !== projectId) {
        setEpicId("");
      }
    }
  }, [projectId, epicId, epics]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

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
    // Validation
    const trimmedTitle = title.trim();
    if (!trimmedTitle || !projectId) return;

    const ticketData: {
      title: string;
      projectId: string;
      description?: string;
      priority?: "high" | "medium" | "low";
      epicId?: string;
      tags?: string[];
    } = {
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

    // Use mutation - it handles cache invalidation automatically!
    createTicketMutation.mutate(ticketData, {
      onSuccess: () => {
        onCreate(); // Close modal and notify parent
      },
    });
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
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
        className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 id="modal-title" className="text-lg font-semibold text-gray-100">
            New Ticket
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
          {createTicketMutation.error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {createTicketMutation.error instanceof Error
                ? createTicketMutation.error.message
                : "Failed to create ticket"}
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
              placeholder="What needs to be done?"
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
              rows={3}
              placeholder="Additional details..."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
          </div>

          {/* Project (required) */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">
              Project <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
            {selectedProject && (
              <p className="mt-1 text-xs text-slate-500 truncate">
                {selectedProject.path}
              </p>
            )}
          </div>

          {/* Priority and Epic */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">
                Priority
              </label>
              <div className="relative">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
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
                  disabled={!projectId}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 appearance-none focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                >
                  <option value="">
                    {projectId ? "None" : "Select project first"}
                  </option>
                  {filteredEpics.map((epic) => (
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
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTag()}
                placeholder="Add tag..."
                className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              <button
                onClick={addTag}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="text-xs text-slate-500">
            Ticket will be created in <strong>Backlog</strong> status.
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-gray-100 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={createTicketMutation.isPending || !title.trim() || !projectId}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg font-medium transition-colors"
          >
            {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
