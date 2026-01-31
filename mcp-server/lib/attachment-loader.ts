/**
 * Attachment loading utilities for Brain Dump MCP server.
 * Handles loading and formatting ticket attachments as MCP content blocks.
 * @module lib/attachment-loader
 */
import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { log } from "./logging.js";
import { FILE_TYPES, ATTACHMENT_TYPE_CONFIG, formatFileSize } from "./attachment-types.js";

// ============================================
// Type Definitions
// ============================================

/** Normalized attachment object from database */
interface NormalizedAttachment {
  id: string;
  filename: string;
  type: string;
  description?: string | undefined;
  priority: string;
  linkedCriteria?: string[] | undefined;
  uploadedBy: string;
  uploadedAt: string;
}

/** MCP content block for text or image */
interface ContentBlock {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Telemetry data collected during attachment loading */
interface AttachmentTelemetry {
  totalCount: number;
  loadedCount: number;
  failedCount: number;
  imageCount: number;
  totalSizeBytes: number;
  filenames: string[];
  failedFiles: string[];
  attachments: Array<{
    filename: string;
    type: string;
    description?: string;
    priority: string;
  }>;
  byType: Record<string, number>;
}

/** Result from loading ticket attachments */
interface LoadAttachmentsResult {
  contentBlocks: ContentBlock[];
  warnings: string[];
  telemetry: AttachmentTelemetry;
}

// ============================================
// Constants
// ============================================

/**
 * Maximum file size for attachments to include in MCP response (5MB).
 * Files larger than this will be skipped with a warning.
 */
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

/**
 * MCP spec recommends content under 1MB for reliable processing.
 * Files above this threshold will trigger a warning but still be included if under MAX_ATTACHMENT_SIZE.
 */
export const RECOMMENDED_ATTACHMENT_SIZE = 1 * 1024 * 1024;

// ============================================
// Main Functions
// ============================================

/**
 * Normalize attachment data from the database.
 * Handles both legacy string format and new object format.
 */
export function normalizeAttachment(item: unknown, index: number): NormalizedAttachment {
  // Legacy format: just a filename string
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

  // New format: object with metadata
  if (item && typeof item === "object" && item !== null) {
    const obj = item as Record<string, unknown>;
    return {
      id: (obj.id as string) ?? `generated-${index}`,
      filename: (obj.filename as string) ?? "unknown",
      type: (obj.type as string) ?? "reference",
      description: obj.description as string | undefined,
      priority: (obj.priority as string) ?? "primary",
      linkedCriteria: obj.linkedCriteria as string[] | undefined,
      uploadedBy: (obj.uploadedBy as string) ?? "human",
      uploadedAt: (obj.uploadedAt as string) ?? new Date().toISOString(),
    };
  }

  // Fallback for unexpected data - log warning to surface data corruption
  log.warn(`Unexpected attachment data at index ${index}: ${typeof item}`);
  return {
    id: `unknown-${index}`,
    filename: "unknown",
    type: "reference",
    priority: "primary",
    uploadedBy: "human",
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Get the attachments directory path.
 * Uses legacy path (~/.brain-dump) to match src/api/attachments.ts for consistency.
 * TODO: Migrate both to XDG-compliant paths (see docs/data-locations.md)
 */
export function getAttachmentsDir(): string {
  return join(homedir(), ".brain-dump", "attachments");
}

/**
 * Load a single attachment and return its content block.
 */
export function loadSingleAttachment(
  filePath: string,
  filename: string,
  size: number
): ContentBlock {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const fileConfig = FILE_TYPES[ext as keyof typeof FILE_TYPES];
  const mimeType = fileConfig?.mime || "application/octet-stream";
  const contentType = fileConfig?.type || "reference";
  const sizeStr = formatFileSize(size);

  switch (contentType) {
    case "image": {
      const base64Data = readFileSync(filePath).toString("base64");
      log.info(`Loaded image attachment: ${filename} (${sizeStr})`);
      return { type: "image", data: base64Data, mimeType };
    }
    case "text": {
      const textContent = readFileSync(filePath, "utf-8");
      const fence = (fileConfig as Record<string, unknown> | undefined)?.fence || "";
      log.info(`Loaded text attachment: ${filename} (${sizeStr})`);
      return {
        type: "text",
        text: `### Attachment: ${filename}\n\n\`\`\`${fence}\n${textContent}\n\`\`\``,
      };
    }
    default: {
      log.info(`Referenced attachment: ${filename} (${mimeType})`);
      return {
        type: "text",
        text: `### Attachment: ${filename}\n\n*File attached (${sizeStr}, type: ${mimeType}). Located at: ${filePath}*`,
      };
    }
  }
}

/**
 * Load and format ticket attachments as MCP content blocks.
 * Images are returned as image content blocks with base64 data.
 * Text files (txt, md, json) are returned as text content blocks.
 * PDFs and other files are referenced but not included inline.
 */
export function loadTicketAttachments(
  ticketId: string,
  attachmentsList: unknown[] | null
): LoadAttachmentsResult {
  const contentBlocks: ContentBlock[] = [];
  const warnings: string[] = [];
  const telemetry: AttachmentTelemetry = {
    totalCount: 0,
    loadedCount: 0,
    failedCount: 0,
    imageCount: 0,
    totalSizeBytes: 0,
    filenames: [],
    failedFiles: [],
    attachments: [],
    byType: {},
  };

  if (!attachmentsList || !Array.isArray(attachmentsList) || attachmentsList.length === 0) {
    return { contentBlocks, warnings, telemetry };
  }

  // Normalize all attachments first
  const normalizedAttachments = attachmentsList.map(normalizeAttachment);
  telemetry.totalCount = normalizedAttachments.length;
  const ticketDir = join(getAttachmentsDir(), ticketId);

  if (!existsSync(ticketDir)) {
    warnings.push(`Attachments directory not found: ${ticketDir}`);
    telemetry.failedCount = normalizedAttachments.length;
    telemetry.failedFiles = normalizedAttachments.map((a) => a.filename);
    return { contentBlocks, warnings, telemetry };
  }

  for (const attachment of normalizedAttachments) {
    const { filename, type: attachmentType, description, priority } = attachment;

    // Sanitize filename to prevent path traversal attacks (matches src/api/attachments.ts:171)
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (safeFilename !== filename) {
      warnings.push(`Skipped unsafe filename: ${filename}`);
      log.warn(`Blocked path traversal attempt in attachment: ${filename}`);
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
      continue;
    }
    const filePath = join(ticketDir, safeFilename);

    if (!existsSync(filePath)) {
      warnings.push(`Attachment file not found: ${filename}`);
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
      continue;
    }

    let stats;
    try {
      stats = statSync(filePath);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to stat file ${filename}: ${errorMsg}`);
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
      continue;
    }

    if (stats.size > MAX_ATTACHMENT_SIZE) {
      warnings.push(
        `Skipping ${filename}: File size (${formatFileSize(stats.size)}) exceeds 5MB limit`
      );
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
      continue;
    }

    // Warn about large files that may not be reliably processed
    if (stats.size > RECOMMENDED_ATTACHMENT_SIZE) {
      warnings.push(
        `${filename} is ${formatFileSize(stats.size)} - files over 1MB may not be processed reliably by all AI clients`
      );
    }

    try {
      const block = loadSingleAttachment(filePath, filename, stats.size);
      contentBlocks.push(block);
      telemetry.loadedCount++;
      telemetry.totalSizeBytes += stats.size;
      telemetry.filenames.push(filename);

      // Track attachment metadata for context generation
      telemetry.attachments.push({
        filename,
        type: attachmentType,
        ...(description !== undefined && { description }),
        priority,
      });

      // Count by type
      telemetry.byType[attachmentType] = (telemetry.byType[attachmentType] || 0) + 1;

      if (block.type === "image") {
        telemetry.imageCount++;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to read ${filename}: ${errorMsg}`);
      log.error(
        `Failed to read attachment ${filename}:`,
        err instanceof Error ? err : new Error(String(err))
      );
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
    }
  }

  return { contentBlocks, warnings, telemetry };
}

/**
 * Build type-aware context section for attachments.
 * Generates different instructions based on attachment types.
 */
export function buildAttachmentContextSection(telemetry: AttachmentTelemetry): string {
  if (!telemetry.attachments || telemetry.attachments.length === 0) {
    return "";
  }

  // Group attachments by type
  const byType: Record<string, typeof telemetry.attachments> = {};
  for (const attachment of telemetry.attachments) {
    const type = attachment.type || "reference";
    if (!byType[type]) {
      byType[type] = [];
    }
    byType[type].push(attachment);
  }

  let context = "## ATTACHMENTS\n\n";

  // Check for high-priority design types
  const hasDesignTypes = byType.mockup || byType.wireframe;
  const hasBugTypes =
    byType["bug-screenshot"] || byType["actual-behavior"] || byType["expected-behavior"];

  if (hasDesignTypes) {
    context += `**IMPORTANT: Review attached design images BEFORE implementing.**\n\n`;
  } else if (hasBugTypes) {
    context += `**IMPORTANT: Review attached screenshots to understand the bug.**\n\n`;
  }

  // Build sections for each attachment type (in priority order)
  const typeOrder = [
    "mockup",
    "wireframe",
    "bug-screenshot",
    "expected-behavior",
    "actual-behavior",
    "diagram",
    "error-message",
    "console-log",
    "asset",
    "reference",
  ];

  for (const type of typeOrder) {
    if (!byType[type]) continue;

    const config = ATTACHMENT_TYPE_CONFIG[type as keyof typeof ATTACHMENT_TYPE_CONFIG] || {
      contextHeader: `${type.charAt(0).toUpperCase() + type.slice(1)} Images`,
      aiInstruction: "Use for reference",
    };

    context += `### ${config.contextHeader}\n`;

    for (const attachment of byType[type]) {
      const primaryTag = attachment.priority === "primary" ? " **[PRIMARY]**" : "";
      context += `- **${attachment.filename}**${primaryTag}\n`;
      if (attachment.description) {
        context += `  - "${attachment.description}"\n`;
      }
    }

    context += `\n> ${config.aiInstruction}\n\n`;
  }

  // Add fallback text if any files failed to load
  if (telemetry.failedCount > 0 && telemetry.failedFiles.length > 0) {
    context += `### Failed to Load (${telemetry.failedCount})\n`;
    context += `The following files could not be loaded. Check the ticket UI:\n`;
    for (const filename of telemetry.failedFiles) {
      context += `- ${filename}\n`;
    }
    context += "\n";
  }

  return context;
}
