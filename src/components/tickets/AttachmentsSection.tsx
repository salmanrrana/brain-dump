import { type FC, useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileIcon, Loader2, Trash2 } from "lucide-react";
import {
  getAttachments,
  uploadAttachment,
  deleteAttachment,
  type Attachment,
} from "../../api/attachments";
import { useToast } from "../Toast";

export interface AttachmentsSectionProps {
  ticketId: string;
}

export const AttachmentsSection: FC<AttachmentsSectionProps> = ({ ticketId }) => {
  const { showToast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch attachments on mount
  useEffect(() => {
    const fetchAttachments = async () => {
      try {
        const data = await getAttachments({ data: ticketId });
        setAttachments(data);
      } catch (error) {
        showToast(
          "error",
          `Failed to load attachments: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    };
    void fetchAttachments();
  }, [ticketId, showToast]);

  const handleFileUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const validFiles: File[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          showToast("error", `File "${file.name}" exceeds 10MB limit`);
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) return;

      setIsUploading(true);
      try {
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
            data: { ticketId, filename: file.name, data: base64 },
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
          showToast("error", `Failed to upload ${failed.length} file(s): ${failed.join(", ")}`);
        }
      } catch (error) {
        showToast(
          "error",
          `Failed to upload attachments: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      } finally {
        setIsUploading(false);
      }
    },
    [ticketId, showToast]
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
      if (!confirm(`Delete "${attachment.filename}"?`)) return;

      try {
        await deleteAttachment({
          data: { ticketId, filename: attachment.filename },
        });
        setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      } catch (error) {
        showToast(
          "error",
          `Failed to delete attachment: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    },
    [ticketId, showToast]
  );

  return (
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
        {isUploading ? (
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
  );
};
