/**
 * Core business logic layer for Brain Dump.
 *
 * This module is the single source of truth for all business logic.
 * It is consumed by: MCP server, CLI, TanStack Start server functions.
 */

// Error classes
export {
  CoreError,
  TicketNotFoundError,
  EpicNotFoundError,
  ProjectNotFoundError,
  FindingNotFoundError,
  SessionNotFoundError,
  InvalidStateError,
  InvalidActionError,
  ValidationError,
  GitError,
  PathNotFoundError,
  TransferError,
  InvalidArchiveError,
  ArchiveTooLargeError,
} from "./errors.ts";

// Types
export type {
  DbHandle,
  TicketStatus,
  Priority,
  PrStatus,
  Subtask,
  Attachment,
  Commit,
  Project,
  TicketWithProject,
  Epic,
  Comment,
  StartWorkResult,
  CompleteWorkResult,
  StartEpicWorkResult,
  EpicTicketSummary,
  EpicSummary,
  CompleteEpicResult,
  FindingSeverity,
  FindingStatus,
  FindingAgent,
  ReviewFinding,
  ReviewCompletionStatus,
  DemoStepType,
  DemoStep,
  DemoScript,
  FeedbackResult,
  RalphSessionState,
  StateHistoryEntry,
  RalphSession,
  RalphEventType,
  RalphEvent,
  TelemetrySession,
  TelemetryEvent,
  GitCommandResult,
  GitOperations,
  DeletePreview,
  DeleteConfirmed,
  DeleteResult,
  DataClassification,
  ConversationSession,
  ConversationMessage,
  ClaudeTask,
  ClaudeTaskSnapshot,
  DatabaseHealth,
  EnvironmentInfo,
  ProjectSettings,
  LearningType,
  Learning,
  LearningRecord,
  InitDatabaseResult,
} from "./types.ts";

// Database initialization
export {
  initDatabase,
  createTestDatabase,
  runMigrations,
  getDataDir,
  getStateDir,
  getBackupsDir,
  getLegacyDir,
  getDbPath,
  silentLogger,
  consoleLogger,
} from "./db.ts";

export type { InitDatabaseOptions, Logger } from "./db.ts";

// Ticket business logic
export {
  createTicket,
  listTickets,
  getTicket,
  updateTicketStatus,
  updateAcceptanceCriterion,
  deleteTicket,
  updateAttachmentMetadata,
  listTicketsByEpic,
} from "./ticket.ts";

export type {
  CreateTicketParams,
  ListTicketsFilters,
  TicketSummary,
  CriterionStatus,
  UpdateCriterionResult,
  UpdateAttachmentMetadataParams,
  UpdateAttachmentResult,
  ListTicketsByEpicFilters,
} from "./ticket.ts";

// Project business logic
export { listProjects, findProjectByPath, createProject, deleteProject } from "./project.ts";

export type { CreateProjectParams } from "./project.ts";

// Epic business logic
export { createEpic, listEpics, updateEpic, deleteEpic } from "./epic.ts";

export type { CreateEpicParams, UpdateEpicParams } from "./epic.ts";

// Comment business logic
export { addComment, listComments } from "./comment.ts";

export type { AddCommentParams, CommentAuthor, CommentType } from "./comment.ts";

// Review & demo business logic
export {
  submitFinding,
  markFixed,
  getFindings,
  checkComplete,
  generateDemo,
  getDemo,
  updateDemoStep,
  submitFeedback,
} from "./review.ts";

export type {
  SubmitFindingParams,
  MarkFixedStatus,
  GetFindingsFilters,
  GenerateDemoParams,
  DemoStepStatus,
  SubmitFeedbackParams,
} from "./review.ts";

// Session & event business logic
export {
  createSession,
  updateState,
  completeSession,
  getState,
  listSessions,
  emitEvent,
  getEvents,
  clearEvents,
  writeRalphStateFile,
  removeRalphStateFile,
  VALID_STATES,
  VALID_OUTCOMES,
  VALID_EVENT_TYPES,
} from "./session.ts";

export type {
  SessionOutcome,
  RalphStateFileData,
  CreateSessionResult,
  UpdateStateResult,
  CompleteSessionResult,
  GetStateResult,
  SessionSummary,
  ListSessionsResult,
  UpdateStateParams,
  EmitEventParams,
} from "./session.ts";

// Telemetry business logic
export {
  startTelemetrySession,
  logPrompt,
  logTool,
  logContext,
  endTelemetrySession,
  getTelemetrySession,
  listTelemetrySessions,
  detectActiveTicket,
  summarizeParams,
  TELEMETRY_OUTCOMES,
  TOOL_EVENTS,
} from "./telemetry.ts";

export type {
  TelemetryOutcome,
  ToolEventType,
  TicketDetectionResult,
  StartTelemetrySessionParams,
  TelemetrySessionResult,
  LogPromptParams,
  LogPromptResult,
  LogToolParams,
  LogToolResult,
  LogContextParams,
  EndTelemetrySessionParams,
  EndTelemetrySessionResult,
  GetTelemetrySessionParams,
  TelemetrySessionDetail,
  TelemetryEventDetail,
  ListTelemetrySessionsParams,
  TelemetrySessionSummary,
} from "./telemetry.ts";

// JSON utilities
export { safeJsonParse } from "./json.ts";

// Git utilities
export {
  slugify,
  shortId,
  generateBranchName,
  generateEpicBranchName,
  createRealGitOperations,
  runGitCommand,
  findBaseBranch,
} from "./git-utils.ts";

// Workflow business logic
export { startWork, completeWork, startEpicWork } from "./workflow.ts";

// Git linking business logic
export { linkCommit, linkPr, syncTicketLinks } from "./git.ts";

export type { LinkCommitResult, LinkPrResult, SyncedPR, SyncResult } from "./git.ts";

// File linking business logic
export { linkFiles, getTicketsForFile } from "./files.ts";

export type { LinkedFileTicket, LinkFilesResult } from "./files.ts";

// Claude tasks business logic
export { saveTasks, getTasks, clearTasks, getTaskSnapshots, TASK_STATUSES } from "./tasks.ts";

export type {
  TaskInput,
  SavedTask,
  FormattedTask,
  SaveTasksResult,
  GetTasksResult,
  ClearTasksResult,
  ParsedSnapshot,
  GetSnapshotsResult,
} from "./tasks.ts";

export type { TaskStatus as ClaudeTaskStatus } from "./tasks.ts";

// Health & settings business logic
export {
  getDatabaseHealth,
  getEnvironment,
  getProjectSettings,
  updateProjectSettings,
} from "./health.ts";

export type {
  HealthDependencies,
  EnvironmentDetector,
  WorkingMethod,
  HealthReport,
  EnvironmentResult,
  ProjectSettingsResult,
} from "./health.ts";

// Learning reconciliation business logic
export { reconcileLearnings, getEpicLearnings } from "./learnings.ts";

export type {
  LearningEntry,
  DocUpdateResult,
  ReconcileLearningsResult,
  GetEpicLearningsResult,
} from "./learnings.ts";

// Compliance / conversation logging business logic
export {
  startConversation,
  logMessage,
  endConversation,
  listConversations,
  exportComplianceLogs,
  archiveOldSessions,
  DATA_CLASSIFICATIONS,
  MESSAGE_ROLES,
} from "./compliance.ts";

export type {
  MessageRole,
  ComplianceDependencies,
  StartConversationParams,
  ConversationSessionResult,
  LogMessageParams,
  LogMessageResult,
  EndConversationResult,
  ListConversationsParams,
  ConversationSessionSummary,
  ExportParams,
  ExportedMessage,
  ExportedSession,
  IntegrityReport,
  ComplianceExport,
  ArchiveParams,
  ArchivePreview,
  ArchiveConfirmed,
  ArchiveResult,
} from "./compliance.ts";

// Transfer (export/import) types
export { MANIFEST_VERSION, MAX_ARCHIVE_SIZE_BYTES } from "./transfer-types.ts";

export type {
  ConflictResolution,
  ExportedEpic,
  ExportedTicket,
  ExportedComment,
  ExportedReviewFinding,
  ExportedDemoScript,
  ExportedWorkflowState,
  ExportedEpicWorkflowState,
  ExportedAttachmentFile,
  BrainDumpManifest,
  ExportResult,
  ImportParams,
  ImportResult,
  ManifestPreview,
} from "./transfer-types.ts";
