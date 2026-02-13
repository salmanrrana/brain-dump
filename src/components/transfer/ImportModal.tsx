import { type FC, useRef, useCallback, useState, type DragEvent, type ChangeEvent } from "react";
import { X, Upload, Loader2, CheckCircle, AlertTriangle, FileArchive } from "lucide-react";
import { useModalKeyboard, useProjects } from "../../lib/hooks";
import { usePreviewImport, usePerformImport } from "../../lib/hooks/transfer";
import { useToast } from "../Toast";
import type { ConflictResolution, ManifestPreview } from "../../../core/index.ts";

export interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultProjectId?: string;
}

type Step = "select" | "preview" | "result";

const ImportModal: FC<ImportModalProps> = ({ isOpen, onClose, defaultProjectId }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useModalKeyboard(modalRef, onClose);
  const { showToast } = useToast();

  // State
  const [step, setStep] = useState<Step>("select");
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [targetProjectId, setTargetProjectId] = useState(defaultProjectId ?? "");
  const [resetStatuses, setResetStatuses] = useState(false);
  const [conflictResolution, setConflictResolution] = useState<ConflictResolution>("create-new");
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<{
    epicCount: number;
    ticketCount: number;
    commentCount: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { projects } = useProjects();
  const previewMutation = usePreviewImport();
  const importMutation = usePerformImport();

  // Reset state on close
  const handleClose = useCallback(() => {
    setStep("select");
    setBase64Data(null);
    setFileName("");
    setPreview(null);
    setResetStatuses(false);
    setConflictResolution("create-new");
    setImportResult(null);
    previewMutation.reset();
    importMutation.reset();
    onClose();
  }, [onClose, previewMutation, importMutation]);

  // Read file and get preview
  const processFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".braindump")) {
        showToast("error", "Please select a .braindump file");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const b64 = btoa(binary);
        setBase64Data(b64);
        setFileName(file.name);

        previewMutation.mutate(b64, {
          onSuccess: (result) => {
            if (result.success) {
              setPreview(result.preview);
              setStep("preview");
            }
          },
          onError: (err) => {
            showToast("error", err instanceof Error ? err.message : "Failed to read archive");
          },
        });
      };
      reader.readAsArrayBuffer(file);
    },
    [previewMutation, showToast]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // Import handler
  const handleImport = useCallback(() => {
    if (!base64Data || !targetProjectId) return;

    importMutation.mutate(
      { base64Data, targetProjectId, resetStatuses, conflictResolution },
      {
        onSuccess: (result) => {
          if (result.success) {
            setImportResult({
              epicCount: result.result.epicCount,
              ticketCount: result.result.ticketCount,
              commentCount: result.result.commentCount,
            });
            setStep("result");
            showToast("success", `Imported ${result.result.ticketCount} tickets`);
          }
        },
        onError: (err) => {
          showToast("error", err instanceof Error ? err.message : "Import failed");
        },
      }
    );
  }, [base64Data, targetProjectId, resetStatuses, conflictResolution, importMutation, showToast]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-lg flex flex-col"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2 id="import-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
            Import .braindump Archive
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-4 pt-3">
          {(["select", "preview", "result"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`w-8 h-px ${step === s || (step === "result" && i <= 2) ? "bg-[var(--accent-primary)]" : "bg-[var(--border-primary)]"}`}
                />
              )}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  step === s
                    ? "bg-[var(--accent-primary)] text-white"
                    : step === "result" || (step === "preview" && i === 0)
                      ? "bg-[var(--success)] text-white"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"
                }`}
              >
                {step === "result" || (step === "preview" && i === 0) ? (
                  <CheckCircle size={14} />
                ) : (
                  i + 1
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 min-h-[200px]">
          {/* Step 1: File Selection */}
          {step === "select" && (
            <>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  isDragging
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                    : "border-[var(--border-primary)] hover:border-[var(--text-tertiary)]"
                }`}
              >
                {previewMutation.isPending ? (
                  <>
                    <Loader2 size={32} className="animate-spin text-[var(--accent-primary)]" />
                    <p className="text-sm text-[var(--text-secondary)]">Reading archive...</p>
                  </>
                ) : (
                  <>
                    <Upload size={32} className="text-[var(--text-tertiary)]" />
                    <p className="text-sm text-[var(--text-secondary)]">
                      Drag & drop a .braindump file here, or click to browse
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Only .braindump files are accepted
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".braindump"
                onChange={handleFileChange}
                className="hidden"
              />
              {previewMutation.isError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10">
                  <AlertTriangle size={16} className="text-[var(--accent-danger)] flex-shrink-0" />
                  <p className="text-sm text-[var(--accent-danger)]">
                    {previewMutation.error instanceof Error
                      ? previewMutation.error.message
                      : "Failed to read archive"}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Step 2: Preview & Options */}
          {step === "preview" && preview && (
            <>
              <div className="rounded-lg bg-[var(--bg-tertiary)] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <FileArchive size={16} className="text-[var(--accent-primary)]" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">{fileName}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
                  <span>Source: {preview.sourceProject.name}</span>
                  <span>By: {preview.exportedBy}</span>
                  <span>Epics: {preview.epicNames.join(", ") || "none"}</span>
                  <span>Tickets: {preview.ticketCount}</span>
                  <span>Comments: {preview.commentCount}</span>
                  <span>Findings: {preview.findingCount}</span>
                  <span>Attachments: {preview.attachmentCount}</span>
                  <span>
                    Exported: {new Date(preview.exportedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Target project */}
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                  Import into project
                </label>
                <select
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
                >
                  <option value="">Select a project...</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={resetStatuses}
                    onChange={(e) => setResetStatuses(e.target.checked)}
                    className="rounded border-[var(--border-primary)]"
                  />
                  Reset all ticket statuses to backlog
                </label>

                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                    If epic names conflict:
                  </p>
                  <div className="space-y-1">
                    {(
                      [
                        ["create-new", "Create as new epic (safe)"],
                        ["replace", "Replace existing epic"],
                        ["merge", "Merge into existing epic"],
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="conflict"
                          value={value}
                          checked={conflictResolution === value}
                          onChange={() => setConflictResolution(value)}
                          className="border-[var(--border-primary)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {importMutation.isError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10">
                  <AlertTriangle size={16} className="text-[var(--accent-danger)] flex-shrink-0" />
                  <p className="text-sm text-[var(--accent-danger)]">
                    {importMutation.error instanceof Error
                      ? importMutation.error.message
                      : "Import failed"}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Step 3: Result */}
          {step === "result" && importResult && (
            <div className="flex flex-col items-center gap-4 py-4">
              <CheckCircle size={48} className="text-[var(--success)]" />
              <div className="text-center">
                <p className="text-lg font-medium text-[var(--text-primary)]">Import Complete</p>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Successfully imported {importResult.ticketCount} tickets across{" "}
                  {importResult.epicCount} epics with {importResult.commentCount} comments.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--border-primary)]">
          {step === "select" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}

          {step === "preview" && (
            <>
              <button
                onClick={() => {
                  setStep("select");
                  setBase64Data(null);
                  setFileName("");
                  setPreview(null);
                  previewMutation.reset();
                }}
                className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={importMutation.isPending || !targetProjectId}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)] rounded-lg transition-colors"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    <span>Import</span>
                  </>
                )}
              </button>
            </>
          )}

          {step === "result" && (
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] rounded-lg transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
