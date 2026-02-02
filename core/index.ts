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
