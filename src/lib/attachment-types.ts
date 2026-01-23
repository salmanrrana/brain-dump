/**
 * Attachment type definitions for Brain Dump.
 * These types help AI understand the intent behind attached images.
 * @module lib/attachment-types
 */

/**
 * Attachment type classification.
 * Tells AI how to interpret and act on the attachment.
 */
export type AttachmentType =
  | "mockup" // UI design to implement
  | "wireframe" // Low-fidelity layout reference
  | "bug-screenshot" // Shows the broken behavior
  | "expected-behavior" // What it should look like
  | "actual-behavior" // Current broken state (for bugs)
  | "diagram" // Architecture, flow, technical diagram
  | "error-message" // Screenshot of error/exception
  | "console-log" // Dev tools output
  | "reference" // General inspiration/reference
  | "asset"; // Logo, icon, image to use directly

/**
 * Attachment priority levels.
 */
export type AttachmentPriority = "primary" | "supplementary";

/**
 * Who uploaded the attachment.
 */
export type AttachmentUploader = "human" | "claude" | "ralph" | "opencode" | "cursor" | "windsurf";

/**
 * Structured attachment metadata.
 * Provides context for AI to understand the purpose of each attachment.
 */
export interface TicketAttachment {
  /** Unique identifier for the attachment */
  id: string;
  /** Original filename */
  filename: string;
  /** Attachment type - tells AI how to interpret */
  type: AttachmentType;
  /** Human-provided context about the attachment */
  description?: string;
  /** Importance level */
  priority: AttachmentPriority;
  /** Link to specific acceptance criteria IDs */
  linkedCriteria?: string[];
  /** Who uploaded the attachment */
  uploadedBy: AttachmentUploader;
  /** When the attachment was uploaded */
  uploadedAt: string;
}

/**
 * Configuration for attachment type display and AI context generation.
 */
export interface AttachmentTypeConfig {
  /** Display label for UI */
  label: string;
  /** Icon identifier (for lucide-react icons) */
  icon: string;
  /** AI context header for this type */
  contextHeader: string;
  /** Instruction to AI for this attachment type */
  aiInstruction: string;
}

/**
 * Configuration for each attachment type.
 * Used in UI and for generating AI context.
 */
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
 * Check if a value is a valid attachment uploader.
 */
export function isValidAttachmentUploader(uploader: unknown): uploader is AttachmentUploader {
  const validUploaders: AttachmentUploader[] = [
    "human",
    "claude",
    "ralph",
    "opencode",
    "cursor",
    "windsurf",
  ];
  return typeof uploader === "string" && validUploaders.includes(uploader as AttachmentUploader);
}

/**
 * Normalize attachment data - handles both legacy string format and new object format.
 * Legacy: ["image1.png", "image2.png"]
 * New: [{ id: "...", filename: "image1.png", type: "mockup", ... }]
 *
 * @param attachments - Raw attachments data from database (JSON string or parsed value)
 * @returns Array of normalized TicketAttachment objects
 */
export function normalizeAttachments(
  attachments: string | unknown[] | null | undefined
): TicketAttachment[] {
  if (!attachments) {
    return [];
  }

  let parsed: unknown[];
  if (typeof attachments === "string") {
    try {
      parsed = JSON.parse(attachments);
    } catch {
      return [];
    }
  } else {
    parsed = attachments;
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.map((item, index) => {
    // Legacy format: just a filename string
    if (typeof item === "string") {
      return {
        id: `legacy-${index}-${item}`,
        filename: item,
        type: "reference" as AttachmentType,
        priority: "primary" as AttachmentPriority,
        uploadedBy: "human" as AttachmentUploader,
        uploadedAt: new Date().toISOString(),
      };
    }

    // New format: object with metadata
    if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;

      // Build the base attachment object
      const attachment: TicketAttachment = {
        id: (typeof obj.id === "string" ? obj.id : `generated-${index}`) as string,
        filename: (typeof obj.filename === "string" ? obj.filename : "unknown") as string,
        type: isValidAttachmentType(obj.type) ? obj.type : "reference",
        priority: isValidAttachmentPriority(obj.priority) ? obj.priority : "primary",
        uploadedBy: isValidAttachmentUploader(obj.uploadedBy) ? obj.uploadedBy : "human",
        uploadedAt: typeof obj.uploadedAt === "string" ? obj.uploadedAt : new Date().toISOString(),
      };

      // Only add optional properties if they have values (for exactOptionalPropertyTypes)
      if (typeof obj.description === "string") {
        attachment.description = obj.description;
      }
      if (Array.isArray(obj.linkedCriteria)) {
        const filtered = obj.linkedCriteria.filter((c): c is string => typeof c === "string");
        if (filtered.length > 0) {
          attachment.linkedCriteria = filtered;
        }
      }

      return attachment;
    }

    // Fallback for unexpected data
    return {
      id: `unknown-${index}`,
      filename: "unknown",
      type: "reference" as AttachmentType,
      priority: "primary" as AttachmentPriority,
      uploadedBy: "human" as AttachmentUploader,
      uploadedAt: new Date().toISOString(),
    };
  });
}

/**
 * Serialize attachments to JSON string for database storage.
 * Always stores in the new object format.
 */
export function serializeAttachments(attachments: TicketAttachment[]): string {
  return JSON.stringify(attachments);
}
