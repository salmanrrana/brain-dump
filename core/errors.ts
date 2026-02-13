/**
 * Typed error classes for the core business logic layer.
 *
 * All core functions throw these errors instead of returning error objects.
 * Interface layers (MCP, CLI, TanStack Start) catch and format them:
 * - MCP: { content: [{ type: "text", text: error.message }], isError: true }
 * - CLI: stderr + exit code 1
 * - TanStack Start: HTTP error response
 */

// ============================================
// Base Error
// ============================================

/**
 * Base error for all core layer errors.
 * Carries a machine-readable code and optional structured details.
 */
export class CoreError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CoreError";
  }
}

// ============================================
// Not Found Errors
// ============================================

export class TicketNotFoundError extends CoreError {
  constructor(ticketId: string) {
    super(
      `Ticket not found: ${ticketId}. Use 'brain-dump ticket list' to see available tickets.`,
      "TICKET_NOT_FOUND",
      { ticketId }
    );
    this.name = "TicketNotFoundError";
  }
}

export class EpicNotFoundError extends CoreError {
  constructor(epicId: string) {
    super(
      `Epic not found: ${epicId}. Use 'brain-dump epic list' to see available epics.`,
      "EPIC_NOT_FOUND",
      { epicId }
    );
    this.name = "EpicNotFoundError";
  }
}

export class ProjectNotFoundError extends CoreError {
  constructor(projectId: string) {
    super(
      `Project not found: ${projectId}. Use 'brain-dump project list' to see available projects.`,
      "PROJECT_NOT_FOUND",
      { projectId }
    );
    this.name = "ProjectNotFoundError";
  }
}

export class FindingNotFoundError extends CoreError {
  constructor(findingId: string) {
    super(
      `Review finding not found: ${findingId}. Use 'brain-dump review get-findings' to see findings.`,
      "FINDING_NOT_FOUND",
      { findingId }
    );
    this.name = "FindingNotFoundError";
  }
}

export class SessionNotFoundError extends CoreError {
  constructor(sessionId: string) {
    super(
      `Ralph session not found: ${sessionId}. Use 'brain-dump session list' to see sessions.`,
      "SESSION_NOT_FOUND",
      { sessionId }
    );
    this.name = "SessionNotFoundError";
  }
}

// ============================================
// State & Validation Errors
// ============================================

export class InvalidStateError extends CoreError {
  constructor(resource: string, currentState: string, requiredState: string, action: string) {
    super(
      `Cannot ${action}: ${resource} is in '${currentState}' state, must be '${requiredState}'.`,
      "INVALID_STATE",
      { resource, currentState, requiredState, action }
    );
    this.name = "InvalidStateError";
  }
}

export class InvalidActionError extends CoreError {
  constructor(resource: string, action: string, validActions: string[]) {
    super(
      `Unknown action '${action}' for resource '${resource}'. Valid actions: ${validActions.join(", ")}.`,
      "INVALID_ACTION",
      { resource, action, validActions }
    );
    this.name = "InvalidActionError";
  }
}

export class ValidationError extends CoreError {
  constructor(message: string, fields?: Record<string, string>) {
    super(message, "VALIDATION_ERROR", fields ? { fields } : undefined);
    this.name = "ValidationError";
  }
}

// ============================================
// Infrastructure Errors
// ============================================

export class GitError extends CoreError {
  constructor(message: string, command?: string) {
    super(`Git operation failed: ${message}`, "GIT_ERROR", command ? { command } : undefined);
    this.name = "GitError";
  }
}

export class PathNotFoundError extends CoreError {
  constructor(path: string) {
    super(`Path not found: ${path}. Verify the path exists on the filesystem.`, "PATH_NOT_FOUND", {
      path,
    });
    this.name = "PathNotFoundError";
  }
}

// ============================================
// Transfer Errors (Export/Import)
// ============================================

export class TransferError extends CoreError {
  constructor(message: string, code = "TRANSFER_ERROR", details?: Record<string, unknown>) {
    super(message, code, details);
    this.name = "TransferError";
  }
}

export class InvalidArchiveError extends TransferError {
  constructor(message: string) {
    super(message, "INVALID_ARCHIVE", { reason: message });
    this.name = "InvalidArchiveError";
  }
}

export class ArchiveTooLargeError extends TransferError {
  constructor(sizeBytes: number, maxBytes: number) {
    super(
      `Archive size ${(sizeBytes / 1024 / 1024).toFixed(1)}MB exceeds the ${(maxBytes / 1024 / 1024).toFixed(0)}MB limit. Remove large attachments and try again.`,
      "ARCHIVE_TOO_LARGE",
      { sizeBytes, maxBytes }
    );
    this.name = "ArchiveTooLargeError";
  }
}
