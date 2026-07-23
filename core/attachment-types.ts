export type AttachmentType =
  | "mockup"
  | "wireframe"
  | "bug-screenshot"
  | "expected-behavior"
  | "actual-behavior"
  | "diagram"
  | "error-message"
  | "console-log"
  | "reference"
  | "asset"
  | "verification-screenshot"
  | "api-evidence"
  | "verification-manifest";

export type AttachmentPriority = "primary" | "supplementary";

export type AttachmentProvider =
  | "claude"
  | "pi"
  | "opencode"
  | "cursor"
  | "cursor-agent"
  | "copilot"
  | "codex"
  | "vscode"
  | "windsurf"
  | "unknown";

export type BaseAttachmentUploader = AttachmentProvider | "human" | "ralph";
export type ProviderRalphUploader = `${AttachmentProvider} ralph`;
export type LegacyRalphUploader = `ralph:${string}`;
export type AttachmentUploader =
  | BaseAttachmentUploader
  | ProviderRalphUploader
  | LegacyRalphUploader;

export interface TicketAttachment {
  id: string;
  filename: string;
  type: AttachmentType;
  description?: string;
  priority: AttachmentPriority;
  linkedCriteria?: string[];
  uploadedBy: AttachmentUploader;
  uploadedAt: string;
}

export interface AttachmentTypeConfig {
  label: string;
  icon: string;
  contextHeader: string;
  aiInstruction: string;
}

export type FileContentType = "image" | "text" | "reference";

export interface FileTypeConfig {
  mime: string;
  type: FileContentType;
  fence?: string;
}

export const ATTACHMENT_TYPE_CONFIG: Record<AttachmentType, AttachmentTypeConfig> = {
  mockup: {
    label: "Mockup/Design",
    icon: "Palette",
    contextHeader: "Design Mockups (IMPLEMENT TO MATCH)",
    aiInstruction: "Your implementation MUST match this design",
  },
  wireframe: {
    label: "Wireframe",
    icon: "LayoutTemplate",
    contextHeader: "Wireframes (REFERENCE LAYOUT)",
    aiInstruction: "Follow this layout structure",
  },
  "bug-screenshot": {
    label: "Bug Screenshot",
    icon: "Bug",
    contextHeader: "Bug Screenshots (THIS IS BROKEN)",
    aiInstruction: "This shows what's wrong - fix this behavior",
  },
  "expected-behavior": {
    label: "Expected Behavior",
    icon: "CheckCircle",
    contextHeader: "Expected Behavior (TARGET STATE)",
    aiInstruction: "Make the behavior match this",
  },
  "actual-behavior": {
    label: "Actual Behavior",
    icon: "XCircle",
    contextHeader: "Actual Behavior (CURRENT BROKEN STATE)",
    aiInstruction: "This is the current broken state to fix",
  },
  diagram: {
    label: "Diagram",
    icon: "GitBranch",
    contextHeader: "Diagrams (REFERENCE)",
    aiInstruction: "Use for understanding architecture/flow",
  },
  "error-message": {
    label: "Error Message",
    icon: "AlertTriangle",
    contextHeader: "Error Messages (DEBUG THIS)",
    aiInstruction: "Debug and fix this error",
  },
  "console-log": {
    label: "Console Log",
    icon: "Terminal",
    contextHeader: "Console Output (DEBUG INFO)",
    aiInstruction: "Use this debugging information",
  },
  reference: {
    label: "Reference",
    icon: "FileImage",
    contextHeader: "Reference Images",
    aiInstruction: "Use for general reference",
  },
  asset: {
    label: "Asset",
    icon: "Image",
    contextHeader: "Assets (USE DIRECTLY)",
    aiInstruction: "Use this image asset directly in the implementation",
  },
  "verification-screenshot": {
    label: "Verification Screenshot",
    icon: "Camera",
    contextHeader: "Verification Screenshots (RUNNER EVIDENCE)",
    aiInstruction: "Evidence captured by the verification runner",
  },
  "api-evidence": {
    label: "API Evidence",
    icon: "FileJson",
    contextHeader: "API Evidence (RUNNER CAPTURE)",
    aiInstruction: "Request/response evidence captured by the verification runner",
  },
  "verification-manifest": {
    label: "Verification Manifest",
    icon: "ShieldCheck",
    contextHeader: "Verification Manifest (INTEGRITY PROVENANCE)",
    aiInstruction: "Tamper-evident manifest for a verification run",
  },
};

export const ATTACHMENT_TYPES = Object.keys(ATTACHMENT_TYPE_CONFIG) as AttachmentType[];

export const RUNNER_EVIDENCE_ATTACHMENT_TYPES = [
  "verification-screenshot",
  "api-evidence",
  "verification-manifest",
] as const satisfies readonly AttachmentType[];

export function isRunnerEvidenceAttachmentType(
  type: unknown
): type is (typeof RUNNER_EVIDENCE_ATTACHMENT_TYPES)[number] {
  return (
    typeof type === "string" &&
    (RUNNER_EVIDENCE_ATTACHMENT_TYPES as readonly string[]).includes(type)
  );
}

export const FILE_TYPES: Record<string, FileTypeConfig> = {
  jpg: { mime: "image/jpeg", type: "image" },
  jpeg: { mime: "image/jpeg", type: "image" },
  png: { mime: "image/png", type: "image" },
  gif: { mime: "image/gif", type: "image" },
  webp: { mime: "image/webp", type: "image" },
  svg: { mime: "image/svg+xml", type: "image" },
  txt: { mime: "text/plain", type: "text", fence: "" },
  md: { mime: "text/markdown", type: "text", fence: "markdown" },
  json: { mime: "application/json", type: "text", fence: "json" },
  pdf: { mime: "application/pdf", type: "reference" },
};

export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/svg+xml": ["svg"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt"],
  "text/markdown": ["md"],
  "application/json": ["json"],
};

export const MIME_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(FILE_TYPES).map(([ext, config]) => [ext, config.mime])
);

export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"] as const;

const ATTACHMENT_PROVIDERS: AttachmentProvider[] = [
  "claude",
  "pi",
  "opencode",
  "cursor",
  "cursor-agent",
  "copilot",
  "codex",
  "vscode",
  "windsurf",
  "unknown",
];

const BASE_UPLOADERS: BaseAttachmentUploader[] = ["human", "ralph", ...ATTACHMENT_PROVIDERS];

/** Maximum size accepted when uploading an attachment through any surface. */
export const MAX_ATTACHMENT_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * Maximum size a reader will load inline (e.g. MCP content blocks). Larger
 * files are reported as oversized instead of being read into memory.
 */
export const MAX_ATTACHMENT_INLINE_SIZE = 5 * 1024 * 1024;

/**
 * Above this size readers still load the file but attach a warning, since
 * large inline content is unreliable for some AI clients.
 */
export const RECOMMENDED_ATTACHMENT_INLINE_SIZE = 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A stored attachment filename is safe when it matches what the write-side
 * sanitizer (core/attachments.ts) would have produced. Read surfaces use this
 * to reject DB rows that reference traversal-style paths instead of trusting
 * them.
 */
export function isSafeAttachmentFilename(filename: string): boolean {
  if (!filename || filename === "." || filename === "..") return false;
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

export function isValidAttachmentType(type: unknown): type is AttachmentType {
  return typeof type === "string" && type in ATTACHMENT_TYPE_CONFIG;
}

export function isValidAttachmentPriority(priority: unknown): priority is AttachmentPriority {
  return priority === "primary" || priority === "supplementary";
}

export function normalizeAttachmentProvider(provider: unknown): AttachmentProvider {
  if (typeof provider !== "string") return "unknown";
  const normalized = provider.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "claude-code") return "claude";
  if (normalized === "copilot-cli") return "copilot";
  if (normalized === "open-code") return "opencode";
  if ((ATTACHMENT_PROVIDERS as string[]).includes(normalized))
    return normalized as AttachmentProvider;
  return "unknown";
}

export function createProviderRalphUploader(provider: unknown): ProviderRalphUploader {
  return `${normalizeAttachmentProvider(provider)} ralph`;
}

export function normalizeAttachmentUploader(uploader: unknown): AttachmentUploader {
  if (uploader && typeof uploader === "object") {
    const obj = uploader as Record<string, unknown>;
    if (obj.agent === "ralph") return createProviderRalphUploader(obj.provider);
  }

  if (typeof uploader !== "string") return "human";

  const normalized = uploader.trim().toLowerCase();
  if (normalized.startsWith("ralph:")) {
    return createProviderRalphUploader(normalized.slice("ralph:".length));
  }
  if (normalized.endsWith(" ralph")) {
    return createProviderRalphUploader(normalized.slice(0, -" ralph".length));
  }
  if ((BASE_UPLOADERS as string[]).includes(normalized))
    return normalized as BaseAttachmentUploader;
  return "human";
}

export function normalizeAttachments(
  attachments: string | unknown[] | null | undefined
): TicketAttachment[] {
  if (!attachments) return [];

  let parsed: unknown[];
  if (typeof attachments === "string") {
    try {
      parsed = JSON.parse(attachments) as unknown[];
    } catch {
      return [];
    }
  } else {
    parsed = attachments;
  }

  if (!Array.isArray(parsed)) return [];

  return parsed.map((item, index) => {
    if (typeof item === "string") {
      return {
        id: `legacy-${index}-${item}`,
        filename: item,
        type: "reference",
        priority: "primary",
        uploadedBy: "human",
        uploadedAt: new Date().toISOString(),
      };
    }

    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      const attachment: TicketAttachment = {
        id: typeof obj.id === "string" ? obj.id : `generated-${index}`,
        filename: typeof obj.filename === "string" ? obj.filename : "unknown",
        type: isValidAttachmentType(obj.type) ? obj.type : "reference",
        priority: isValidAttachmentPriority(obj.priority) ? obj.priority : "primary",
        uploadedBy: normalizeAttachmentUploader(obj.uploadedBy),
        uploadedAt: typeof obj.uploadedAt === "string" ? obj.uploadedAt : new Date().toISOString(),
      };

      if (typeof obj.description === "string") attachment.description = obj.description;
      if (Array.isArray(obj.linkedCriteria)) {
        const linkedCriteria = obj.linkedCriteria.filter((c): c is string => typeof c === "string");
        if (linkedCriteria.length > 0) attachment.linkedCriteria = linkedCriteria;
      }
      return attachment;
    }

    return {
      id: `unknown-${index}`,
      filename: "unknown",
      type: "reference",
      priority: "primary",
      uploadedBy: "human",
      uploadedAt: new Date().toISOString(),
    };
  });
}

export function serializeAttachments(attachments: TicketAttachment[]): string {
  return JSON.stringify(attachments);
}
