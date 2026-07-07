import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { tickets } from "../lib/schema";
import { eq } from "drizzle-orm";
import {
  type AttachmentType,
  type AttachmentPriority,
  type AttachmentUploader,
  normalizeAttachments,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_UPLOAD_SIZE,
  MIME_TYPES,
  IMAGE_EXTENSIONS,
} from "../lib/attachment-types";
import {
  assertUserWritableAttachmentMetadata,
  getAttachmentsDir,
  sanitizeAttachmentFilename,
  uniqueAttachmentFilename,
  writeAttachmentFromBuffer,
} from "../../core/attachments.ts";
import { readTicketAttachments } from "../../core/attachments-read.ts";

const MAX_FILE_SIZE = MAX_ATTACHMENT_UPLOAD_SIZE;

// ALLOWED_MIME_TYPES and MIME_TYPES imported from ../lib/attachment-types

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
    const { readFileSync } = await import("fs");
    const { createLogger } = await import("../lib/logger");
    const logger = createLogger("api:attachments");

    // Shared read model: canonical normalization, filename safety, and
    // missing/oversized warnings. Uploads are capped at MAX_FILE_SIZE, so use
    // the same ceiling for inline reads.
    const model = readTicketAttachments(sqlite, ticketId, {
      includeOrphanedFiles: true,
      maxInlineSizeBytes: MAX_FILE_SIZE,
    });
    for (const warning of model.warnings) {
      logger.warn(`${warning} (ticket ${ticketId})`);
    }

    const attachments: Attachment[] = [];
    for (const resolved of model.attachments) {
      if (resolved.fileStatus !== "ok" || !resolved.filePath) continue;

      const content = readFileSync(resolved.filePath);
      const attachment: Attachment = {
        id: resolved.id,
        filename: resolved.filename,
        size: resolved.sizeBytes ?? content.length,
        isImage: resolved.isImage,
        url: `data:${resolved.mimeType};base64,${content.toString("base64")}`,
        type: resolved.type,
        priority: resolved.priority,
        uploadedBy: resolved.uploadedBy,
        uploadedAt: resolved.uploadedAt,
      };

      // Only add optional properties if they have values (for exactOptionalPropertyTypes)
      if (resolved.description) {
        attachment.description = resolved.description;
      }
      if (resolved.linkedCriteria && resolved.linkedCriteria.length > 0) {
        attachment.linkedCriteria = resolved.linkedCriteria;
      }

      attachments.push(attachment);
    }

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

      assertUserWritableAttachmentMetadata({ type, uploadedBy });

      const attachmentMetadata = writeAttachmentFromBuffer(sqlite, {
        ticketId,
        filename,
        buffer,
        metadata: {
          type: type ?? "reference",
          priority: priority ?? "primary",
          uploadedBy: uploadedBy ?? "human",
          ...(description ? { description } : {}),
        },
      });

      const ext = attachmentMetadata.filename.split(".").pop()?.toLowerCase() ?? "";
      const isImage = (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
      const mimeType = MIME_TYPES[ext] ?? "application/octet-stream";

      const result: Attachment = {
        id: attachmentMetadata.id,
        filename: attachmentMetadata.filename,
        size: buffer.length,
        isImage,
        url: `data:${mimeType};base64,${buffer.toString("base64")}`,
        type: attachmentMetadata.type as AttachmentType,
        priority: attachmentMetadata.priority as AttachmentPriority,
        uploadedBy: attachmentMetadata.uploadedBy as AttachmentUploader,
        uploadedAt: attachmentMetadata.uploadedAt,
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

      assertUserWritableAttachmentMetadata({ type, uploadedBy });

      const baseDir = getAttachmentsDir();
      const ticketDir = join(baseDir, ticketId);
      if (!existsSync(ticketDir)) {
        mkdirSync(ticketDir, { recursive: true });
      }

      const finalFilename = uniqueAttachmentFilename(
        ticketDir,
        sanitizeAttachmentFilename(filename)
      );

      writeFileSync(join(ticketDir, finalFilename), buffer);

      const ext = finalFilename.split(".").pop()?.toLowerCase() ?? "";
      const isImage = (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
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

    const baseDir = getAttachmentsDir();
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

    const baseDir = getAttachmentsDir();
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

    const baseDir = getAttachmentsDir();
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
