import { randomUUID } from "crypto";
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "fs";
import { basename, join } from "path";
import { getDataDir } from "./db.ts";
import { TicketNotFoundError, ValidationError } from "./errors.ts";
import type { DbHandle } from "./types.ts";
import {
  createProviderRalphUploader,
  isRunnerEvidenceAttachmentType,
  normalizeAttachments,
  normalizeAttachmentUploader,
  serializeAttachments,
  type AttachmentPriority,
  type AttachmentProvider,
  type AttachmentType,
  type AttachmentUploader,
  type TicketAttachment,
} from "./attachment-types.ts";

export interface AttachmentWriteMetadata {
  filename?: string | undefined;
  type?: AttachmentType | undefined;
  description?: string | undefined;
  priority?: AttachmentPriority | undefined;
  uploadedBy?: AttachmentUploader | undefined;
  provider?: AttachmentProvider | string | undefined;
  linkedCriteria?: string[] | undefined;
}

export interface WriteAttachmentFromFileParams {
  ticketId: string;
  filePath: string;
  metadata?: AttachmentWriteMetadata | undefined;
}

export interface WriteAttachmentFromBufferParams {
  ticketId: string;
  filename: string;
  buffer: Buffer;
  metadata?: AttachmentWriteMetadata | undefined;
}

interface TicketAttachmentRow {
  id: string;
  attachments: string | null;
}

export function getAttachmentsDir(): string {
  const dir = join(getDataDir(), "attachments");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function assertUserWritableAttachmentMetadata(
  metadata: Pick<AttachmentWriteMetadata, "type" | "uploadedBy"> | undefined
): void {
  if (!metadata) return;
  if (isRunnerEvidenceAttachmentType(metadata.type)) {
    throw new ValidationError(
      "Verification evidence attachment types are runner-only and cannot be uploaded manually."
    );
  }
  if (metadata.uploadedBy !== undefined) {
    const uploader = normalizeAttachmentUploader(metadata.uploadedBy);
    if (uploader !== "human") {
      throw new ValidationError(
        "Attachment uploader attribution is server-controlled for agent and verification uploads."
      );
    }
  }
}

function getTicketAttachmentRow(db: DbHandle, ticketId: string): TicketAttachmentRow {
  const row = db.prepare("SELECT id, attachments FROM tickets WHERE id = ?").get(ticketId) as
    | TicketAttachmentRow
    | undefined;
  if (!row) throw new TicketNotFoundError(ticketId);
  return row;
}

function sanitizeFilename(filename: string): string {
  const sanitized = basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new ValidationError("Attachment filename is invalid after sanitization.");
  }
  return sanitized;
}

function uniqueFilename(ticketDir: string, filename: string): string {
  const sanitized = sanitizeFilename(filename);
  let finalFilename = sanitized;
  let counter = 1;
  while (existsSync(join(ticketDir, finalFilename))) {
    const extIdx = sanitized.lastIndexOf(".");
    finalFilename =
      extIdx > 0
        ? `${sanitized.slice(0, extIdx)}_${counter}${sanitized.slice(extIdx)}`
        : `${sanitized}_${counter}`;
    counter++;
  }
  return finalFilename;
}

function resolveUploader(metadata: AttachmentWriteMetadata | undefined): AttachmentUploader {
  if (metadata?.uploadedBy) return normalizeAttachmentUploader(metadata.uploadedBy);
  if (metadata?.provider) return createProviderRalphUploader(metadata.provider);
  return "human";
}

function appendAttachment(
  db: DbHandle,
  ticketId: string,
  metadata: AttachmentWriteMetadata | undefined,
  finalFilename: string
): TicketAttachment {
  const ticket = getTicketAttachmentRow(db, ticketId);
  const attachments = normalizeAttachments(ticket.attachments);
  const attachment: TicketAttachment = {
    id: randomUUID(),
    filename: finalFilename,
    type: metadata?.type ?? "reference",
    priority: metadata?.priority ?? "primary",
    uploadedBy: resolveUploader(metadata),
    uploadedAt: new Date().toISOString(),
  };
  if (metadata?.description) attachment.description = metadata.description;
  if (metadata?.linkedCriteria && metadata.linkedCriteria.length > 0) {
    attachment.linkedCriteria = metadata.linkedCriteria;
  }

  attachments.push(attachment);
  db.prepare("UPDATE tickets SET attachments = ?, updated_at = ? WHERE id = ?").run(
    serializeAttachments(attachments),
    new Date().toISOString(),
    ticketId
  );
  return attachment;
}

function ensureTicketDir(ticketId: string): string {
  const ticketDir = join(getAttachmentsDir(), ticketId);
  if (!existsSync(ticketDir)) mkdirSync(ticketDir, { recursive: true, mode: 0o700 });
  return ticketDir;
}

export function writeAttachmentFromFile(
  db: DbHandle,
  params: WriteAttachmentFromFileParams
): TicketAttachment {
  getTicketAttachmentRow(db, params.ticketId);
  const stats = statSync(params.filePath);
  if (!stats.isFile())
    throw new ValidationError(`Attachment source is not a file: ${params.filePath}`);

  const ticketDir = ensureTicketDir(params.ticketId);
  const finalFilename = uniqueFilename(
    ticketDir,
    params.metadata?.filename ?? basename(params.filePath)
  );
  copyFileSync(params.filePath, join(ticketDir, finalFilename));
  return appendAttachment(db, params.ticketId, params.metadata, finalFilename);
}

export function writeAttachmentFromBuffer(
  db: DbHandle,
  params: WriteAttachmentFromBufferParams
): TicketAttachment {
  getTicketAttachmentRow(db, params.ticketId);
  const ticketDir = ensureTicketDir(params.ticketId);
  const finalFilename = uniqueFilename(ticketDir, params.metadata?.filename ?? params.filename);
  writeFileSync(join(ticketDir, finalFilename), params.buffer, { mode: 0o600 });
  return appendAttachment(db, params.ticketId, params.metadata, finalFilename);
}
