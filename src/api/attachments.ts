import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { tickets } from "../lib/schema";
import { eq } from "drizzle-orm";
import {
  type TicketAttachment,
  type AttachmentType,
  type AttachmentPriority,
  type AttachmentUploader,
  normalizeAttachments,
} from "../lib/attachment-types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed MIME types and their extensions (whitelist for security)
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
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

const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
};

// Validate that the MIME type from data URL matches the file extension
function validateMimeType(dataUrl: string, filename: string): void {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // Extract MIME type from data URL
  const mimeMatch = dataUrl.match(/^data:([^;,]+)/);
  if (!mimeMatch) {
    throw new Error("Invalid data URL format");
  }

  const dataMimeType = mimeMatch[1];
  if (!dataMimeType) {
    throw new Error("Could not extract MIME type from data URL");
  }

  // Check if MIME type is allowed
  const allowedExtensions = ALLOWED_MIME_TYPES[dataMimeType as keyof typeof ALLOWED_MIME_TYPES];
  if (!allowedExtensions) {
    throw new Error(`File type not allowed: ${dataMimeType}`);
  }

  // Check if extension matches the MIME type
  if (!allowedExtensions.includes(ext)) {
    throw new Error(`File extension "${ext}" does not match content type "${dataMimeType}"`);
  }
}

// Lazy initialization for server-only file operations
let attachmentsDir: string | null = null;

async function getAttachmentsDir(): Promise<string> {
  if (attachmentsDir) return attachmentsDir;

  const { join } = await import("path");
  const { homedir } = await import("os");
  const { existsSync, mkdirSync } = await import("fs");

  attachmentsDir = join(homedir(), ".brain-dump", "attachments");

  if (!existsSync(attachmentsDir)) {
    mkdirSync(attachmentsDir, { recursive: true });
  }

  return attachmentsDir;
}

/**
 * Full attachment data returned to clients (includes file data).
 * Extends TicketAttachment metadata with runtime file information.
 */
export interface Attachment {
  id: string;
  filename: string;
  size: number;
  isImage: boolean;
  url: string;
  /** Attachment type (mockup, bug-screenshot, etc.) */
  type: AttachmentType;
  /** Human-provided description */
  description?: string;
  /** Priority level */
  priority: AttachmentPriority;
  /** Who uploaded the attachment */
  uploadedBy: AttachmentUploader;
  /** When the attachment was uploaded */
  uploadedAt: string;
  /** Linked acceptance criteria IDs */
  linkedCriteria?: string[];
}

// Get attachments for a ticket
export const getAttachments = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => ticketId)
  .handler(async ({ data: ticketId }) => {
    const { join } = await import("path");
    const { existsSync, readdirSync, statSync, readFileSync } = await import("fs");

    // Get ticket to read attachment metadata from database
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();

    const baseDir = await getAttachmentsDir();
    const ticketDir = join(baseDir, ticketId);

    if (!existsSync(ticketDir)) {
      return [];
    }

    // Get metadata from database (normalized to handle legacy string format)
    const storedAttachments = normalizeAttachments(ticket?.attachments);

    // Create a map for quick lookup of metadata by filename
    const metadataMap = new Map<string, TicketAttachment>();
    for (const attachment of storedAttachments) {
      metadataMap.set(attachment.filename, attachment);
    }

    const files = readdirSync(ticketDir);
    const attachments: Attachment[] = files.map((filename) => {
      const filePath = join(ticketDir, filename);
      const stats = statSync(filePath);
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);

      // Read file and create data URL
      const content = readFileSync(filePath);
      const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";
      const dataUrl = `data:${mimeType};base64,${content.toString("base64")}`;

      // Get stored metadata or use defaults
      const metadata = metadataMap.get(filename);

      const attachment: Attachment = {
        id: metadata?.id ?? filename,
        filename,
        size: stats.size,
        isImage,
        url: dataUrl,
        type: metadata?.type ?? "reference",
        priority: metadata?.priority ?? "primary",
        uploadedBy: metadata?.uploadedBy ?? "human",
        uploadedAt: metadata?.uploadedAt ?? new Date().toISOString(),
      };

      // Only add optional properties if they have values (for exactOptionalPropertyTypes)
      if (metadata?.description) {
        attachment.description = metadata.description;
      }
      if (metadata?.linkedCriteria && metadata.linkedCriteria.length > 0) {
        attachment.linkedCriteria = metadata.linkedCriteria;
      }

      return attachment;
    });

    return attachments;
  });

/** Input type for uploadAttachment including optional metadata */
interface UploadAttachmentInput {
  ticketId: string;
  filename: string;
  data: string;
  /** Attachment type for AI context */
  type?: AttachmentType;
  /** Human-provided description */
  description?: string;
  /** Importance level */
  priority?: AttachmentPriority;
  /** Who is uploading */
  uploadedBy?: AttachmentUploader;
}

// Upload attachment
export const uploadAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: UploadAttachmentInput) => {
    if (!input.ticketId) {
      throw new Error("Ticket ID is required");
    }
    if (!input.filename) {
      throw new Error("Filename is required");
    }
    if (!input.data) {
      throw new Error("File data is required");
    }
    return input;
  })
  .handler(
    async ({ data: { ticketId, filename, data, type, description, priority, uploadedBy } }) => {
      const { join } = await import("path");
      const { existsSync, mkdirSync, writeFileSync } = await import("fs");
      const { randomUUID } = await import("crypto");

      // Verify ticket exists
      const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
      if (!ticket) {
        throw new Error(`Ticket not found: ${ticketId}`);
      }

      // Validate MIME type matches file extension (security check)
      validateMimeType(data, filename);

      // Decode base64 data
      const base64Data = data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      // Check file size
      if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum allowed size of 10MB`);
      }

      // Ensure ticket directory exists
      const baseDir = await getAttachmentsDir();
      const ticketDir = join(baseDir, ticketId);
      if (!existsSync(ticketDir)) {
        mkdirSync(ticketDir, { recursive: true });
      }

      // Sanitize filename
      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

      // Handle duplicate filenames
      let finalFilename = sanitizedFilename;
      let counter = 1;
      while (existsSync(join(ticketDir, finalFilename))) {
        const extIdx = sanitizedFilename.lastIndexOf(".");
        if (extIdx > 0) {
          finalFilename = `${sanitizedFilename.slice(0, extIdx)}_${counter}${sanitizedFilename.slice(extIdx)}`;
        } else {
          finalFilename = `${sanitizedFilename}_${counter}`;
        }
        counter++;
      }

      // Write file
      const filePath = join(ticketDir, finalFilename);
      writeFileSync(filePath, buffer);

      // Create attachment metadata object
      const attachmentId = randomUUID();
      const now = new Date().toISOString();
      const attachmentMetadata = {
        id: attachmentId,
        filename: finalFilename,
        type: type ?? "reference",
        priority: priority ?? "primary",
        uploadedBy: uploadedBy ?? "human",
        uploadedAt: now,
        ...(description ? { description } : {}),
      };

      // Update ticket's attachments JSON field with new metadata format
      const currentAttachments = normalizeAttachments(ticket.attachments);
      currentAttachments.push(attachmentMetadata);
      db.update(tickets)
        .set({ attachments: JSON.stringify(currentAttachments) })
        .where(eq(tickets.id, ticketId))
        .run();

      const ext = finalFilename.split(".").pop()?.toLowerCase() ?? "";
      const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
      const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

      const result: Attachment = {
        id: attachmentId,
        filename: finalFilename,
        size: buffer.length,
        isImage,
        url: `data:${mimeType};base64,${buffer.toString("base64")}`,
        type: attachmentMetadata.type as AttachmentType,
        priority: attachmentMetadata.priority as AttachmentPriority,
        uploadedBy: attachmentMetadata.uploadedBy as AttachmentUploader,
        uploadedAt: now,
      };

      if (description) {
        result.description = description;
      }

      return result;
    }
  );

/** Input type for uploadPendingAttachment including optional metadata */
interface UploadPendingAttachmentInput {
  ticketId: string;
  filename: string;
  data: string;
  /** Attachment type for AI context */
  type?: AttachmentType;
  /** Human-provided description */
  description?: string;
  /** Importance level */
  priority?: AttachmentPriority;
  /** Who is uploading */
  uploadedBy?: AttachmentUploader;
}

// Upload attachment for a pending (not-yet-created) ticket
export const uploadPendingAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: UploadPendingAttachmentInput) => {
    if (!input.ticketId) throw new Error("Ticket ID is required");
    if (!input.filename) throw new Error("Filename is required");
    if (!input.data) throw new Error("File data is required");
    return input;
  })
  .handler(
    async ({ data: { ticketId, filename, data, type, description, priority, uploadedBy } }) => {
      const { join } = await import("path");
      const { existsSync, mkdirSync, writeFileSync } = await import("fs");
      const { randomUUID } = await import("crypto");

      validateMimeType(data, filename);

      const base64Data = data.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");

      if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum allowed size of 10MB`);
      }

      const baseDir = await getAttachmentsDir();
      const ticketDir = join(baseDir, ticketId);
      if (!existsSync(ticketDir)) {
        mkdirSync(ticketDir, { recursive: true });
      }

      const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

      let finalFilename = sanitizedFilename;
      let counter = 1;
      while (existsSync(join(ticketDir, finalFilename))) {
        const extIdx = sanitizedFilename.lastIndexOf(".");
        if (extIdx > 0) {
          finalFilename = `${sanitizedFilename.slice(0, extIdx)}_${counter}${sanitizedFilename.slice(extIdx)}`;
        } else {
          finalFilename = `${sanitizedFilename}_${counter}`;
        }
        counter++;
      }

      writeFileSync(join(ticketDir, finalFilename), buffer);

      const ext = finalFilename.split(".").pop()?.toLowerCase() ?? "";
      const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
      const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

      const attachmentId = randomUUID();
      const now = new Date().toISOString();

      const result: Attachment = {
        id: attachmentId,
        filename: finalFilename,
        size: buffer.length,
        isImage,
        url: `data:${mimeType};base64,${buffer.toString("base64")}`,
        type: type ?? "reference",
        priority: priority ?? "primary",
        uploadedBy: uploadedBy ?? "human",
        uploadedAt: now,
      };

      if (description) {
        result.description = description;
      }

      return result;
    }
  );

// Delete all pending attachments for a ticket that was never created
export const deletePendingAttachments = createServerFn({ method: "POST" })
  .inputValidator((ticketId: string) => {
    if (!ticketId) throw new Error("Ticket ID is required");
    return ticketId;
  })
  .handler(async ({ data: ticketId }) => {
    const { join } = await import("path");
    const { existsSync, readdirSync, unlinkSync, rmdirSync } = await import("fs");

    const baseDir = await getAttachmentsDir();
    const ticketDir = join(baseDir, ticketId);

    if (!existsSync(ticketDir)) {
      return { success: true, deletedCount: 0 };
    }

    const files = readdirSync(ticketDir);
    for (const file of files) {
      unlinkSync(join(ticketDir, file));
    }
    rmdirSync(ticketDir);

    return { success: true, deletedCount: files.length };
  });

// Delete a single pending attachment
export const deletePendingAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: { ticketId: string; filename: string }) => {
    if (!input.ticketId) throw new Error("Ticket ID is required");
    if (!input.filename) throw new Error("Filename is required");
    return input;
  })
  .handler(async ({ data: { ticketId, filename } }) => {
    const { join } = await import("path");
    const { existsSync, unlinkSync, readdirSync, rmdirSync } = await import("fs");

    const baseDir = await getAttachmentsDir();
    const filePath = join(baseDir, ticketId, filename);

    if (!existsSync(filePath)) {
      throw new Error(`Attachment not found: ${filename}`);
    }

    unlinkSync(filePath);

    const ticketDir = join(baseDir, ticketId);
    const remainingFiles = readdirSync(ticketDir);
    if (remainingFiles.length === 0) {
      rmdirSync(ticketDir);
    }

    return { success: true, deletedFilename: filename };
  });

// Delete attachment
export const deleteAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: { ticketId: string; filename: string }) => {
    if (!input.ticketId) {
      throw new Error("Ticket ID is required");
    }
    if (!input.filename) {
      throw new Error("Filename is required");
    }
    return input;
  })
  .handler(async ({ data: { ticketId, filename } }) => {
    const { join } = await import("path");
    const { existsSync, unlinkSync } = await import("fs");

    // Verify ticket exists
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    const baseDir = await getAttachmentsDir();
    const filePath = join(baseDir, ticketId, filename);

    if (!existsSync(filePath)) {
      throw new Error(`Attachment not found: ${filename}`);
    }

    // Delete file
    unlinkSync(filePath);

    // Update ticket's attachments JSON field (using normalized format)
    const currentAttachments = normalizeAttachments(ticket.attachments);
    const updatedAttachments = currentAttachments.filter((a) => a.filename !== filename);
    db.update(tickets)
      .set({ attachments: JSON.stringify(updatedAttachments) })
      .where(eq(tickets.id, ticketId))
      .run();

    return { success: true, deletedFilename: filename };
  });
