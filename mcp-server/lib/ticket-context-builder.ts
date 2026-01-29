/**
 * Ticket context builder for Brain Dump MCP server.
 * Extracts and formats ticket information for display when starting work.
 */

export interface EpicInfo {
  title: string;
  prUrl?: string;
  worktreePath?: string;
}

export interface TicketInfo {
  title: string;
  project_name: string;
  project_path: string;
}

export interface BuildTicketContextParams {
  ticket: TicketInfo;
  branchName: string;
  branchCreated: boolean;
  epicInfo?: EpicInfo;
  usingEpicBranch?: boolean;
  sessionInfo?: string;
  attachmentContext?: string;
  description: string;
  priority: string;
  acceptanceCriteria: string[];
  commentsSection?: string;
  attachmentsSection?: string;
  warningsSection?: string;
  worktreeSection?: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
}

/**
 * Build the epic section text if using an epic branch.
 */
export function buildEpicSection(epicInfo?: EpicInfo, usingEpicBranch?: boolean): string {
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
 * @throws {Error} If warnings is not an array (prevents silent garbled output)
 */
export function buildWarningsSection(warnings: string[]): string {
  if (!warnings || warnings.length === 0) {
    return "";
  }
  // Guard against string being passed instead of array - would silently produce garbled output
  if (!Array.isArray(warnings)) {
    throw new Error(`buildWarningsSection: warnings must be an array, got ${typeof warnings}`);
  }
  return `\n### Warnings\n${warnings.map((w) => `- ${w}`).join("\n")}\n`;
}

/**
 * Build the attachments section for non-image files.
 */
export function buildAttachmentsSection(attachmentBlocks: ContentBlock[]): string {
  if (!attachmentBlocks || attachmentBlocks.length === 0) {
    return "";
  }

  const textCount = attachmentBlocks.filter((b) => b.type === "text").length;
  if (textCount === 0) {
    return "";
  }

  return `\n### Other Attachments\n- ${textCount} text/reference file(s) included below\n`;
}

/**
 * Build the main ticket context text block.
 * This is the primary output that provides Claude with context about the ticket.
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
  worktreeSection,
}: BuildTicketContextParams): ContentBlock {
  const epicSection = buildEpicSection(epicInfo, usingEpicBranch);
  const branchStatus = branchCreated ? "(created)" : "(checked out)";

  // For worktree mode, show worktree path as the primary location
  const pathDisplay = epicInfo?.worktreePath
    ? `**Working Directory:** \`${epicInfo.worktreePath}\` (worktree)\n**Main Repository:** \`${ticket.project_path}\``
    : `**Path:** ${ticket.project_path}`;

  // Build the context text with conditional sections
  let contextText = `## Started Work on Ticket

**Branch:** \`${branchName}\` ${branchStatus}
**Project:** ${ticket.project_name}
${pathDisplay}
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
${acceptanceCriteria.map((c) => `- ${c}`).join("\n")}
`;

  // Add attachments and warnings sections
  if (attachmentsSection) {
    contextText += attachmentsSection;
  }
  if (warningsSection) {
    contextText += warningsSection;
  }

  // Add worktree context section for worktree isolation mode
  if (worktreeSection) {
    contextText += `\n${worktreeSection}\n`;
  }

  contextText += `---

Focus on implementation. When done, call \`complete_ticket_work\` with your summary.`;

  return {
    type: "text",
    text: contextText,
  };
}

/**
 * Build the complete content array for start_ticket_work response.
 * Combines the main context block with any attachment blocks.
 */
export function buildTicketContextContent(
  params: BuildTicketContextParams,
  attachmentBlocks: ContentBlock[] = []
): ContentBlock[] {
  const mainTextBlock = buildTicketContextBlock(params);
  return [mainTextBlock, ...attachmentBlocks];
}
