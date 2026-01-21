import { useState, useRef, useEffect } from "react";
import { useModalKeyboard, useProjectDeletePreview } from "../lib/hooks";
import type { DeleteProjectPreview } from "../api/projects";
import ErrorAlert from "./ErrorAlert";
import { AlertTriangle, X, Loader2 } from "lucide-react";

interface DeleteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  projectId: string;
  projectName: string;
  error?: string | null;
}

/**
 * A specialized delete confirmation modal for projects.
 * Requires typing the project name to confirm deletion.
 * Shows comprehensive preview of all data that will be deleted.
 */
export default function DeleteProjectModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  projectId,
  projectName,
  error,
}: DeleteProjectModalProps) {
  // Return early if not open - no state needed
  if (!isOpen) return null;

  return (
    <DeleteProjectModalContent
      onClose={onClose}
      onConfirm={onConfirm}
      isLoading={isLoading}
      projectId={projectId}
      projectName={projectName}
      error={error}
    />
  );
}

interface DeleteProjectModalContentProps {
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  projectId: string;
  projectName: string;
  error?: string | null | undefined;
}

/**
 * Internal component that manages the modal content.
 * By rendering this only when isOpen is true, state resets naturally on mount.
 */
function DeleteProjectModalContent({
  onClose,
  onConfirm,
  isLoading,
  projectId,
  projectName,
  error,
}: DeleteProjectModalContentProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmationText, setConfirmationText] = useState("");

  // Fetch preview data
  const {
    data: previewData,
    isLoading: isLoadingPreview,
    error: previewError,
  } = useProjectDeletePreview(projectId);
  const preview = previewData as DeleteProjectPreview | undefined;

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  // Modal keyboard handling (Escape to close, focus trap)
  useModalKeyboard(modalRef, onClose);

  const canDelete = confirmationText === projectName;

  // Build ticket summary grouped by epic
  const ticketsByEpic = new Map<string | null, Array<{ title: string; status: string }>>();
  const epicNamesById = new Map<string, string>();

  if (preview) {
    // Create epic name lookup
    for (const epic of preview.epics) {
      epicNamesById.set(epic.id, epic.title);
    }

    // Group tickets by epic
    for (const ticket of preview.tickets) {
      const epicId = ticket.epicId;
      if (!ticketsByEpic.has(epicId)) {
        ticketsByEpic.set(epicId, []);
      }
      ticketsByEpic.get(epicId)!.push({ title: ticket.title, status: ticket.status });
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canDelete && !isLoading) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-project-modal-title"
        aria-describedby="delete-project-modal-description"
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center justify-center w-10 h-10 bg-[var(--accent-danger)]/20 rounded-full">
            <AlertTriangle size={20} className="text-[var(--accent-danger)]" />
          </div>
          <h2
            id="delete-project-modal-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Delete Project?
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="ml-auto p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div id="delete-project-modal-description" className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-[var(--text-primary)]">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              &quot;{projectName}&quot;
            </span>
            ?
          </p>

          {/* Loading preview */}
          {isLoadingPreview && (
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Loader2 size={16} className="animate-spin" />
              <span>Loading preview...</span>
            </div>
          )}

          {/* Preview fetch error */}
          {previewError && (
            <ErrorAlert
              error={
                previewError instanceof Error
                  ? previewError.message
                  : "Failed to load deletion preview"
              }
            />
          )}

          {/* Preview data */}
          {preview && (
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-[var(--accent-danger)]">
                This will PERMANENTLY delete:
              </p>

              {/* Epics */}
              {preview.epics.length > 0 && (
                <div>
                  <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                    <span>📁</span>
                    <span>Epics ({preview.epics.length}):</span>
                  </p>
                  <ul className="mt-1 ml-6 space-y-0.5">
                    {preview.epics.slice(0, 5).map((epic) => (
                      <li key={epic.id} className="text-sm text-[var(--text-tertiary)]">
                        • {epic.title}
                      </li>
                    ))}
                    {preview.epics.length > 5 && (
                      <li className="text-sm text-[var(--text-tertiary)] italic">
                        ... and {preview.epics.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Tickets */}
              {preview.tickets.length > 0 && (
                <div>
                  <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                    <span>🎫</span>
                    <span>Tickets ({preview.tickets.length}):</span>
                  </p>
                  <div className="mt-1 ml-6 space-y-2">
                    {Array.from(ticketsByEpic.entries())
                      .slice(0, 3)
                      .map(([epicId, groupedTickets]) => (
                        <div key={epicId ?? "no-epic"}>
                          <p className="text-xs text-[var(--text-tertiary)]">
                            {epicId ? epicNamesById.get(epicId) : "No Epic"}:
                          </p>
                          <ul className="ml-2 space-y-0.5">
                            {groupedTickets.slice(0, 3).map((ticket, idx) => (
                              <li key={idx} className="text-sm text-[var(--text-tertiary)]">
                                • [{ticket.status}] {ticket.title}
                              </li>
                            ))}
                            {groupedTickets.length > 3 && (
                              <li className="text-sm text-[var(--text-tertiary)] italic">
                                ... and {groupedTickets.length - 3} more
                              </li>
                            )}
                          </ul>
                        </div>
                      ))}
                    {ticketsByEpic.size > 3 && (
                      <p className="text-sm text-[var(--text-tertiary)] italic">
                        ... and tickets from {ticketsByEpic.size - 3} more groups
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Comments */}
              {preview.commentCount > 0 && (
                <p className="text-sm text-[var(--text-secondary)] flex items-center gap-2">
                  <span>💬</span>
                  <span>Comments: {preview.commentCount}</span>
                </p>
              )}

              {/* Empty project */}
              {preview.epics.length === 0 && preview.tickets.length === 0 && (
                <p className="text-sm text-[var(--text-tertiary)] italic">
                  This project has no epics or tickets.
                </p>
              )}
            </div>
          )}

          {/* Name confirmation input */}
          <div className="space-y-2">
            <label className="block text-sm text-[var(--text-secondary)]">
              Type{" "}
              <span className="font-semibold text-[var(--text-primary)]">
                &quot;{projectName}&quot;
              </span>{" "}
              to confirm:
            </label>
            <input
              ref={inputRef}
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={projectName}
              disabled={isLoading}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-danger)] disabled:opacity-50"
            />
          </div>

          {/* Error message */}
          <ErrorAlert error={error} />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-[var(--border-primary)]">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || !canDelete}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/80 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg font-medium transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete Project</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
