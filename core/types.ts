/**
 * Shared TypeScript types for the core business logic layer.
 *
 * These types are used by all consumers: MCP server, CLI, TanStack Start.
 * They represent the "clean" API — parsed values, no raw JSON strings.
 */

import type Database from "better-sqlite3";

// ============================================
// Database Handle Type
// ============================================

/**
 * Database handle passed to all core functions.
 * Using the better-sqlite3 Database type directly.
 */
export type DbHandle = Database.Database;

// ============================================
// Ticket Status & Priority
// ============================================

export type TicketStatus =
  | "backlog"
  | "ready"
  | "in_progress"
  | "ai_review"
  | "human_review"
  | "done";

export type Priority = "low" | "medium" | "high";

export type PrStatus = "draft" | "open" | "merged" | "closed";

// ============================================
// Subtask & Attachment (parsed from JSON)
// ============================================

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Attachment {
  id: string;
  filename: string;
  path: string;
  type?: string;
  description?: string;
  priority?: "primary" | "supplementary";
  linkedCriteria?: string[];
}

export interface Commit {
  hash: string;
  message: string;
  linkedAt: string;
}

// ============================================
// Core Entity Types (parsed, not raw DB)
// ============================================

export interface Project {
  id: string;
  name: string;
  path: string;
  color: string | null;
  workingMethod: "auto" | "claude-code" | "vscode" | "opencode" | null;
  createdAt: string;
}

export interface TicketWithProject {
  id: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: Priority | null;
  position: number;
  projectId: string;
  epicId: string | null;
  tags: string[];
  subtasks: Subtask[];
  isBlocked: boolean;
  blockedReason: string | null;
  linkedFiles: string[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  linkedCommits: Commit[];
  branchName: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prStatus: PrStatus | null;
  project: {
    id: string;
    name: string;
    path: string;
  };
  epicTitle?: string | null;
}

export interface Epic {
  id: string;
  title: string;
  description: string | null;
  projectId: string;
  color: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  content: string;
  author: string;
  type: "comment" | "work_summary" | "test_report" | "progress";
  createdAt: string;
}

// ============================================
// Workflow Result Types
// ============================================

export interface StartWorkResult {
  branch: string;
  branchCreated: boolean;
  usingEpicBranch: boolean;
  ticket: TicketWithProject;
  warnings: string[];
  epicBranch?: string;
}

export interface CompleteWorkResult {
  ticketId: string;
  status: "ai_review";
  workSummary: string;
  nextSteps: string[];
  suggestedNextTicket?: { id: string; title: string } | null;
  commitsInfo: string;
  changedFiles: string[];
  warnings: string[];
}

export interface EpicTicketSummary {
  id: string;
  title: string;
  status: string;
  priority: string | null;
}

export interface EpicSummary {
  id: string;
  title: string;
  projectName: string;
}

export interface StartEpicWorkResult {
  branch: string;
  branchCreated: boolean;
  epic: EpicSummary;
  tickets: EpicTicketSummary[];
  warnings: string[];
}

export interface CompleteEpicResult {
  epicId: string;
  totalTickets: number;
  completedTickets: number;
  skippedTickets: number;
  prUrl?: string;
  summary: string;
  learnings: string[];
}

// ============================================
// Review & Demo Types
// ============================================

export type FindingSeverity = "critical" | "major" | "minor" | "suggestion";
export type FindingStatus = "open" | "fixed" | "wont_fix" | "duplicate";
export type FindingAgent = "code-reviewer" | "silent-failure-hunter" | "code-simplifier";

export interface ReviewFinding {
  id: string;
  ticketId: string;
  iteration: number;
  agent: FindingAgent;
  severity: FindingSeverity;
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestedFix?: string;
  status: FindingStatus;
  createdAt: string;
}

export interface ReviewCompletionStatus {
  complete: boolean;
  canProceedToHumanReview: boolean;
  openCritical: number;
  openMajor: number;
  openMinor: number;
  openSuggestion: number;
  totalFindings: number;
  fixedFindings: number;
  message: string;
}

export type DemoStepType = "manual" | "visual" | "automated";

export interface DemoStep {
  order: number;
  description: string;
  expectedOutcome: string;
  type: DemoStepType;
  status?: "pending" | "passed" | "failed" | "skipped";
  notes?: string;
}

export interface DemoScript {
  id: string;
  ticketId: string;
  steps: DemoStep[];
  generatedAt: string;
  executedAt?: string | null;
  feedback?: string | null;
  passed?: boolean | null;
}

export interface FeedbackResult {
  ticketId: string;
  passed: boolean;
  newStatus: TicketStatus;
  feedback: string;
}

// ============================================
// Session & Event Types
// ============================================

export type RalphSessionState =
  | "idle"
  | "analyzing"
  | "implementing"
  | "testing"
  | "committing"
  | "reviewing"
  | "done";

export interface StateHistoryEntry {
  state: RalphSessionState;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RalphSession {
  id: string;
  ticketId: string;
  currentState: RalphSessionState;
  stateHistory: StateHistoryEntry[];
  outcome: "success" | "failure" | "timeout" | "cancelled" | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

export type RalphEventType =
  | "thinking"
  | "tool_start"
  | "tool_end"
  | "file_change"
  | "progress"
  | "state_change"
  | "error";

export interface RalphEvent {
  id: string;
  sessionId: string;
  type: RalphEventType;
  data: Record<string, unknown> | null;
  createdAt: string;
}

// ============================================
// Telemetry Types
// ============================================

export interface TelemetrySession {
  id: string;
  ticketId: string | null;
  projectPath: string | null;
  environment: string | null;
  startedAt: string;
  endedAt: string | null;
  outcome: string | null;
  totalTokens: number;
  eventCount: number;
}

export interface TelemetryEvent {
  id: string;
  sessionId: string;
  eventType: string;
  toolName: string | null;
  correlationId: string | null;
  params: Record<string, unknown> | null;
  result: string | null;
  success: boolean | null;
  durationMs: number | null;
  error: string | null;
  prompt: string | null;
  tokenCount: number | null;
  createdAt: string;
}

// ============================================
// Git Types
// ============================================

export interface GitCommandResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Abstraction over git operations for testability.
 * Core functions accept this interface; real implementation wraps `execSync`,
 * while tests provide a mock. All methods are synchronous because core uses
 * `better-sqlite3` (sync) and `execSync` — no async needed.
 */
export interface GitOperations {
  run(command: string, cwd: string): GitCommandResult;
  branchExists(branch: string, cwd: string): boolean;
  checkout(branch: string, cwd: string): GitCommandResult;
  createBranch(branch: string, cwd: string): GitCommandResult;
}

// ============================================
// Delete / Dry-Run Types
// ============================================

export interface DeletePreview {
  dryRun: true;
  wouldDelete: {
    entity: string;
    id: string;
    title?: string;
    childCount?: number;
  };
  warning: string;
}

export interface DeleteConfirmed {
  dryRun: false;
  deleted: {
    entity: string;
    id: string;
    title?: string;
    childrenDeleted?: number;
  };
}

export type DeleteResult = DeletePreview | DeleteConfirmed;

// ============================================
// Compliance / Conversation Types
// ============================================

export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export interface ConversationSession {
  id: string;
  projectId: string | null;
  ticketId: string | null;
  userId: string | null;
  environment: string;
  metadata: Record<string, unknown> | null;
  dataClassification: DataClassification;
  legalHold: boolean;
  startedAt: string;
  endedAt: string | null;
  messageCount?: number;
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  contentHash: string;
  toolCalls: Array<{
    name: string;
    parameters?: Record<string, unknown>;
    result?: unknown;
  }> | null;
  tokenCount: number | null;
  modelId: string | null;
  sequenceNumber: number;
  containsPotentialSecrets: boolean;
  createdAt: string;
}

// ============================================
// Claude Tasks Types
// ============================================

export interface ClaudeTask {
  id: string;
  subject: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
  description?: string;
}

export interface ClaudeTaskSnapshot {
  id: string;
  ticketId: string;
  tasks: ClaudeTask[];
  createdAt: string;
  reason: string;
}

// ============================================
// Health & Settings Types
// ============================================

export interface DatabaseHealth {
  status: "healthy" | "warning" | "error";
  dbPath: string;
  dbSize: number;
  lastBackup: string | null;
  backupCount: number;
  integrityOk: boolean;
  lockFileExists: boolean;
  issues: string[];
}

export interface EnvironmentInfo {
  environment: "claude-code" | "vscode" | "opencode" | "cursor" | "unknown";
  workspacePath: string | null;
  detectedProject: Project | null;
  envVarsDetected: string[];
}

export interface ProjectSettings {
  projectId: string;
  projectName: string;
  workingMethod: "auto" | "claude-code" | "vscode" | "opencode";
  effectiveEnvironment: string;
  detectedEnvironment: string;
}

// ============================================
// Learning Types
// ============================================

export type LearningType = "pattern" | "anti-pattern" | "tool-usage" | "workflow";

export interface Learning {
  type: LearningType;
  description: string;
  suggestedUpdate?: {
    file: string;
    section: string;
    content: string;
  };
}

export interface LearningRecord extends Learning {
  ticketId: string;
  appliedAt: string;
  docUpdated: boolean;
}

// ============================================
// Database Initialization Result
// ============================================

export interface InitDatabaseResult {
  db: DbHandle;
  dbPath: string;
}
