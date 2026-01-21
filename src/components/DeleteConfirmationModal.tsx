import { useRef } from "react";
import { useModalKeyboard } from "../lib/hooks";
import { pluralize } from "../lib/utils";
import ErrorAlert from "./ErrorAlert";
import { AlertTriangle, X, Loader2 } from "lucide-react";

export type EntityType = "ticket" | "epic" | "project";

export interface DeletePreview {
  ticketCount?: number;
  epicCount?: number;
  commentCount?: number;
  tickets?: Array<{ title: string; status: string }>;
}

export interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  entityType: EntityType;
  entityName: string;
  preview: DeletePreview;
  /** Error message to display */
  error?: string | null;
}

/**
 * A reusable confirmation modal for delete operations.
 * Supports ticket, epic, and project deletion with preview of affected data.
 */
export default function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  entityType,
  entityName,
  preview,
  error,
}: DeleteConfirmationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Modal keyboard handling (Escape to close, focus trap)
  useModalKeyboard(modalRef, onClose);

  if (!isOpen) return null;

  // Build the list of items that will be deleted/affected
  const deletionItems: string[] = [];

  if (entityType === "ticket") {
    if (preview.commentCount && preview.commentCount > 0) {
      deletionItems.push(pluralize(preview.commentCount, "comment"));
    }
  } else if (entityType === "epic") {
    // Epics unlink tickets, not delete them
    if (preview.ticketCount && preview.ticketCount > 0) {
      deletionItems.push(`${pluralize(preview.ticketCount, "ticket")} will be unlinked`);
    }
  } else if (entityType === "project") {
    if (preview.epicCount && preview.epicCount > 0) {
      deletionItems.push(pluralize(preview.epicCount, "epic"));
    }
    if (preview.ticketCount && preview.ticketCount > 0) {
      deletionItems.push(pluralize(preview.ticketCount, "ticket"));
    }
    if (preview.commentCount && preview.commentCount > 0) {
      deletionItems.push(pluralize(preview.commentCount, "comment"));
    }
  }

  const entityTypeLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);

  // Epic deletion is less severe - tickets are preserved
  const isDestructive = entityType !== "epic";
  const warningText =
    entityType === "epic"
      ? "The tickets will remain in the project."
      : "This action cannot be undone.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-description"
        className="relative bg-[var(--bg-secondary)] rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center justify-center w-10 h-10 bg-[var(--accent-danger)]/20 rounded-full">
            <AlertTriangle size={20} className="text-[var(--accent-danger)]" />
          </div>
          <h2 id="delete-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            Delete {entityTypeLabel}?
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
        <div id="delete-modal-description" className="p-4 space-y-4">
          <p className="text-[var(--text-primary)]">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-[var(--text-primary)]">
              &quot;{entityName}&quot;
            </span>
            ?
          </p>

          {/* Deletion preview */}
          {deletionItems.length > 0 && (
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
              <p className="text-sm text-[var(--text-secondary)] mb-2">
                {isDestructive ? "This will permanently delete:" : "This will affect:"}
              </p>
              <ul className="space-y-1">
                {deletionItems.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warning text */}
          <p className={`text-sm ${isDestructive ? "text-red-400" : "text-amber-400"}`}>
            {warningText}
          </p>

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
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/80 disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg font-medium transition-colors"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>Delete {entityTypeLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
