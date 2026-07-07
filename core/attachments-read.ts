/**
 * Read model for ticket attachments and verification evidence.
 *
 * Every surface that presents attachments (UI server functions, CLI output,
 * MCP context loading) resolves metadata and files through this module so
 * normalization, filename safety, size limits, and warning behavior cannot
 * drift between adapters. This module is strictly read-only: it never writes
 * ticket rows, attachment files, or verification state.
 */

import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { getDataDir } from "./db.ts";
import type { DbHandle } from "./types.ts";
import {
  FILE_TYPES,
  formatFileSize,
  isSafeAttachmentFilename,
  MAX_ATTACHMENT_INLINE_SIZE,
  normalizeAttachments,
  RECOMMENDED_ATTACHMENT_INLINE_SIZE,
  type FileContentType,
  type TicketAttachment,
} from "./attachment-types.ts";

export {
  MAX_ATTACHMENT_UPLOAD_SIZE,
  MAX_ATTACHMENT_INLINE_SIZE,
  RECOMMENDED_ATTACHMENT_INLINE_SIZE,
} from "./attachment-types.ts";

export type AttachmentFileStatus =
  | "ok"
  | "missing"
  | "oversized"
  | "unsafe-filename"
  | "unreadable";

export interface ResolvedTicketAttachment extends TicketAttachment {
  /** Whether the underlying file can be read, and if not, why. */
  fileStatus: AttachmentFileStatus;
  /** Absolute file path when the file exists on disk, otherwise null. */
  filePath: string | null;
  /** File size in bytes when the file exists on disk, otherwise null. */
  sizeBytes: number | null;
  mimeType: string;
  contentType: FileContentType;
  isImage: boolean;
  /** True when the file exists on disk without a metadata record. */
  orphaned: boolean;
  /** Human-readable warnings for this attachment (empty when clean). */
  warnings: string[];
}

export interface TicketAttachmentReadModel {
  attachments: ResolvedTicketAttachment[];
  /** All warnings across the read (directory-level plus per-attachment). */
  warnings: string[];
}

export interface ResolveTicketAttachmentOptions {
  /** Inline read cap; files above it resolve as "oversized". Default 5MB. */
  maxInlineSizeBytes?: number;
  /** Soft warning threshold for large-but-loadable files. Default 1MB. */
  recommendedInlineSizeBytes?: number;
  /** Also surface files on disk that have no metadata record. Default false. */
  includeOrphanedFiles?: boolean;
}

/** Attachments base directory without the write-side mkdir side effect. */
export function getAttachmentsDirPath(): string {
  return join(getDataDir(), "attachments");
}

export function getTicketAttachmentsDirPath(ticketId: string): string {
  return join(getAttachmentsDirPath(), ticketId);
}

function fileTypeInfo(filename: string): {
  mimeType: string;
  contentType: FileContentType;
  isImage: boolean;
} {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const config = FILE_TYPES[ext];
  const contentType = config?.type ?? "reference";
  return {
    mimeType: config?.mime ?? "application/octet-stream",
    contentType,
    isImage: contentType === "image",
  };
}

function resolveOne(
  ticketDir: string,
  attachment: TicketAttachment,
  orphaned: boolean,
  options: Required<
    Pick<ResolveTicketAttachmentOptions, "maxInlineSizeBytes" | "recommendedInlineSizeBytes">
  >
): ResolvedTicketAttachment {
  const warnings: string[] = [];
  const base: ResolvedTicketAttachment = {
    ...attachment,
    ...fileTypeInfo(attachment.filename),
    fileStatus: "ok",
    filePath: null,
    sizeBytes: null,
    orphaned,
    warnings,
  };
  if (orphaned) {
    warnings.push(`Attachment file has no metadata record: ${attachment.filename}`);
  }

  if (!isSafeAttachmentFilename(attachment.filename)) {
    warnings.push(`Skipped unsafe attachment filename: ${attachment.filename}`);
    return { ...base, fileStatus: "unsafe-filename" };
  }

  const filePath = join(ticketDir, attachment.filename);
  if (!existsSync(filePath)) {
    warnings.push(`Attachment file missing on disk: ${attachment.filename}`);
    return { ...base, fileStatus: "missing" };
  }

  let sizeBytes: number;
  try {
    sizeBytes = statSync(filePath).size;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Attachment file unreadable: ${attachment.filename} (${message})`);
    return { ...base, fileStatus: "unreadable", filePath };
  }

  if (sizeBytes > options.maxInlineSizeBytes) {
    warnings.push(
      `Attachment ${attachment.filename} (${formatFileSize(sizeBytes)}) exceeds the ` +
        `${formatFileSize(options.maxInlineSizeBytes)} inline read limit`
    );
    return { ...base, fileStatus: "oversized", filePath, sizeBytes };
  }

  if (sizeBytes > options.recommendedInlineSizeBytes) {
    warnings.push(
      `Attachment ${attachment.filename} is ${formatFileSize(sizeBytes)} - large files ` +
        `may not be processed reliably by all clients`
    );
  }

  return { ...base, filePath, sizeBytes };
}

/**
 * Resolve already-normalized attachment metadata against the files on disk.
 * Never throws for missing/oversized/corrupt entries; problems surface as
 * per-attachment `fileStatus` plus warnings.
 */
export function resolveTicketAttachmentFiles(
  ticketId: string,
  attachments: TicketAttachment[],
  options: ResolveTicketAttachmentOptions = {}
): TicketAttachmentReadModel {
  const sizeOptions = {
    maxInlineSizeBytes: options.maxInlineSizeBytes ?? MAX_ATTACHMENT_INLINE_SIZE,
    recommendedInlineSizeBytes:
      options.recommendedInlineSizeBytes ?? RECOMMENDED_ATTACHMENT_INLINE_SIZE,
  };
  const ticketDir = getTicketAttachmentsDirPath(ticketId);
  const warnings: string[] = [];
  const resolved: ResolvedTicketAttachment[] = [];

  const dirExists = existsSync(ticketDir);
  if (!dirExists && attachments.length > 0) {
    warnings.push(`Attachments directory not found: ${ticketDir}`);
  }

  for (const attachment of attachments) {
    const entry = dirExists
      ? resolveOne(ticketDir, attachment, false, sizeOptions)
      : {
          ...attachment,
          ...fileTypeInfo(attachment.filename),
          fileStatus: "missing" as const,
          filePath: null,
          sizeBytes: null,
          orphaned: false,
          warnings: [`Attachment file missing on disk: ${attachment.filename}`],
        };
    resolved.push(entry);
    warnings.push(...entry.warnings);
  }

  if (options.includeOrphanedFiles && dirExists) {
    const known = new Set(attachments.map((attachment) => attachment.filename));
    for (const filename of readdirSync(ticketDir)) {
      if (known.has(filename)) continue;
      let uploadedAt = new Date().toISOString();
      try {
        uploadedAt = statSync(join(ticketDir, filename)).mtime.toISOString();
      } catch {
        // fall through to the unreadable status from resolveOne below
      }
      const entry = resolveOne(
        ticketDir,
        {
          id: filename,
          filename,
          type: "reference",
          priority: "primary",
          uploadedBy: "human",
          uploadedAt,
        },
        true,
        sizeOptions
      );
      resolved.push(entry);
      warnings.push(...entry.warnings);
    }
  }

  return { attachments: resolved, warnings };
}

/**
 * Read a ticket's attachments straight from the database using the canonical
 * normalization, then resolve them against the files on disk.
 *
 * Tolerant by design: a missing ticket row produces a loud warning (and an
 * orphan-only scan when requested) instead of an exception, so audit surfaces
 * keep rendering whatever evidence still exists.
 */
export function readTicketAttachments(
  db: DbHandle,
  ticketId: string,
  options: ResolveTicketAttachmentOptions = {}
): TicketAttachmentReadModel {
  const row = db.prepare("SELECT attachments FROM tickets WHERE id = ?").get(ticketId) as
    | { attachments: string | null }
    | undefined;

  const model = resolveTicketAttachmentFiles(
    ticketId,
    row ? normalizeAttachments(row.attachments) : [],
    options
  );
  if (!row) {
    model.warnings.unshift(`Ticket not found in database: ${ticketId}`);
  }
  return model;
}
