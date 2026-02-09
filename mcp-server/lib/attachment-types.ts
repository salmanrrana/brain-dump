/**
 * Attachment type definitions for Brain Dump MCP server.
 * Mirrors src/lib/attachment-types.ts for use in the MCP server.
 *
 * IMPORTANT: Keep in sync with src/lib/attachment-types.ts
 */

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
  | "asset";

export type ContentType = "image" | "text" | "reference";
export type AttachmentPriority = "primary" | "supplementary";
export type Uploader =
  | "human"
  | "claude"
  | "ralph"
  | "opencode"
  | "cursor"
  | "copilot"
  | "codex"
  | "windsurf";

/**
 * Valid attachment types for AI context.
 */
export const ATTACHMENT_TYPES: readonly AttachmentType[] = [
  "mockup",
  "wireframe",
  "bug-screenshot",
  "expected-behavior",
  "actual-behavior",
  "diagram",
  "error-message",
  "console-log",
  "reference",
  "asset",
];

interface FileTypeConfig {
  mime: string;
  type: ContentType;
  fence?: string;
}

/**
 * File extension to MIME type and content type mapping.
 * Used for loading attachments and generating AI context.
 *
 * Content types:
 * - "image": Binary image data, loaded as base64 for AI vision
 * - "text": Text content, embedded inline with code fence
 * - "reference": Not loaded, just referenced by path
 */
export const FILE_TYPES: Record<string, FileTypeConfig> = {
  // Images - loaded as base64 for AI vision
  jpg: { mime: "image/jpeg", type: "image" },
  jpeg: { mime: "image/jpeg", type: "image" },
  png: { mime: "image/png", type: "image" },
  gif: { mime: "image/gif", type: "image" },
  webp: { mime: "image/webp", type: "image" },
  svg: { mime: "image/svg+xml", type: "image" },

  // Text files - embedded inline with syntax highlighting
  txt: { mime: "text/plain", type: "text", fence: "" },
  md: { mime: "text/markdown", type: "text", fence: "markdown" },
  json: { mime: "application/json", type: "text", fence: "json" },

  // Reference files - not loaded, just referenced
  pdf: { mime: "application/pdf", type: "reference" },
};

/**
 * Allowed MIME types for upload validation (whitelist for security).
 * Maps MIME type to allowed file extensions.
 */
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

/**
 * Extension to MIME type mapping (reverse of ALLOWED_MIME_TYPES).
 */
export const MIME_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(FILE_TYPES).map(([ext, config]) => [ext, config.mime])
);

/**
 * Image file extensions for quick lookup.
 */
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"];

/**
 * Check if a file extension is an image type.
 */
export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.includes(ext.toLowerCase());
}

interface AttachmentTypeConfigEntry {
  label: string;
  icon: string;
  contextHeader: string;
  aiInstruction: string;
}

/**
 * Attachment type configuration for AI context generation.
 * Each type has a context header and AI instruction.
 */
export const ATTACHMENT_TYPE_CONFIG: Record<AttachmentType, AttachmentTypeConfigEntry> = {
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
};

/**
 * Check if a value is a valid attachment type.
 */
export function isValidAttachmentType(type: unknown): type is AttachmentType {
  return typeof type === "string" && type in ATTACHMENT_TYPE_CONFIG;
}

/**
 * Check if a value is a valid attachment priority.
 */
export function isValidAttachmentPriority(priority: unknown): priority is AttachmentPriority {
  return priority === "primary" || priority === "supplementary";
}

/**
 * Valid uploader types.
 */
export const VALID_UPLOADERS: readonly Uploader[] = ["human", "claude", "ralph", "opencode", "cursor", "windsurf"];

/**
 * Check if a value is a valid attachment uploader.
 */
export function isValidAttachmentUploader(uploader: unknown): uploader is Uploader {
  return typeof uploader === "string" && VALID_UPLOADERS.includes(uploader as Uploader);
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
