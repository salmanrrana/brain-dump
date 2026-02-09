/**
 * Ticket context builder for Brain Dump MCP server.
 * Extracts and formats ticket information for display when starting work.
 * @module lib/ticket-context-builder
 */

/**
 * @typedef {Object} EpicInfo
 * @property {string} title - Epic title
 * @property {string} [prUrl] - Optional PR URL for the epic
 */

/**
 * @typedef {Object} TicketInfo
 * @property {string} title - Ticket title
 * @property {string} project_name - Project name
 * @property {string} project_path - Project path
 */

/**
 * @typedef {Object} BuildTicketContextParams
 * @property {TicketInfo} ticket - The ticket being worked on
 * @property {string} branchName - Git branch name
 * @property {boolean} branchCreated - Whether the branch was newly created
 * @property {EpicInfo} [epicInfo] - Epic information if ticket belongs to an epic
 * @property {boolean} [usingEpicBranch] - Whether using shared epic branch
 * @property {string} [sessionInfo] - Conversation session info string
 * @property {string} [attachmentContext] - Context about attachments (design mockups, etc.)
 * @property {string} description - Ticket description
 * @property {string} priority - Ticket priority (low, medium, high)
 * @property {string[]} acceptanceCriteria - List of acceptance criteria
 * @property {string} [commentsSection] - Formatted comments section
 * @property {string} [attachmentsSection] - Attachments list section
 * @property {string} [warningsSection] - Warnings section (parse errors, etc.)
 */

/**
 * Build the epic section text if using an epic branch.
 * @param {EpicInfo} [epicInfo] - Epic information
 * @param {boolean} [usingEpicBranch] - Whether using shared epic branch
 * @returns {string} Formatted epic section or empty string
 */
export function buildEpicSection(epicInfo, usingEpicBranch) {
  if (!usingEpicBranch || !epicInfo) {
    return "";
  }

  const prLine = epicInfo.prUrl ? `\n**Epic PR:** ${epicInfo.prUrl}` : "";
  return `**Epic:** ${epicInfo.title}
**Using Epic Branch:** All commits will go to the shared epic branch${prLine}
`;
}

/**
 * Build the warnings section from a list of warning messages.
 * @param {string[]} warnings - List of warning messages
 * @returns {string} Formatted warnings section or empty string
 * @throws {Error} If warnings is not an array (prevents silent garbled output)
 */
export function buildWarningsSection(warnings) {
  if (!warnings || warnings.length === 0) {
    return "";
  }
  // Guard against string being passed instead of array - would silently produce garbled output
  if (!Array.isArray(warnings)) {
    throw new Error(`buildWarningsSection: warnings must be an array, got ${typeof warnings}`);
  }
  return `\n### Warnings\n${warnings.map(w => `- ${w}`).join("\n")}\n`;
}

/**
 * Build the attachments section for non-image files.
 * @param {Array<{type: string}>} attachmentBlocks - Content blocks from attachment loading
 * @returns {string} Formatted attachments section or empty string
 */
export function buildAttachmentsSection(attachmentBlocks) {
  if (!attachmentBlocks || attachmentBlocks.length === 0) {
    return "";
  }

  const textCount = attachmentBlocks.filter(b => b.type === "text").length;
  if (textCount === 0) {
    return "";
  }

  return `\n### Other Attachments\n- ${textCount} text/reference file(s) included below\n`;
}

/**
 * Build the main ticket context text block.
 * This is the primary output that provides Claude with context about the ticket.
 *
 * @param {BuildTicketContextParams} params - Context building parameters
 * @returns {{ type: "text", text: string }} MCP text content block
 */
export function buildTicketContextBlock({
  ticket,
  branchName,
  branchCreated,
  epicInfo,
  usingEpicBranch = false,
  sessionInfo,
  attachmentContext,
  description,
  priority,
  acceptanceCriteria,
  commentsSection,
  attachmentsSection,
  warningsSection,
}) {
  const epicSection = buildEpicSection(epicInfo, usingEpicBranch);
  const branchStatus = branchCreated ? "(created)" : "(checked out)";

  // Build the context text with conditional sections
  let contextText = `## Started Work on Ticket

**Branch:** \`${branchName}\` ${branchStatus}
**Project:** ${ticket.project_name}
**Path:** ${ticket.project_path}
${epicSection}`;

  // Add session info if available
  if (sessionInfo) {
    contextText += `\n${sessionInfo}`;
  }

  // Add attachment context prominently if available (design mockups, etc.)
  if (attachmentContext) {
    contextText += `\n---\n\n${attachmentContext}`;
  }

  contextText += `---

## Ticket: ${ticket.title}

**Priority:** ${priority}

### Description
${description}
`;

  // Add comments section if available
  if (commentsSection) {
    contextText += `\n${commentsSection}`;
  }

  // Add acceptance criteria
  contextText += `### Acceptance Criteria
${acceptanceCriteria.map(c => `- ${c}`).join("\n")}
`;

  // Add attachments and warnings sections
  if (attachmentsSection) {
    contextText += attachmentsSection;
  }
  if (warningsSection) {
    contextText += warningsSection;
  }

  contextText += `---

Focus on implementation. When done, call \`workflow({ action: "complete-work", ticketId: "<ticketId>", summary: "..." })\`.`;

  return {
    type: "text",
    text: contextText,
  };
}

/**
 * Build the complete content array for workflow start-work response.
 * Combines the main context block with any attachment blocks.
 *
 * @param {BuildTicketContextParams} params - Context building parameters
 * @param {Array<{type: string}>} [attachmentBlocks] - Additional content blocks (images, text files)
 * @returns {Array<{type: string}>} Array of MCP content blocks
 */
export function buildTicketContextContent(params, attachmentBlocks = []) {
  const mainTextBlock = buildTicketContextBlock(params);
  return [mainTextBlock, ...attachmentBlocks];
}
