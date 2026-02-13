import { type FC, useRef, useCallback } from "react";
import { X, Download, Loader2, CheckCircle } from "lucide-react";
import { useModalKeyboard } from "../../lib/hooks";
import { useExportEpic, useExportProject } from "../../lib/hooks/transfer";
import { useToast } from "../Toast";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "epic" | "project";
  targetId: string;
  targetName: string;
}

const ExportModal: FC<ExportModalProps> = ({ isOpen, onClose, mode, targetId, targetName }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalKeyboard(modalRef, onClose);
  const { showToast } = useToast();

  const exportEpic = useExportEpic();
  const exportProject = useExportProject();
  const mutation = mode === "epic" ? exportEpic : exportProject;

  const handleExport = useCallback(() => {
    mutation.mutate(targetId, {
      onSuccess: () => {
        showToast("success", `Exported "${targetName}" as .braindump file`);
        onClose();
      },
      onError: (err) => {
        showToast("error", err instanceof Error ? err.message : "Export failed");
      },
    });
  }, [mutation, targetId, targetName, showToast, onClose]);

  if (!isOpen) return null;

  const isExporting = mutation.isPending;
  const isSuccess = mutation.isSuccess;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-md flex flex-col"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2 id="export-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            Export {mode === "epic" ? "Epic" : "Project"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {isSuccess ? (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-tertiary)]">
              <CheckCircle size={20} className="text-[var(--success)] flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">Export complete</p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Your .braindump file has been downloaded.
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Export <strong className="text-[var(--text-primary)]">{targetName}</strong> as a
                .braindump archive file. This includes all tickets, comments, review findings, demo
                scripts, and attachments.
              </p>
              <div className="rounded-lg bg-[var(--bg-tertiary)] p-3 space-y-1">
                <p className="text-xs text-[var(--text-tertiary)]">
                  The exported file can be imported into any Brain Dump instance.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-primary)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            {isSuccess ? "Close" : "Cancel"}
          </button>
          {!isSuccess && (
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg transition-colors"
            >
              {isExporting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Export</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
