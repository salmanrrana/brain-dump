/**
 * Workflow tools for Brain Dump MCP server.
 * Handles starting and completing ticket work (includes git branch creation).
 * Smart workflow automation - handles comments, PRD updates, next ticket suggestions,
 * and automatic conversation session management for compliance logging.
 * @module tools/workflow
 */
import { z } from "zod";
import { existsSync, readFileSync, writeFileSync, statSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";
import { homedir } from "os";
import { log } from "../lib/logging.js";
import { runGitCommand, shortId, generateBranchName, generateEpicBranchName } from "../lib/git-utils.js";

/**
 * Maximum file size for attachments to include in MCP response (5MB).
 * Files larger than this will be skipped with a warning.
 */
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

/**
 * MCP spec recommends content under 1MB for reliable processing.
 * Files above this threshold will trigger a warning but still be included if under MAX_ATTACHMENT_SIZE.
 */
const RECOMMENDED_ATTACHMENT_SIZE = 1 * 1024 * 1024;

/**
 * File type configuration for attachments.
 * Each entry defines how to handle a file extension: mime type and content type.
 * - "image": Loaded as base64 MCP image content block
 * - "text": Read as UTF-8 and included inline with code fence
 * - "reference": Not loaded, just referenced by path
 */
const FILE_TYPES = {
  jpg: { mime: "image/jpeg", type: "image" },
  jpeg: { mime: "image/jpeg", type: "image" },
  png: { mime: "image/png", type: "image" },
  gif: { mime: "image/gif", type: "image" },
  webp: { mime: "image/webp", type: "image" },
  svg: { mime: "image/svg+xml", type: "image" },  // Treat as image for consistency with src/api/attachments.ts
  pdf: { mime: "application/pdf", type: "reference" },
  txt: { mime: "text/plain", type: "text", fence: "" },
  md: { mime: "text/markdown", type: "text", fence: "markdown" },
  json: { mime: "application/json", type: "text", fence: "json" },
};

/**
 * Attachment type configuration for AI context generation.
 * Each type has an icon, context header, and AI instruction.
 */
const ATTACHMENT_TYPE_CONFIG = {
  mockup: {
    contextHeader: "Design Mockups (IMPLEMENT TO MATCH)",
    aiInstruction: "Your implementation MUST match this design",
  },
  wireframe: {
    contextHeader: "Wireframes (REFERENCE LAYOUT)",
    aiInstruction: "Follow this layout structure",
  },
  "bug-screenshot": {
    contextHeader: "Bug Screenshots (THIS IS BROKEN)",
    aiInstruction: "This shows what's wrong - fix this behavior",
  },
  "expected-behavior": {
    contextHeader: "Expected Behavior (TARGET STATE)",
    aiInstruction: "Make the behavior match this",
  },
  "actual-behavior": {
    contextHeader: "Actual Behavior (CURRENT BROKEN STATE)",
    aiInstruction: "This is the current broken state to fix",
  },
  diagram: {
    contextHeader: "Diagrams (REFERENCE)",
    aiInstruction: "Use for understanding architecture/flow",
  },
  "error-message": {
    contextHeader: "Error Messages (DEBUG THIS)",
    aiInstruction: "Debug and fix this error",
  },
  "console-log": {
    contextHeader: "Console Output (DEBUG INFO)",
    aiInstruction: "Use this debugging information",
  },
  reference: {
    contextHeader: "Reference Images",
    aiInstruction: "Use for general reference",
  },
  asset: {
    contextHeader: "Assets (USE DIRECTLY)",
    aiInstruction: "Use this image asset directly in the implementation",
  },
};

/**
 * Normalize attachment data from the database.
 * Handles both legacy string format and new object format.
 * @param {unknown} item - Single attachment item (string or object)
 * @param {number} index - Index in the array
 * @returns {{ id: string, filename: string, type: string, description?: string, priority: string, linkedCriteria?: string[], uploadedBy: string, uploadedAt: string }}
 */
function normalizeAttachment(item, index) {
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
  if (item && typeof item === "object") {
    return {
      id: item.id ?? `generated-${index}`,
      filename: item.filename ?? "unknown",
      type: item.type ?? "reference",
      description: item.description,
      priority: item.priority ?? "primary",
      linkedCriteria: item.linkedCriteria,
      uploadedBy: item.uploadedBy ?? "human",
      uploadedAt: item.uploadedAt ?? new Date().toISOString(),
    };
  }

  // Fallback for unexpected data
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
 * Format file size for display.
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted size (e.g., "1.5MB" or "256KB")
 */
function formatFileSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }
  return `${Math.round(bytes / 1024)}KB`;
}

/**
 * Get the attachments directory path.
 * Uses legacy path (~/.brain-dump) to match src/api/attachments.ts for consistency.
 * TODO: Migrate both to XDG-compliant paths (see docs/data-locations.md)
 * @returns {string}
 */
function getAttachmentsDir() {
  return join(homedir(), ".brain-dump", "attachments");
}

/**
 * Load a single attachment and return its content block.
 * @param {string} filePath - Full path to the file
 * @param {string} filename - Original filename for display
 * @param {number} size - File size in bytes
 * @returns {{ type: string, text?: string, data?: string, mimeType?: string }}
 */
function loadSingleAttachment(filePath, filename, size) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const fileConfig = FILE_TYPES[ext];
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
      const fence = fileConfig.fence || "";
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
 *
 * @param {string} ticketId - The ticket ID to load attachments for
 * @param {unknown[] | null} attachmentsList - JSON-parsed list of attachments (strings or objects)
 * @returns {{ contentBlocks: Array<{type: string, text?: string, data?: string, mimeType?: string}>, warnings: string[], telemetry: { totalCount: number, loadedCount: number, failedCount: number, imageCount: number, totalSizeBytes: number, filenames: string[], failedFiles: string[], attachments: Array<{filename: string, type: string, description?: string, priority: string}>, byType: Record<string, number> } }}
 */
function loadTicketAttachments(ticketId, attachmentsList) {
  const contentBlocks = [];
  const warnings = [];
  const telemetry = {
    totalCount: 0,
    loadedCount: 0,
    failedCount: 0,
    imageCount: 0,
    totalSizeBytes: 0,
    filenames: [],
    failedFiles: [],
    attachments: [],  // Normalized attachment objects
    byType: {},       // Count by attachment type
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
    telemetry.failedFiles = normalizedAttachments.map(a => a.filename);
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
    } catch (err) {
      warnings.push(`Failed to stat file ${filename}: ${err.message}`);
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
      continue;
    }

    if (stats.size > MAX_ATTACHMENT_SIZE) {
      warnings.push(`Skipping ${filename}: File size (${formatFileSize(stats.size)}) exceeds 5MB limit`);
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
      continue;
    }

    // Warn about large files that may not be reliably processed
    if (stats.size > RECOMMENDED_ATTACHMENT_SIZE) {
      warnings.push(`${filename} is ${formatFileSize(stats.size)} - files over 1MB may not be processed reliably by all AI clients`);
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
        description,
        priority,
      });

      // Count by type
      telemetry.byType[attachmentType] = (telemetry.byType[attachmentType] || 0) + 1;

      if (block.type === "image") {
        telemetry.imageCount++;
      }
    } catch (err) {
      warnings.push(`Failed to read ${filename}: ${err.message}`);
      log.error(`Failed to read attachment ${filename}:`, err);
      telemetry.failedCount++;
      telemetry.failedFiles.push(filename);
    }
  }

  return { contentBlocks, warnings, telemetry };
}

/**
 * Create a conversation session for compliance logging.
 * Auto-links to project and ticket for context.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @param {string} projectId
 * @param {string} environment
 * @returns {{ success: boolean, sessionId?: string, error?: string }}
 */
function createConversationSession(db, ticketId, projectId, environment) {
  const id = randomUUID();
  const now = new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO conversation_sessions
      (id, project_id, ticket_id, environment, data_classification, started_at, created_at)
      VALUES (?, ?, ?, ?, 'internal', ?, ?)
    `).run(id, projectId, ticketId, environment, now, now);

    log.info(`Auto-created conversation session ${id} for ticket ${ticketId}`);
    return { success: true, sessionId: id };
  } catch (err) {
    log.error(`Failed to create conversation session for ticket ${ticketId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * End any active conversation sessions for a ticket.
 * Sets ended_at timestamp and returns session summary.
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @returns {{ success: boolean, sessionsEnded: number, messageCount?: number, error?: string }}
 */
function endConversationSessions(db, ticketId) {
  const now = new Date().toISOString();

  try {
    // Find active sessions for this ticket
    const activeSessions = db.prepare(`
      SELECT id FROM conversation_sessions
      WHERE ticket_id = ? AND ended_at IS NULL
    `).all(ticketId);

    if (activeSessions.length === 0) {
      return { success: true, sessionsEnded: 0 };
    }

    // Count total messages across sessions
    const sessionIds = activeSessions.map(s => s.id);
    const messageCount = db.prepare(`
      SELECT COUNT(*) as count FROM conversation_messages
      WHERE session_id IN (${sessionIds.map(() => "?").join(",")})
    `).get(...sessionIds)?.count || 0;

    // End all active sessions
    db.prepare(`
      UPDATE conversation_sessions
      SET ended_at = ?
      WHERE ticket_id = ? AND ended_at IS NULL
    `).run(now, ticketId);

    log.info(`Auto-ended ${activeSessions.length} conversation session(s) for ticket ${ticketId} (${messageCount} messages)`);
    return { success: true, sessionsEnded: activeSessions.length, messageCount };
  } catch (err) {
    log.error(`Failed to end conversation sessions for ticket ${ticketId}: ${err.message}`);
    return { success: false, sessionsEnded: 0, error: err.message };
  }
}

/**
 * Maximum number of comments to include in start_ticket_work context.
 * If there are more comments, only the most recent ones are included.
 */
const MAX_COMMENTS_IN_CONTEXT = 10;

/**
 * Fetch and format comments for a ticket.
 * Returns the most recent comments (up to MAX_COMMENTS_IN_CONTEXT).
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @returns {{ comments: Array<{content: string, author: string, type: string, created_at: string}>, totalCount: number, truncated: boolean }}
 */
function fetchTicketComments(db, ticketId) {
  // Get total count first
  const countResult = db.prepare(`
    SELECT COUNT(*) as count FROM ticket_comments WHERE ticket_id = ?
  `).get(ticketId);
  const totalCount = countResult?.count || 0;

  if (totalCount === 0) {
    return { comments: [], totalCount: 0, truncated: false };
  }

  // Fetch most recent comments (ordered by created_at DESC, then reverse for chronological display)
  const comments = db.prepare(`
    SELECT content, author, type, created_at
    FROM ticket_comments
    WHERE ticket_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(ticketId, MAX_COMMENTS_IN_CONTEXT);

  // Reverse to get chronological order (oldest first among the selected)
  comments.reverse();

  return {
    comments,
    totalCount,
    truncated: totalCount > MAX_COMMENTS_IN_CONTEXT,
  };
}

/** Comment type to display label mapping */
const COMMENT_TYPE_LABELS = {
  work_summary: "📋 Work Summary",
  test_report: "🧪 Test Report",
  progress: "📈 Progress",
  comment: "💬 Comment",
};

/**
 * Format a single comment for display.
 * @param {{ content: string, author: string, type: string, created_at: string }} comment
 * @returns {string}
 */
function formatComment(comment) {
  const date = new Date(comment.created_at);
  const dateStr = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const typeLabel = COMMENT_TYPE_LABELS[comment.type] || "💬 Comment";

  return `**${comment.author}** (${typeLabel}) - ${dateStr}:\n${comment.content}`;
}

/**
 * Build the comments section for ticket context.
 * @param {Array<{content: string, author: string, type: string, created_at: string}>} comments
 * @param {number} totalCount
 * @param {boolean} truncated
 * @returns {string}
 */
function buildCommentsSection(comments, totalCount, truncated) {
  if (comments.length === 0) {
    return "";
  }

  const header = truncated
    ? `### Previous Comments (${comments.length} of ${totalCount} shown)\n\n*Note: ${totalCount - comments.length} older comment(s) not shown. Check the ticket UI for full history.*\n\n`
    : `### Previous Comments (${totalCount})\n\n`;

  const formattedComments = comments.map(formatComment).join("\n\n---\n\n");

  return `${header}${formattedComments}\n`;
}

/**
 * Build type-aware context section for attachments.
 * Generates different instructions based on attachment types.
 *
 * @param {{ imageCount: number, filenames: string[], totalSizeBytes: number, failedCount: number, failedFiles: string[], attachments: Array<{filename: string, type: string, description?: string, priority: string}>, byType: Record<string, number> }} telemetry
 * @returns {string} Markdown section with type-aware instructions or empty string if no attachments
 */
function buildAttachmentContextSection(telemetry) {
  if (!telemetry.attachments || telemetry.attachments.length === 0) {
    return "";
  }

  // Group attachments by type
  const byType = {};
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
  const hasBugTypes = byType["bug-screenshot"] || byType["actual-behavior"] || byType["expected-behavior"];

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

    const config = ATTACHMENT_TYPE_CONFIG[type] || {
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

/**
 * Build a prominent warning section when design mockups are attached.
 * This ensures AI reviews the attached images BEFORE implementing UI.
 *
 * @deprecated Use buildAttachmentContextSection instead for type-aware context.
 * Kept for backward compatibility.
 *
 * @param {{ imageCount: number, filenames: string[], totalSizeBytes: number, failedCount: number, failedFiles: string[], attachments?: Array<{filename: string, type: string, description?: string, priority: string}>, byType?: Record<string, number> }} telemetry
 * @returns {string} Markdown warning section or empty string if no images
 */
function buildDesignMockupWarning(telemetry) {
  // Use type-aware context if attachments metadata is available
  if (telemetry.attachments && telemetry.attachments.length > 0) {
    return buildAttachmentContextSection(telemetry);
  }

  // Legacy fallback: treat all images as design mockups
  if (telemetry.imageCount === 0) {
    return "";
  }

  const imageFilenames = telemetry.filenames.filter(f => {
    const ext = f.split(".").pop()?.toLowerCase() || "";
    return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
  });

  let warning = `## DESIGN MOCKUPS ATTACHED

**STOP! Before implementing, review the attached images.**

These mockups show the expected UI design. Your implementation MUST match:
- Layout and component structure
- Spacing and alignment
- Visual styling
- All visible elements

### Attached Images (${telemetry.imageCount})
${imageFilenames.map(f => `- ${f}`).join("\n")}

The images are included below. Reference them throughout implementation.
`;

  // Add fallback text if any images failed to load
  if (telemetry.failedCount > 0) {
    const failedImages = telemetry.failedFiles.filter(f => {
      const ext = f.split(".").pop()?.toLowerCase() || "";
      return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
    });
    if (failedImages.length > 0) {
      warning += `
### Failed to Load (${failedImages.length})
The following image files could not be loaded. Check the ticket UI for these images:
${failedImages.map(f => `- ${f}`).join("\n")}
`;
    }
  }

  return warning;
}

/**
 * Add a comment to a ticket (internal helper).
 * @param {import("better-sqlite3").Database} db
 * @param {string} ticketId
 * @param {string} content
 * @param {string} author
 * @param {string} type
 * @returns {{ success: boolean, id?: string, error?: string }}
 */
function addComment(db, ticketId, content, author = "ralph", type = "comment") {
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, ticketId, content.trim(), author, type, now);
    log.info(`Auto-added ${type} to ticket ${ticketId} by ${author}`);
    return { success: true, id };
  } catch (err) {
    log.error(`Failed to add ${type} to ticket ${ticketId}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Update PRD file to set passes: true for a ticket.
 * @param {string} projectPath
 * @param {string} ticketId
 * @returns {{ success: boolean, message: string }}
 */
function updatePrdForTicket(projectPath, ticketId) {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { success: false, message: `PRD file not found: ${prdPath}` };
  }

  try {
    const prdContent = readFileSync(prdPath, "utf-8");
    const prd = JSON.parse(prdContent);

    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return { success: false, message: "PRD has no userStories array" };
    }

    const story = prd.userStories.find(s => s.id === ticketId);
    if (!story) {
      return { success: false, message: `Ticket ${ticketId} not found in PRD` };
    }

    story.passes = true;
    writeFileSync(prdPath, JSON.stringify(prd, null, 2) + "\n");
    log.info(`Updated PRD: set passes=true for ticket ${ticketId}`);
    return { success: true, message: `PRD updated: ${story.title} marked as passing` };
  } catch (err) {
    return { success: false, message: `Failed to update PRD: ${err.message}` };
  }
}

/**
 * Read and parse PRD file.
 * @param {string} projectPath
 * @returns {{ prd: object | null, error: string | null }}
 */
function readPrd(projectPath) {
  const prdPath = join(projectPath, "plans", "prd.json");

  if (!existsSync(prdPath)) {
    return { prd: null, error: "No PRD file found" };
  }

  try {
    const prd = JSON.parse(readFileSync(prdPath, "utf-8"));
    if (!prd.userStories || !Array.isArray(prd.userStories)) {
      return { prd: null, error: "PRD has no userStories array" };
    }
    return { prd, error: null };
  } catch (err) {
    return { prd: null, error: `Failed to read PRD: ${err.message}` };
  }
}

/**
 * Get the next strategic ticket to work on from the PRD.
 * @param {string} projectPath
 * @param {string} completedTicketId - The ticket that was just completed
 * @returns {{ nextTicket: object | null, reason: string }}
 */
function _suggestNextTicket(projectPath, completedTicketId) {
  const { prd, error } = readPrd(projectPath);
  if (!prd) {
    return { nextTicket: null, reason: error };
  }

  const incompleteStories = prd.userStories.filter(s => !s.passes && s.id !== completedTicketId);

  if (incompleteStories.length === 0) {
    return { nextTicket: null, reason: "All tickets complete! Sprint finished." };
  }

  // Prioritize by priority field (high > medium > low)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  incompleteStories.sort((a, b) => {
    const aPriority = priorityOrder[a.priority] ?? 1;
    const bPriority = priorityOrder[b.priority] ?? 1;
    return aPriority - bPriority;
  });

  const next = incompleteStories[0];
  const description = next.description || "";
  return {
    nextTicket: {
      id: next.id,
      title: next.title,
      priority: next.priority,
      description: description.length > 200 ? description.substring(0, 200) + "..." : description,
    },
    reason: `Next highest priority ticket (${next.priority || "medium"})`,
  };
}

/**
 * Register workflow tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 * @param {Function} detectEnvironment - Environment detection function
 */
export function registerWorkflowTools(server, db, detectEnvironment) {
  // Start ticket work
  server.tool(
    "start_ticket_work",
    `Start working on a ticket.

This tool handles all workflow automatically:
1. Creates a git branch: feature/{ticket-short-id}-{slug}
2. Sets the ticket status to in_progress
3. Auto-posts a "Starting work" comment for tracking
4. Returns ticket context including description and acceptance criteria

Use this when picking up a ticket to work on.
The project must have a git repository initialized.

Args:
  ticketId: The ticket ID to start working on

Returns:
  Branch name, ticket details with description/acceptance criteria, and project path.`,
    { ticketId: z.string().describe("Ticket ID to start working on") },
    async ({ ticketId }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "in_progress") {
        return { content: [{ type: "text", text: `Ticket is already in progress.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (!existsSync(ticket.project_path)) {
        return { content: [{ type: "text", text: `Project path does not exist: ${ticket.project_path}` }], isError: true };
      }

      const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
      if (!gitCheck.success) {
        return { content: [{ type: "text", text: `Not a git repository: ${ticket.project_path}\n\nInitialize git first: git init` }], isError: true };
      }

      // Check if ticket belongs to an epic with an existing branch
      let branchName;
      let branchCreated = false;
      let usingEpicBranch = false;
      let epicInfo = null;

      if (ticket.epic_id) {
        // Check for existing epic branch
        const epicState = db.prepare(`SELECT * FROM epic_workflow_state WHERE epic_id = ?`).get(ticket.epic_id);

        if (epicState?.epic_branch_name) {
          // Epic has a branch - use it
          const epicBranchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${epicState.epic_branch_name}`, ticket.project_path);
          if (epicBranchExists.success) {
            branchName = epicState.epic_branch_name;
            usingEpicBranch = true;

            // Get epic info for context
            const epic = db.prepare(`SELECT title FROM epics WHERE id = ?`).get(ticket.epic_id);
            epicInfo = {
              title: epic?.title || "Unknown Epic",
              branchName: branchName,
              prUrl: epicState.pr_url,
            };

            // Checkout the epic branch
            const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
            if (!checkoutBranch.success) {
              return { content: [{ type: "text", text: `Failed to checkout epic branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
            }

            // Update epic workflow state to track current ticket
            const now = new Date().toISOString();
            db.prepare(`UPDATE epic_workflow_state SET current_ticket_id = ?, updated_at = ? WHERE epic_id = ?`).run(ticketId, now, ticket.epic_id);

            log.info(`Ticket ${ticketId} using epic branch ${branchName}`);
          } else {
            // Epic branch was deleted - suggest recreating it
            log.warn(`Epic branch ${epicState.epic_branch_name} no longer exists for ticket ${ticketId}`);
            return {
              content: [{
                type: "text",
                text: `Epic branch \`${epicState.epic_branch_name}\` no longer exists.

This ticket belongs to an epic that previously had a branch, but it was deleted.

**To fix:** Run \`start_epic_work("${ticket.epic_id}")\` to recreate the epic branch, then try again.`,
              }],
              isError: true,
            };
          }
        } else {
          // Ticket belongs to epic but no branch exists yet
          // Get epic info to generate branch name
          const epic = db.prepare(`SELECT id, title FROM epics WHERE id = ?`).get(ticket.epic_id);
          if (epic) {
            // Auto-create the epic branch for convenience
            branchName = generateEpicBranchName(epic.id, epic.title);
            usingEpicBranch = true;
            epicInfo = { title: epic.title, branchName: branchName };

            const epicBranchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, ticket.project_path);
            if (!epicBranchExists.success) {
              // Create the epic branch
              let baseBranch = "main";
              const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", ticket.project_path);
              if (!mainExists.success) {
                const masterExists = runGitCommand("git show-ref --verify --quiet refs/heads/master", ticket.project_path);
                if (masterExists.success) baseBranch = "master";
              }

              runGitCommand(`git checkout ${baseBranch}`, ticket.project_path);
              const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
              if (!createBranch.success) {
                return { content: [{ type: "text", text: `Failed to create epic branch ${branchName}: ${createBranch.error}` }], isError: true };
              }
              branchCreated = true;
            } else {
              const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
              if (!checkoutBranch.success) {
                return { content: [{ type: "text", text: `Failed to checkout epic branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
              }
            }

            // Create/update epic workflow state with the branch
            const now = new Date().toISOString();
            const existingState = db.prepare(`SELECT id FROM epic_workflow_state WHERE epic_id = ?`).get(epic.id);
            if (existingState) {
              db.prepare(`
                UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, current_ticket_id = ?, updated_at = ?
                WHERE epic_id = ?
              `).run(branchName, now, ticketId, now, epic.id);
            } else {
              const stateId = randomUUID();
              db.prepare(`
                INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, current_ticket_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(stateId, epic.id, branchName, now, ticketId, now, now);
            }

            log.info(`Auto-created epic branch ${branchName} for ticket ${ticketId}`);
          }
        }
      }

      // If not using epic branch, create ticket-specific branch (original behavior)
      if (!usingEpicBranch) {
        branchName = generateBranchName(ticketId, ticket.title);
        const branchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, ticket.project_path);

        if (!branchExists.success) {
          const createBranch = runGitCommand(`git checkout -b ${branchName}`, ticket.project_path);
          if (!createBranch.success) {
            return { content: [{ type: "text", text: `Failed to create branch ${branchName}: ${createBranch.error}` }], isError: true };
          }
          branchCreated = true;
        } else {
          const checkoutBranch = runGitCommand(`git checkout ${branchName}`, ticket.project_path);
          if (!checkoutBranch.success) {
            return { content: [{ type: "text", text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
          }
        }
      }

      const now = new Date().toISOString();
      try {
        db.prepare("UPDATE tickets SET status = 'in_progress', branch_name = ?, updated_at = ? WHERE id = ?").run(branchName, now, ticketId);
      } catch (dbErr) {
        log.error(`Failed to update ticket status: ${dbErr.message}`, { ticketId });
        // Attempt to clean up the branch we just created
        runGitCommand(`git checkout - && git branch -d ${branchName}`, ticket.project_path);
        return { content: [{ type: "text", text: `Failed to update ticket status: ${dbErr.message}\n\nThe git branch was cleaned up. Please try again.` }], isError: true };
      }

      // Auto-post "Starting work" progress comment (per spec: mandatory audit trail)
      const startCommentContent = usingEpicBranch
        ? `Started work on ticket. Branch: \`${branchName}\` (epic branch)`
        : `Started work on ticket. Branch: \`${branchName}\``;
      const commentResult = addComment(db, ticketId, startCommentContent, "ralph", "progress");
      if (!commentResult.success) {
        log.warn(`Comment not saved for ticket ${ticketId}: ${commentResult.error}`);
      }

      // Auto-create conversation session for compliance logging
      const environment = detectEnvironment();
      const sessionResult = createConversationSession(db, ticketId, ticket.project_id, environment);
      const sessionInfo = sessionResult.success
        ? `**Conversation Session:** \`${sessionResult.sessionId}\` (auto-created for compliance logging)`
        : `**Warning:** Compliance logging failed: ${sessionResult.error}. Work may not be logged for audit.`;

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Started work on ticket ${ticketId}: branch ${branchName}`);

      // Parse acceptance criteria from subtasks JSON
      let acceptanceCriteria = ["Complete the implementation as described"];
      const parseWarnings = [];
      if (updatedTicket.subtasks) {
        try {
          const subtasks = JSON.parse(updatedTicket.subtasks);
          if (subtasks.length > 0) {
            acceptanceCriteria = subtasks.map(s => s.title || s);
          }
        } catch (parseErr) {
          log.warn(`Failed to parse subtasks for ticket ${ticketId}:`, parseErr);
          parseWarnings.push(`Failed to parse acceptance criteria: ${parseErr.message}. Using defaults.`);
        }
      }

      const description = updatedTicket.description || "No description provided";
      const priority = updatedTicket.priority || "medium";

      // Fetch previous comments for context
      const { comments, totalCount, truncated } = fetchTicketComments(db, ticketId);
      const commentsSection = buildCommentsSection(comments, totalCount, truncated);
      log.info(`Loaded ${comments.length} of ${totalCount} comments for ticket ${ticketId}`);

      // Load ticket attachments for LLM context
      let attachmentsList = null;
      if (updatedTicket.attachments) {
        try {
          attachmentsList = JSON.parse(updatedTicket.attachments);
        } catch (parseErr) {
          log.warn(`Failed to parse attachments for ticket ${ticketId}:`, parseErr);
          parseWarnings.push(`Failed to parse attachments list: ${parseErr.message}. Attachments will not be loaded.`);
        }
      }

      const { contentBlocks: attachmentBlocks, warnings: attachmentWarnings, telemetry: attachmentTelemetry } = loadTicketAttachments(ticketId, attachmentsList);

      // Log attachment telemetry for observability
      if (attachmentTelemetry.totalCount > 0) {
        log.info(`Attachment telemetry for ticket ${ticketId}:`, {
          total: attachmentTelemetry.totalCount,
          loaded: attachmentTelemetry.loadedCount,
          failed: attachmentTelemetry.failedCount,
          images: attachmentTelemetry.imageCount,
          totalSizeKB: Math.round(attachmentTelemetry.totalSizeBytes / 1024),
          filenames: attachmentTelemetry.filenames,
          failedFiles: attachmentTelemetry.failedFiles,
        });
      }

      // Build design mockup warning if images are present
      const designMockupWarning = buildDesignMockupWarning(attachmentTelemetry);

      // Build attachments section for non-image files (images are covered by the warning)
      let attachmentsSection = "";
      if (attachmentBlocks.length > 0) {
        const textCount = attachmentBlocks.filter(b => b.type === "text").length;
        // Only show generic attachments section for non-image files
        if (textCount > 0) {
          attachmentsSection = `\n### Other Attachments\n- ${textCount} text/reference file(s) included below\n`;
        }
      }

      // Add warnings section if any (combine parse warnings and attachment warnings)
      const allWarnings = [...parseWarnings, ...attachmentWarnings];
      let warningsSection = "";
      if (allWarnings.length > 0) {
        warningsSection = `\n### Warnings\n${allWarnings.map(w => `- ${w}`).join("\n")}\n`;
      }

      // Build epic info section if using epic branch
      let epicSection = "";
      if (usingEpicBranch && epicInfo) {
        epicSection = `**Epic:** ${epicInfo.title}
**Using Epic Branch:** All commits will go to the shared epic branch${epicInfo.prUrl ? `\n**Epic PR:** ${epicInfo.prUrl}` : ""}
`;
      }

      // Build the main text content block
      // Design mockup warning appears prominently at the top if images are present
      const mainTextBlock = {
        type: "text",
        text: `## Started Work on Ticket

**Branch:** \`${branchName}\` ${branchCreated ? "(created)" : "(checked out)"}
**Project:** ${updatedTicket.project_name}
**Path:** ${updatedTicket.project_path}
${epicSection}${sessionInfo ? `\n${sessionInfo}` : ""}
${designMockupWarning ? `\n---\n\n${designMockupWarning}` : ""}
---

## Ticket: ${updatedTicket.title}

**Priority:** ${priority}

### Description
${description}
${commentsSection ? `\n${commentsSection}` : ""}
### Acceptance Criteria
${acceptanceCriteria.map(c => `- ${c}`).join("\n")}
${attachmentsSection}${warningsSection}
---

Focus on implementation. When done, call \`complete_ticket_work\` with your summary.`,
      };

      // Build the content array: main text first, then attachments
      const content = [mainTextBlock, ...attachmentBlocks];

      return { content };
    }
  );

  // Start epic work
  server.tool(
    "start_epic_work",
    `Start working on an epic. Creates an epic-level git branch that all tickets in the epic will share.

This tool handles epic-level workflow:
1. Creates an epic branch: feature/epic-{epic-short-id}-{slug}
2. Stores the branch name in epic_workflow_state for ticket reuse
3. Optionally creates a draft PR for the epic
4. Returns epic context including all tickets

Use this BEFORE starting work on any ticket in the epic.
All subsequent ticket work will use this epic branch instead of creating per-ticket branches.

Args:
  epicId: The epic ID to start working on
  createPr: Whether to create a draft PR immediately (default: false)

Returns:
  Branch name, epic details, and list of tickets in the epic.`,
    {
      epicId: z.string().describe("Epic ID to start working on"),
      createPr: z.boolean().optional().default(false).describe("Create a draft PR immediately"),
    },
    async ({ epicId, createPr }) => {
      // Get epic with project info
      const epic = db.prepare(`
        SELECT e.*, p.name as project_name, p.path as project_path
        FROM epics e JOIN projects p ON e.project_id = p.id WHERE e.id = ?
      `).get(epicId);

      if (!epic) {
        return { content: [{ type: "text", text: `Epic not found: ${epicId}` }], isError: true };
      }

      if (!existsSync(epic.project_path)) {
        return { content: [{ type: "text", text: `Project path does not exist: ${epic.project_path}` }], isError: true };
      }

      const gitCheck = runGitCommand("git rev-parse --git-dir", epic.project_path);
      if (!gitCheck.success) {
        return { content: [{ type: "text", text: `Not a git repository: ${epic.project_path}\n\nInitialize git first: git init` }], isError: true };
      }

      // Check if epic workflow state already exists with a branch
      let epicState = db.prepare(`SELECT * FROM epic_workflow_state WHERE epic_id = ?`).get(epicId);

      if (epicState?.epic_branch_name) {
        // Epic branch already exists - check it out and return info
        const branchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${epicState.epic_branch_name}`, epic.project_path);
        if (branchExists.success) {
          const checkoutBranch = runGitCommand(`git checkout ${epicState.epic_branch_name}`, epic.project_path);
          if (!checkoutBranch.success) {
            return { content: [{ type: "text", text: `Failed to checkout existing epic branch ${epicState.epic_branch_name}: ${checkoutBranch.error}` }], isError: true };
          }

          // Get tickets in epic
          const epicTickets = db.prepare(`
            SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
          `).all(epicId);

          return {
            content: [{
              type: "text",
              text: `## Epic Already Started

**Branch:** \`${epicState.epic_branch_name}\` (checked out)
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
${epicState.pr_url ? `**PR:** ${epicState.pr_url}` : ""}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map(t => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

Use \`start_ticket_work\` to begin work on any ticket. All tickets will use this branch.`,
            }],
          };
        }
        // Branch was deleted externally - we'll recreate it below
        log.warn(`Epic branch ${epicState.epic_branch_name} no longer exists, will recreate`);
      }

      // Generate epic branch name
      const branchName = generateEpicBranchName(epicId, epic.title);

      // Check if branch already exists in git (might have been created outside our tracking)
      const branchExists = runGitCommand(`git show-ref --verify --quiet refs/heads/${branchName}`, epic.project_path);

      let branchCreated = false;
      if (!branchExists.success) {
        // Create the branch from main/dev
        let baseBranch = "main";
        const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", epic.project_path);
        if (!mainExists.success) {
          const masterExists = runGitCommand("git show-ref --verify --quiet refs/heads/master", epic.project_path);
          if (masterExists.success) baseBranch = "master";
        }

        // Make sure we're on the base branch first, then create new branch
        runGitCommand(`git checkout ${baseBranch}`, epic.project_path);
        const createBranch = runGitCommand(`git checkout -b ${branchName}`, epic.project_path);
        if (!createBranch.success) {
          return { content: [{ type: "text", text: `Failed to create branch ${branchName}: ${createBranch.error}` }], isError: true };
        }
        branchCreated = true;
      } else {
        const checkoutBranch = runGitCommand(`git checkout ${branchName}`, epic.project_path);
        if (!checkoutBranch.success) {
          return { content: [{ type: "text", text: `Failed to checkout branch ${branchName}: ${checkoutBranch.error}` }], isError: true };
        }
      }

      const now = new Date().toISOString();

      // Create or update epic workflow state
      if (!epicState) {
        // Create new epic workflow state
        const stateId = randomUUID();
        db.prepare(`
          INSERT INTO epic_workflow_state (id, epic_id, epic_branch_name, epic_branch_created_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(stateId, epicId, branchName, now, now, now);
        epicState = { id: stateId, epic_branch_name: branchName };
      } else {
        // Update existing state with branch info
        db.prepare(`
          UPDATE epic_workflow_state SET epic_branch_name = ?, epic_branch_created_at = ?, updated_at = ? WHERE epic_id = ?
        `).run(branchName, now, now, epicId);
      }

      // Get tickets in epic
      const epicTickets = db.prepare(`
        SELECT id, title, status, priority FROM tickets WHERE epic_id = ? ORDER BY position
      `).all(epicId);

      // Update ticket counts
      const ticketsTotal = epicTickets.length;
      const ticketsDone = epicTickets.filter(t => t.status === "done").length;
      db.prepare(`
        UPDATE epic_workflow_state SET tickets_total = ?, tickets_done = ?, updated_at = ? WHERE epic_id = ?
      `).run(ticketsTotal, ticketsDone, now, epicId);

      log.info(`Started epic work on ${epicId}: branch ${branchName}`);

      // Optionally create draft PR
      let prInfo = "";
      if (createPr) {
        // Push branch to remote first
        const pushResult = runGitCommand(`git push -u origin ${branchName}`, epic.project_path);
        if (!pushResult.success) {
          prInfo = `\n\n**Warning:** Could not push branch to remote: ${pushResult.error}\nCreate PR manually when ready.`;
        } else {
          // Create draft PR using gh CLI
          const prResult = runGitCommand(
            `gh pr create --draft --title "[Epic] ${epic.title}" --body "Epic work for: ${epic.title}\n\nThis PR contains all tickets from the epic."`,
            epic.project_path
          );
          if (prResult.success && prResult.output) {
            // Extract PR URL from output
            const prUrl = prResult.output.trim();
            // Extract PR number from URL (last segment)
            const prNumber = parseInt(prUrl.split("/").pop() || "0", 10);

            // Update epic workflow state with PR info
            db.prepare(`
              UPDATE epic_workflow_state SET pr_number = ?, pr_url = ?, pr_status = 'draft', updated_at = ? WHERE epic_id = ?
            `).run(prNumber, prUrl, now, epicId);

            prInfo = `\n\n**Draft PR Created:** ${prUrl}`;
            log.info(`Created draft PR for epic ${epicId}: ${prUrl}`);
          } else {
            prInfo = `\n\n**Warning:** Could not create PR: ${prResult.error}\nCreate PR manually when ready.`;
          }
        }
      }

      return {
        content: [{
          type: "text",
          text: `## Started Epic Work

**Branch:** \`${branchName}\` ${branchCreated ? "(created)" : "(checked out)"}
**Epic:** ${epic.title}
**Project:** ${epic.project_name}
**Path:** ${epic.project_path}${prInfo}

### Tickets in Epic (${epicTickets.length})
${epicTickets.map(t => `- [${t.status}] ${t.title} (${t.priority || "medium"})`).join("\n")}

---

All tickets in this epic will now use the epic branch \`${branchName}\`.
Use \`start_ticket_work\` to begin work on any ticket.`,
        }],
      };
    }
  );

  // Complete ticket work
  server.tool(
    "complete_ticket_work",
    `Complete implementation work on a ticket and move it to AI review.

This tool handles all completion workflow automatically:
1. Sets the ticket status to ai_review (NOT done - human approval required)
2. Creates/updates ticket workflow state for review tracking
3. Auto-posts a formatted work summary comment
4. Updates the PRD file (sets passes: true for this ticket)
5. Returns AI review instructions and code review guidance

IMPORTANT: After calling this tool, you MUST:
1. Run all 3 review agents (code-reviewer, silent-failure-hunter, code-simplifier)
2. Call submit_review_finding for each issue found
3. Fix critical/major findings and call mark_finding_fixed
4. Call check_review_complete to verify all critical/major findings resolved
5. Call generate_demo_script to create manual test steps
6. STOP - ticket moves to human_review for human approval

The ticket cannot be marked 'done' until a human approves via submit_demo_feedback.

Args:
  ticketId: The ticket ID to complete
  summary: Work summary describing what was done (recommended)

Returns:
  Updated ticket in ai_review status with instructions for next steps.`,
    {
      ticketId: z.string().describe("Ticket ID to complete"),
      summary: z.string().optional().describe("Work summary describing what was done - will be auto-posted as a comment"),
    },
    async ({ ticketId, summary }) => {
      const ticket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      if (!ticket) {
        return { content: [{ type: "text", text: `Ticket not found: ${ticketId}` }], isError: true };
      }

      if (ticket.status === "done") {
        return { content: [{ type: "text", text: `Ticket is already done.\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      if (ticket.status === "ai_review" || ticket.status === "human_review") {
        return { content: [{ type: "text", text: `Ticket is already in ${ticket.status}.\n\nTo proceed:\n- In ai_review: Run review agents, fix findings, then generate demo\n- In human_review: Wait for human feedback via submit_demo_feedback\n\n${JSON.stringify(ticket, null, 2)}` }] };
      }

      let commitsInfo = "", prDescription = "";
      let changedFiles = [];

      if (existsSync(ticket.project_path)) {
        const gitCheck = runGitCommand("git rev-parse --git-dir", ticket.project_path);
        if (gitCheck.success) {
          let baseBranch = "main";
          const mainExists = runGitCommand("git show-ref --verify --quiet refs/heads/main", ticket.project_path);
          if (!mainExists.success) {
            const masterExists = runGitCommand("git show-ref --verify --quiet refs/heads/master", ticket.project_path);
            if (masterExists.success) baseBranch = "master";
          }

          const commitsResult = runGitCommand(
            `git log ${baseBranch}..HEAD --oneline --no-decorate 2>/dev/null || git log -10 --oneline --no-decorate`,
            ticket.project_path
          );

          if (commitsResult.success && commitsResult.output) {
            commitsInfo = commitsResult.output;
            const commitLines = commitsInfo.split("\n").filter(l => l.trim());
            prDescription = `## Summary\n${summary || ticket.title}\n\n## Changes\n${commitLines.map(c => `- ${c.substring(c.indexOf(" ") + 1)}`).join("\n")}\n\n## Ticket\n- ID: ${shortId(ticketId)}\n- Title: ${ticket.title}\n`;
          }

          // Get list of changed files for code review guidance
          const filesResult = runGitCommand(
            `git diff ${baseBranch}..HEAD --name-only 2>/dev/null || git diff HEAD~5..HEAD --name-only 2>/dev/null`,
            ticket.project_path
          );
          if (filesResult.success && filesResult.output) {
            changedFiles = filesResult.output.split("\n").filter(f => f.trim());
          }
        }
      }

      const now = new Date().toISOString();
      try {
        // Per Universal Quality Workflow: complete_ticket_work moves to ai_review, not done
        // The ai_review phase requires running review agents and fixing findings before human_review
        db.prepare("UPDATE tickets SET status = 'ai_review', updated_at = ? WHERE id = ?").run(now, ticketId);
      } catch (dbErr) {
        log.error(`Failed to update ticket status to ai_review: ${dbErr.message}`, { ticketId });
        return { content: [{ type: "text", text: `Failed to update ticket status: ${dbErr.message}` }], isError: true };
      }

      // Create or update workflow state for this ticket
      let workflowState = db.prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?").get(ticketId);
      if (!workflowState) {
        const stateId = randomUUID();
        db.prepare(
          `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
           VALUES (?, ?, 'ai_review', 1, 0, 0, 0, ?, ?)`
        ).run(stateId, ticketId, now, now);
      } else {
        db.prepare(
          "UPDATE ticket_workflow_state SET current_phase = 'ai_review', updated_at = ? WHERE ticket_id = ?"
        ).run(now, ticketId);
      }

      // Auto-post work summary comment
      const workSummaryContent = summary
        ? `## Work Summary\n\n${summary}\n\n${commitsInfo ? `### Commits\n\`\`\`\n${commitsInfo}\`\`\`` : ""}`
        : `Completed work on: ${ticket.title}${commitsInfo ? `\n\nCommits:\n${commitsInfo}` : ""}`;
      const summaryResult = addComment(db, ticketId, workSummaryContent, "ralph", "work_summary");
      const summaryWarning = summaryResult.success ? "" : `\n\n**Warning:** Work summary comment was not saved: ${summaryResult.error}`;

      // Update PRD file
      const prdResult = updatePrdForTicket(ticket.project_path, ticketId);
      if (!prdResult.success) {
        log.error(`PRD update failed for ticket ${ticketId}: ${prdResult.message}`);
      }

      // End any active conversation sessions for this ticket
      const sessionEndResult = endConversationSessions(db, ticketId);
      let sessionEndInfo = "";
      if (!sessionEndResult.success) {
        sessionEndInfo = `### Conversation Sessions\n**Warning:** Failed to end sessions: ${sessionEndResult.error}`;
      } else if (sessionEndResult.sessionsEnded > 0) {
        sessionEndInfo = `### Conversation Sessions\n${sessionEndResult.sessionsEnded} session(s) ended (${sessionEndResult.messageCount || 0} messages logged)`;
      }

      // Note: We no longer suggest next ticket here since AI review is required first
      // The next ticket will be suggested after human_review completes

      const updatedTicket = db.prepare(`
        SELECT t.*, p.name as project_name, p.path as project_path
        FROM tickets t JOIN projects p ON t.project_id = p.id WHERE t.id = ?
      `).get(ticketId);

      log.info(`Completed implementation on ticket ${ticketId}, moved to ai_review`);

      const environment = detectEnvironment();

      // Build response sections - focused on AI review workflow, not context reset
      const sections = [
        `## Implementation Complete - Now in AI Review

**Ticket:** ${updatedTicket.title}
**Status:** ${updatedTicket.status}
**Project:** ${updatedTicket.project_name}`,

        `### Work Summary ${summaryResult.success ? "Posted" : "NOT SAVED"}
${summary || "Auto-generated summary from commits"}${summaryWarning}`,

        `### PRD Update
${prdResult.success
  ? prdResult.message
  : `**FAILED:** ${prdResult.message}\n\nThe PRD was not updated. This may cause issues with automated workflows.`}`,
      ];

      // Add conversation session summary if sessions were ended
      if (sessionEndInfo) {
        sections.push(sessionEndInfo);
      }

      // AI Review Instructions - this is the critical next step
      sections.push(`## REQUIRED: AI Review Phase

The ticket is now in **ai_review** status. You MUST complete the following before this ticket can be approved:

### Step 1: Run Review Agents
Run all 3 review agents in parallel to identify issues:
- **code-reviewer** - Checks code quality and project guidelines
- **silent-failure-hunter** - Identifies error handling issues
- **code-simplifier** - Suggests simplifications

### Step 2: Submit Findings
For each issue found, call:
\`\`\`
submit_review_finding({
  ticketId: "${ticketId}",
  agent: "code-reviewer",
  severity: "critical" | "major" | "minor" | "suggestion",
  category: "type-safety" | "error-handling" | etc.,
  description: "What the issue is",
  filePath: "optional/file/path.ts",
  suggestedFix: "optional suggested fix"
})
\`\`\`

### Step 3: Fix and Mark Fixed
Fix critical/major findings, then:
\`\`\`
mark_finding_fixed({ findingId: "...", status: "fixed", fixDescription: "How it was fixed" })
\`\`\`

### Step 4: Verify Review Complete
\`\`\`
check_review_complete({ ticketId: "${ticketId}" })
\`\`\`
Must return \`canProceedToHumanReview: true\` (all critical/major fixed)

### Step 5: Generate Demo Script
\`\`\`
generate_demo_script({
  ticketId: "${ticketId}",
  steps: [
    { order: 1, description: "What to test", expectedOutcome: "What should happen", type: "manual" }
  ]
})
\`\`\`
This moves ticket to **human_review**.

### Step 6: STOP
**DO NOT proceed further.** The ticket requires human approval via \`submit_demo_feedback\`.`);

      // Changed files for reference
      if (changedFiles.length > 0) {
        sections.push(`### Files Changed
${changedFiles.slice(0, 15).map(f => `- ${f}`).join("\n")}${changedFiles.length > 15 ? `\n- ... and ${changedFiles.length - 15} more` : ""}`);
      }

      if (prDescription) {
        sections.push(`### Suggested PR Description (for later)
\`\`\`markdown
${prDescription}
\`\`\``);
      }

      sections.push(`---\nstatus: ai_review\nenvironment: ${environment}`);

      const responseText = sections.join("\n\n---\n\n");

      return {
        content: [{
          type: "text",
          text: responseText,
        }],
      };
    }
  );
}

// Helper function kept for future use (e.g., after human_review completes)
function _getContextResetGuidance(environment) {
  const resetInstructions = {
    "claude-code": 'Run `/clear` to reset context for the next task.',
    "vscode": 'Click "New Chat" or press Cmd/Ctrl+L for the next task.',
  };
  const instruction = resetInstructions[environment] || "Start a new conversation for the next task.";
  return `\n## Context Reset Required\n\nThis ticket has been completed. ${instruction}`;
}

/**
 * Generate code review instructions based on the environment.
 * In Claude Code, review is enforced by a Stop hook before conversation ends.
 * In other environments, clear instructions are provided.
 * @param {string} environment - The detected environment
 * @param {string[]} changedFiles - List of files changed in the branch
 * @returns {string} Markdown instructions for running code review
 */
function _getCodeReviewGuidance(environment, changedFiles = []) {
  const hasCodeChanges = changedFiles.some(file =>
    /\.(ts|tsx|js|jsx|py|go|rs)$/.test(file) &&
    !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(file) &&
    !/node_modules|dist|build/.test(file)
  );

  if (!hasCodeChanges && changedFiles.length > 0) {
    return `## Code Review

No source code changes detected. Review may be skipped.`;
  }

  const reviewAgents = [
    "**code-reviewer** - Checks code against project guidelines",
    "**silent-failure-hunter** - Identifies error handling issues",
    "**code-simplifier** - Simplifies and refines code",
  ];

  // Claude Code has automatic review enforcement via Stop hook
  if (environment === "claude-code") {
    return `## Code Review

**Automatic Review Enabled:** The Stop hook will prompt for \`/review\` before conversation ends.

When prompted, run \`/review\` to launch all three review agents in parallel:
${reviewAgents.map(a => `- ${a}`).join("\n")}

${changedFiles.length > 0 ? `### Files Changed:\n${changedFiles.slice(0, 10).map(f => `- ${f}`).join("\n")}${changedFiles.length > 10 ? `\n- ... and ${changedFiles.length - 10} more` : ""}` : ""}`;
  }

  // Other environments need manual review
  const environmentInstructions = {
    "vscode": `Use MCP tools to run these review agents:
1. code-reviewer - Reviews against CLAUDE.md guidelines
2. silent-failure-hunter - Checks error handling
3. code-simplifier - Simplifies complex code

These can be run via the MCP panel or by asking your AI assistant.`,
    "opencode": `Run the review pipeline by asking your assistant to launch:
- code-reviewer
- silent-failure-hunter
- code-simplifier`,
  };

  const instructions = environmentInstructions[environment] || environmentInstructions["vscode"];

  return `## Code Review Required

Before creating a PR, run the code review pipeline to catch issues early.

### Review Agents:
${reviewAgents.map(a => `- ${a}`).join("\n")}

### How to Run:
${instructions}

${changedFiles.length > 0 ? `### Files to Review:\n${changedFiles.slice(0, 10).map(f => `- ${f}`).join("\n")}${changedFiles.length > 10 ? `\n- ... and ${changedFiles.length - 10} more` : ""}` : ""}`;
}
