/**
 * Attachment loading utilities for Brain Dump MCP server.
 * Handles loading and formatting ticket attachments as MCP content blocks.
 * @module lib/attachment-loader
 */
import { readFileSync } from "fs";
import { log } from "./logging.js";
import {
  getAttachmentsDirPath,
  MAX_ATTACHMENT_INLINE_SIZE,
  RECOMMENDED_ATTACHMENT_INLINE_SIZE,
  resolveTicketAttachmentFiles,
  type ResolvedTicketAttachment,
} from "../../core/attachments-read.ts";
import {
  ATTACHMENT_TYPE_CONFIG,
  FILE_TYPES,
  formatFileSize,
  normalizeAttachments,
} from "./attachment-types.js";

// ============================================
// Type Definitions
// ============================================

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
 * Maximum file size for attachments to include in MCP response.
 * Files larger than this will be skipped with a warning.
 * Sourced from the core read model so all surfaces share one cap.
 */
export const MAX_ATTACHMENT_SIZE = MAX_ATTACHMENT_INLINE_SIZE;

/**
 * MCP spec recommends content under 1MB for reliable processing.
 * Files above this threshold will trigger a warning but still be included if under MAX_ATTACHMENT_SIZE.
 */
export const RECOMMENDED_ATTACHMENT_SIZE = RECOMMENDED_ATTACHMENT_INLINE_SIZE;

// ============================================
// Main Functions
// ============================================

/**
 * Get the attachments directory path.
 * Uses the shared XDG data directory used by core attachment writes.
 */
export function getAttachmentsDir(): string {
  return getAttachmentsDirPath();
}

/**
 * Build the MCP content block for an attachment the core read model resolved
 * as readable. Presentation-only: normalization, safety, and size checks all
 * happen in core/attachments-read.ts.
 */
export function loadSingleAttachment(resolved: ResolvedTicketAttachment): ContentBlock {
  const { filename, mimeType, contentType } = resolved;
  const filePath = resolved.filePath!;
  const sizeStr = formatFileSize(resolved.sizeBytes ?? 0);

  switch (contentType) {
    case "image": {
      const base64Data = readFileSync(filePath).toString("base64");
      log.info(`Loaded image attachment: ${filename} (${sizeStr})`);
      return { type: "image", data: base64Data, mimeType };
    }
    case "text": {
      const textContent = readFileSync(filePath, "utf-8");
      const ext = filename.split(".").pop()?.toLowerCase() ?? "";
      const fence = FILE_TYPES[ext]?.fence ?? "";
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

  // Shared read model: canonical normalization, filename safety, missing-file
  // and size handling all live in core so surfaces cannot drift.
  const model = resolveTicketAttachmentFiles(ticketId, normalizeAttachments(attachmentsList), {
    maxInlineSizeBytes: MAX_ATTACHMENT_SIZE,
    recommendedInlineSizeBytes: RECOMMENDED_ATTACHMENT_SIZE,
  });
  telemetry.totalCount = model.attachments.length;
  warnings.push(...model.warnings);
  for (const warning of model.warnings) {
    log.warn(warning);
  }

  for (const resolved of model.attachments) {
    const { filename, type: attachmentType, description, priority } = resolved;

    if (resolved.fileStatus !== "ok") {
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
      continue;
    }

    try {
      const block = loadSingleAttachment(resolved);
      contentBlocks.push(block);
      telemetry.loadedCount++;
      telemetry.totalSizeBytes += resolved.sizeBytes ?? 0;
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
