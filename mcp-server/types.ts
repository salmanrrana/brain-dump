/**
 * Comprehensive TypeScript type definitions for Brain Dump MCP Server
 * Covers all database entities, MCP protocol types, and utility types
 */

// ============================================
// Database Entity Types (Ticket/Project/Epic)
// ============================================

/** A project in Brain Dump - represents a filesystem path with tickets */
export interface DbProject {
  id: string;
  name: string;
  path: string;
  color?: string | null;
  workingMethod?:
    | "auto"
    | "claude-code"
    | "vscode"
    | "opencode"
    | "cursor"
    | "copilot-cli"
    | "codex";
  createdAt: string;
}

/** Ticket status in the workflow */
export type TicketStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "ai_review"
  | "human_review"
  | "done";

/** Priority levels for tickets */
export type Priority = "low" | "medium" | "high";

/** PR status tracking */
export type PrStatus = "draft" | "open" | "merged" | "closed";

/** A ticket in Brain Dump - the main work item */
export interface DbTicket {
  id: string;
  title: string;
  description?: string | null;
  status: TicketStatus;
  priority?: Priority | null;
  position: number;
  projectId: string;
  epicId?: string | null;
  tags?: string | null; // JSON array
  subtasks?: string | null; // JSON array of {text, completed}
  isBlocked: boolean;
  blockedReason?: string | null;
  linkedFiles?: string | null; // JSON array
  attachments?: string | null; // JSON array
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  branchName?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  prStatus?: PrStatus | null;
}

/** An epic - groups related tickets */
export interface DbEpic {
  id: string;
  title: string;
  description?: string | null;
  projectId: string;
  color?: string | null;
  createdAt: string;
}

/** A comment on a ticket (work summary, activity log) */
export interface DbTicketComment {
  id: string;
  ticketId: string;
  content: string;
  author: string; // 'claude', 'ralph', 'opencode', or user identifier
  type: "comment" | "work_summary" | "test_report" | "progress";
  createdAt: string;
}

// ============================================
// Ralph Session Types (State Machine)
// ============================================

/** Ralph session state in the work lifecycle */
export type RalphSessionState =
  | "idle"
  | "analyzing"
  | "implementing"
  | "testing"
  | "committing"
  | "reviewing"
  | "done";

/** Ralph session - tracks autonomous work on a ticket */
export interface DbRalphSession {
  id: string;
  ticketId: string;
  currentState: RalphSessionState;
  stateHistory?: string | null; // JSON array of {state, timestamp, metadata}
  outcome?: "success" | "failure" | "timeout" | "cancelled" | null;
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

/** State history entry for tracking transitions */
export interface StateHistoryEntry {
  state: RalphSessionState;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** Ralph event - real-time event streaming */
export type RalphEventType =
  | "thinking"
  | "tool_start"
  | "tool_end"
  | "file_change"
  | "progress"
  | "state_change"
  | "error";

export interface DbRalphEvent {
  id: string;
  sessionId: string;
  type: RalphEventType;
  data?: string | null; // JSON object
  createdAt: string;
}

/** Data structure for Ralph event details */
export interface RalphEventData {
  message?: string;
  tool?: string;
  file?: string;
  state?: string;
  error?: string;
  success?: boolean;
  [key: string]: unknown;
}

// ============================================
// Conversation/Logging Types (Enterprise)
// ============================================

/** Data classification for compliance */
export type DataClassification = "public" | "internal" | "confidential" | "restricted";

/** Conversation session for compliance logging */
export interface DbConversationSession {
  id: string;
  projectId?: string | null;
  ticketId?: string | null;
  userId?: string | null;
  environment: string; // 'claude-code', 'vscode', 'opencode', 'unknown'
  sessionMetadata?: string | null; // JSON object
  dataClassification: DataClassification;
  legalHold: boolean;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
}

/** Message role in conversation */
export type ConversationRole = "user" | "assistant" | "system" | "tool";

/** Message within a conversation session */
export interface DbConversationMessage {
  id: string;
  sessionId: string;
  role: ConversationRole;
  content: string;
  contentHash: string; // HMAC-SHA256 for tamper detection
  toolCalls?: string | null; // JSON array
  tokenCount?: number | null;
  modelId?: string | null;
  sequenceNumber: number;
  containsPotentialSecrets: boolean;
  createdAt: string;
}

/** Tool call record */
export interface ToolCall {
  name: string;
  parameters?: Record<string, unknown>;
  result?: unknown;
}

/** Audit action types */
export type AuditAction = "read" | "export" | "delete" | "legal_hold";

/** Audit result types */
export type AuditResult = "success" | "denied" | "error";

/** Audit log entry for conversation access */
export interface DbAuditLogAccess {
  id: string;
  accessorId: string;
  targetType: "session" | "message" | "export";
  targetId: string;
  action: AuditAction;
  result: AuditResult;
  accessedAt: string;
}

// ============================================
// Telemetry Types (Analytics)
// ============================================

/** Telemetry session for tracking AI work metrics */
export interface DbTelemetrySession {
  id: string;
  ticketId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  toolCount: number;
  totalTokens: number;
  averageLatency?: number | null; // milliseconds
  errorCount: number;
}

/** Individual telemetry event */
export interface DbTelemetryEvent {
  id: string;
  sessionId: string;
  toolName: string;
  duration: number; // milliseconds
  tokenCount: number;
  success: boolean;
  errorMessage?: string | null;
  timestamp: string;
}

// ============================================
// Review & Demo Types
// ============================================

/** Severity of code review findings */
export type FindingSeverity = "critical" | "major" | "minor" | "suggestion";

/** Code review finding from automated agents */
export interface DbReviewFinding {
  id: string;
  ticketId: string;
  agent: string; // 'code-reviewer', 'silent-failure-hunter', 'code-simplifier'
  severity: FindingSeverity;
  category: string; // e.g., 'performance', 'security', 'style'
  description: string;
  suggestion?: string | null;
  status: "open" | "fixed" | "wontfix";
  createdAt: string;
  fixedAt?: string | null;
}

/** Demo script step for manual verification */
export type DemoStepType = "manual" | "visual" | "automated";

export interface DemoStep {
  number: number;
  title: string;
  description: string;
  type: DemoStepType;
  expectedResult: string;
  preconditions?: string[];
}

/** Demo script generated for human review */
export interface DbDemoScript {
  id: string;
  ticketId: string;
  steps: string; // JSON array of DemoStep
  generatedAt: string;
  executedAt?: string | null;
  feedback?: string | null;
  passed?: boolean | null;
}

// ============================================
// Learning & Documentation Types
// ============================================

/** Learning extracted from completed work */
export interface DbLearning {
  id: string;
  ticketId: string;
  category: string; // 'pattern', 'pitfall', 'tool', 'best-practice'
  content: string;
  appliedTo?: string | null; // Which file(s) got updated
  createdAt: string;
}

// ============================================
// Settings Types
// ============================================

/** Docker runtime options */
export type DockerRuntime = "auto" | "lima" | "colima" | "rancher" | "docker-desktop" | "podman";

/** Application settings */
export interface DbSettings {
  id: string;
  terminalEmulator?: string | null;
  ralphSandbox: boolean;
  ralphTimeout: number; // seconds
  ralphMaxIterations: number;
  autoCreatePr: boolean;
  prTargetBranch: string;
  defaultProjectsDirectory?: string | null;
  defaultWorkingMethod:
    | "auto"
    | "claude-code"
    | "vscode"
    | "opencode"
    | "cursor"
    | "copilot-cli"
    | "codex";
  dockerRuntime?: DockerRuntime | null;
  dockerSocketPath?: string | null;
  conversationRetentionDays: number;
  conversationLoggingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// MCP Protocol Types
// ============================================

/** MCP tool response content block */
export interface ContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
  mimeType?: string;
  url?: string;
  data?: string;
}

/** MCP tool response format */
export interface ToolResponse {
  content: ContentBlock[];
  isError?: boolean;
}

/** MCP tool registration callback */
export type ToolRegistrationFn = (
  toolName: string,
  handler: (params: Record<string, unknown>) => Promise<ToolResponse>
) => void;

// ============================================
// Utility & Helper Types
// ============================================

/** Result of a git command execution */
export interface GitCommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

/** Backup metadata */
export interface BackupResult {
  path: string;
  size: number;
  createdAt: string;
  checksum: string;
}

/** Environment information */
export interface EnvironmentInfo {
  platform: "darwin" | "linux" | "win32";
  nodeVersion: string;
  dbPath: string;
  isHealthy: boolean;
  dbHealthError?: string;
}

/** Database health check result */
export interface DbHealthCheckResult {
  isHealthy: boolean;
  tables: Record<string, number>; // table name -> row count
  latency: number; // milliseconds
  error?: string;
}

/** Paginated result set */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

/** Query filter options */
export interface QueryFilter {
  search?: string;
  status?: TicketStatus;
  priority?: Priority;
  projectId?: string;
  epicId?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

/** Create/update request types */
export type CreateProjectRequest = Omit<DbProject, "id" | "createdAt">;
export type UpdateProjectRequest = Partial<CreateProjectRequest>;

export type CreateTicketRequest = Omit<DbTicket, "id" | "createdAt" | "updatedAt">;
export type UpdateTicketRequest = Partial<CreateTicketRequest>;

export type CreateEpicRequest = Omit<DbEpic, "id" | "createdAt">;
export type UpdateEpicRequest = Partial<CreateEpicRequest>;

export type CreateCommentRequest = Omit<DbTicketComment, "id" | "createdAt">;

// ============================================
// Error Types
// ============================================

/** Typed error for database operations */
export class DbError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "INVALID_INPUT" | "DATABASE" | "CONFLICT"
  ) {
    super(message);
    this.name = "DbError";
  }
}

/** Typed error for validation */
export class ValidationError extends Error {
  constructor(
    message: string,
    public details: Record<string, string>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Typed error for authentication/authorization */
export class AuthError extends Error {
  constructor(
    message: string,
    public code: "UNAUTHORIZED" | "FORBIDDEN"
  ) {
    super(message);
    this.name = "AuthError";
  }
}
