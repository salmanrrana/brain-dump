import { useRef } from "react";
import { useModalKeyboard } from "../lib/hooks";
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
      deletionItems.push(`${preview.commentCount} comment${preview.commentCount === 1 ? "" : "s"}`);
    }
  } else if (entityType === "epic") {
    // Epics unlink tickets, not delete them
    if (preview.ticketCount && preview.ticketCount > 0) {
      deletionItems.push(`${preview.ticketCount} ticket${preview.ticketCount === 1 ? "" : "s"} will be unlinked`);
    }
  } else if (entityType === "project") {
    if (preview.epicCount && preview.epicCount > 0) {
      deletionItems.push(`${preview.epicCount} epic${preview.epicCount === 1 ? "" : "s"}`);
    }
    if (preview.ticketCount && preview.ticketCount > 0) {
      deletionItems.push(`${preview.ticketCount} ticket${preview.ticketCount === 1 ? "" : "s"}`);
    }
    if (preview.commentCount && preview.commentCount > 0) {
      deletionItems.push(`${preview.commentCount} comment${preview.commentCount === 1 ? "" : "s"}`);
    }
  }

  const entityTypeLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);

  // Epic deletion is less severe - tickets are preserved
  const isDestructive = entityType !== "epic";
  const warningText = entityType === "epic"
    ? "The tickets will remain in the project."
    : "This action cannot be undone.";

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
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-description"
        className="relative bg-slate-900 rounded-lg shadow-xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-slate-800">
          <div className="flex items-center justify-center w-10 h-10 bg-red-900/50 rounded-full">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <h2 id="delete-modal-title" className="text-lg font-semibold text-gray-100">
            Delete {entityTypeLabel}?
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="ml-auto p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-gray-100 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div id="delete-modal-description" className="p-4 space-y-4">
          <p className="text-gray-100">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-white">&quot;{entityName}&quot;</span>?
          </p>

          {/* Deletion preview */}
          {deletionItems.length > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-sm text-slate-300 mb-2">
                {isDestructive ? "This will permanently delete:" : "This will affect:"}
              </p>
              <ul className="space-y-1">
                {deletionItems.map((item, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
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
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-slate-800">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-slate-400 hover:text-gray-100 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-800 disabled:text-red-400 rounded-lg font-medium transition-colors"
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
