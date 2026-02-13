/**
 * Type definitions for Brain Dump export/import (.braindump archives).
 *
 * A .braindump file is a zip archive containing:
 * - manifest.json: structured metadata + all entity data
 * - attachments/{ticketId}/{filename}: binary attachment files
 *
 * Excluded from export: telemetry, Ralph sessions/events, conversation logs,
 * Claude tasks/snapshots, git branch/PR/commit fields, linkedFiles.
 */

import type { DbHandle } from "./types.ts";

// ============================================
// Manifest Version
// ============================================

export const MANIFEST_VERSION = 1;
export const MAX_ARCHIVE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

// ============================================
// Conflict Resolution
// ============================================

export type ConflictResolution = "create-new" | "replace" | "merge";

// ============================================
// Exported Entity Types
// ============================================

export interface ExportedEpic {
  id: string;
  title: string;
  description: string | null;
  color: string | null;
  createdAt: string;
}

export interface ExportedTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  position: number;
  epicId: string | null;
  tags: string[];
  subtasks: Array<{ id: string; text: string; completed: boolean }>;
  isBlocked: boolean;
  blockedReason: string | null;
  attachments: Array<{
    id: string;
    filename: string;
    path: string;
    type?: string;
    description?: string;
    priority?: "primary" | "supplementary";
    linkedCriteria?: string[];
  }>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ExportedComment {
  id: string;
  ticketId: string;
  content: string;
  author: string;
  type: string;
  createdAt: string;
}

export interface ExportedReviewFinding {
  id: string;
  ticketId: string;
  iteration: number;
  agent: string;
  severity: string;
  category: string;
  description: string;
  filePath: string | null;
  lineNumber: number | null;
  suggestedFix: string | null;
  status: string;
  fixedAt: string | null;
  createdAt: string;
}

export interface ExportedDemoScript {
  id: string;
  ticketId: string;
  steps: Array<{
    order: number;
    description: string;
    expectedOutcome: string;
    type: "manual" | "visual" | "automated";
    status?: string;
    notes?: string;
  }>;
  generatedAt: string;
  completedAt: string | null;
  feedback: string | null;
  passed: boolean | null;
}

export interface ExportedWorkflowState {
  ticketId: string;
  currentPhase: string;
  reviewIteration: number;
  findingsCount: number;
  findingsFixed: number;
  demoGenerated: boolean;
}

export interface ExportedEpicWorkflowState {
  epicId: string;
  ticketsTotal: number;
  ticketsDone: number;
  learnings: Array<{
    type: string;
    description: string;
    ticketId: string;
    ticketTitle?: string;
    suggestedUpdate?: {
      file: string;
      section: string;
      content: string;
    };
    appliedAt?: string;
  }>;
}

export interface ExportedAttachmentFile {
  archivePath: string;
  originalTicketId: string;
  filename: string;
}

// ============================================
// Manifest Structure
// ============================================

export interface BrainDumpManifest {
  version: typeof MANIFEST_VERSION;
  exportType: "epic" | "project";
  exportedAt: string;
  exportedBy: string;
  appVersion: string;
  sourceProject: { name: string };
  epics: ExportedEpic[];
  tickets: ExportedTicket[];
  comments: ExportedComment[];
  reviewFindings: ExportedReviewFinding[];
  demoScripts: ExportedDemoScript[];
  workflowStates: ExportedWorkflowState[];
  epicWorkflowStates: ExportedEpicWorkflowState[];
  attachmentFiles: ExportedAttachmentFile[];
}

// ============================================
// Export Result
// ============================================

export interface ExportResult {
  manifest: BrainDumpManifest;
  attachmentBuffers: Map<string, Buffer>;
}

// ============================================
// Import Params & Result
// ============================================

export interface ImportParams {
  db: DbHandle;
  manifest: BrainDumpManifest;
  attachmentBuffers: Map<string, Buffer>;
  targetProjectId: string;
  resetStatuses: boolean;
  conflictResolution: ConflictResolution;
}

export interface ImportResult {
  epicCount: number;
  ticketCount: number;
  commentCount: number;
  findingCount: number;
  demoScriptCount: number;
  attachmentCount: number;
  idMap: Record<string, string>;
  warnings: string[];
}

// ============================================
// Manifest Preview (for UI before import)
// ============================================

export interface ManifestPreview {
  version: number;
  exportType: "epic" | "project";
  exportedAt: string;
  exportedBy: string;
  appVersion: string;
  sourceProject: { name: string };
  epicNames: string[];
  ticketCount: number;
  commentCount: number;
  findingCount: number;
  demoScriptCount: number;
  attachmentCount: number;
}
