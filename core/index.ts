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
