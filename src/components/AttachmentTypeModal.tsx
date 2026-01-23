/**
 * Modal for selecting attachment metadata during upload.
 * Prompts users to specify attachment type, description, and priority.
 */
import { useState, useRef, useCallback, useMemo } from "react";
import { useModalKeyboard } from "../lib/hooks";
import {
  X,
  Palette,
  LayoutTemplate,
  Bug,
  CheckCircle,
  XCircle,
  GitBranch,
  AlertTriangle,
  Terminal,
  FileImage,
  Image,
  Star,
} from "lucide-react";
import type { AttachmentType, AttachmentPriority } from "../lib/attachment-types";
import { ATTACHMENT_TYPE_CONFIG } from "../lib/attachment-types";

interface AttachmentTypeModalProps {
  /** Filename being uploaded */
  filename: string;
  /** Preview URL for the file (data URL) */
  previewUrl?: string;
  /** Whether the file is an image */
  isImage: boolean;
  /** Called when user confirms with selected metadata */
  onConfirm: (metadata: {
    type: AttachmentType;
    description?: string;
    priority: AttachmentPriority;
  }) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

/** Icon mapping for attachment types */
const TYPE_ICONS: Record<AttachmentType, typeof Palette> = {
  mockup: Palette,
  wireframe: LayoutTemplate,
  "bug-screenshot": Bug,
  "expected-behavior": CheckCircle,
  "actual-behavior": XCircle,
  diagram: GitBranch,
  "error-message": AlertTriangle,
  "console-log": Terminal,
  reference: FileImage,
  asset: Image,
};

/** Attachment types grouped by category for better UX */
const TYPE_CATEGORIES = [
  {
    label: "Design",
    types: ["mockup", "wireframe", "asset"] as AttachmentType[],
  },
  {
    label: "Bug Report",
    types: [
      "bug-screenshot",
      "expected-behavior",
      "actual-behavior",
      "error-message",
      "console-log",
    ] as AttachmentType[],
  },
  {
    label: "Other",
    types: ["diagram", "reference"] as AttachmentType[],
  },
];

/**
 * Auto-detect attachment type based on filename patterns.
 * Used to provide sensible defaults for common naming conventions.
 */
function detectTypeFromFilename(filename: string): AttachmentType {
  const lowerFilename = filename.toLowerCase();

  if (lowerFilename.includes("mockup") || lowerFilename.includes("design")) {
    return "mockup";
  } else if (lowerFilename.includes("wireframe")) {
    return "wireframe";
  } else if (lowerFilename.includes("bug") || lowerFilename.includes("broken")) {
    return "bug-screenshot";
  } else if (lowerFilename.includes("expected")) {
    return "expected-behavior";
  } else if (lowerFilename.includes("actual") || lowerFilename.includes("current")) {
    return "actual-behavior";
  } else if (lowerFilename.includes("error") || lowerFilename.includes("exception")) {
    return "error-message";
  } else if (lowerFilename.includes("console") || lowerFilename.includes("log")) {
    return "console-log";
  } else if (
    lowerFilename.includes("diagram") ||
    lowerFilename.includes("flow") ||
    lowerFilename.includes("architecture")
  ) {
    return "diagram";
  } else if (
    lowerFilename.includes("logo") ||
    lowerFilename.includes("icon") ||
    lowerFilename.includes("asset")
  ) {
    return "asset";
  }

  return "reference";
}

export default function AttachmentTypeModal({
  filename,
  previewUrl,
  isImage,
  onConfirm,
  onCancel,
}: AttachmentTypeModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Compute initial type from filename (synchronously to avoid setState in effect)
  const initialType = useMemo(() => detectTypeFromFilename(filename), [filename]);

  const [selectedType, setSelectedType] = useState<AttachmentType>(initialType);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<AttachmentPriority>("primary");

  // Modal keyboard handling
  useModalKeyboard(modalRef, onCancel);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    const metadata: { type: AttachmentType; description?: string; priority: AttachmentPriority } = {
      type: selectedType,
      priority,
    };
    if (description.trim()) {
      metadata.description = description.trim();
    }
    onConfirm(metadata);
  }, [selectedType, description, priority, onConfirm]);

  // Get current type config
  const typeConfig = useMemo(() => ATTACHMENT_TYPE_CONFIG[selectedType], [selectedType]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-type-modal-title"
        className="relative bg-[var(--bg-secondary)] rounded-lg w-full max-w-md overflow-hidden flex flex-col"
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-primary)]">
          <h2
            id="attachment-type-modal-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            Attachment Details
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-[var(--bg-hover)] rounded-lg transition-colors text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Preview */}
          <div className="flex items-center gap-3 p-3 bg-[var(--bg-tertiary)] rounded-lg">
            {isImage && previewUrl ? (
              <img src={previewUrl} alt={filename} className="w-16 h-16 object-cover rounded" />
            ) : (
              <div className="w-16 h-16 bg-[var(--bg-hover)] rounded flex items-center justify-center">
                <FileImage size={24} className="text-[var(--text-secondary)]" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">{filename}</p>
              {typeConfig && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {typeConfig.aiInstruction}
                </p>
              )}
            </div>
          </div>

          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              What is this image?
            </label>
            <div className="space-y-3">
              {TYPE_CATEGORIES.map((category) => (
                <div key={category.label}>
                  <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                    {category.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {category.types.map((type) => {
                      const Icon = TYPE_ICONS[type];
                      const config = ATTACHMENT_TYPE_CONFIG[type];
                      const isSelected = selectedType === type;
                      return (
                        <button
                          key={type}
                          onClick={() => setSelectedType(type)}
                          className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${
                            isSelected
                              ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-primary)]"
                              : "border-[var(--border-primary)] hover:border-[var(--border-secondary)] text-[var(--text-secondary)]"
                          }`}
                        >
                          <Icon
                            size={16}
                            className={isSelected ? "text-[var(--accent-primary)]" : ""}
                          />
                          <span className="text-sm truncate">{config.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add context about this attachment..."
              rows={2}
              className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-lg text-[var(--text-primary)] text-sm resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Priority
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setPriority("primary")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors flex-1 ${
                  priority === "primary"
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-primary)]"
                    : "border-[var(--border-primary)] hover:border-[var(--border-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                <Star
                  size={16}
                  className={
                    priority === "primary"
                      ? "text-[var(--accent-primary)] fill-[var(--accent-primary)]"
                      : ""
                  }
                />
                <span className="text-sm">Primary</span>
              </button>
              <button
                onClick={() => setPriority("supplementary")}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors flex-1 ${
                  priority === "supplementary"
                    ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-primary)]"
                    : "border-[var(--border-primary)] hover:border-[var(--border-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                <Star
                  size={16}
                  className={priority === "supplementary" ? "text-[var(--accent-primary)]" : ""}
                />
                <span className="text-sm">Supplementary</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-[var(--border-primary)]">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] rounded-lg font-medium transition-colors"
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}
