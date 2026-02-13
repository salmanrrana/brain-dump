/**
 * Pure export/import business logic for Brain Dump transfer (.braindump archives).
 *
 * Export functions gather data from the database into an ExportResult (manifest + attachment buffers).
 * Import functions take an ExportResult and insert data into a target project.
 *
 * No zip dependency here — that's in transfer-zip.ts.
 */

import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { userInfo } from "os";

import type { DbHandle } from "./types.ts";
import type {
  ExportResult,
  ImportParams,
  ImportResult,
  BrainDumpManifest,
  ExportedEpic,
  ExportedTicket,
  ExportedComment,
  ExportedReviewFinding,
  ExportedDemoScript,
  ExportedWorkflowState,
  ExportedEpicWorkflowState,
  ExportedAttachmentFile,
} from "./transfer-types.ts";
import { MANIFEST_VERSION, MAX_ARCHIVE_SIZE_BYTES } from "./transfer-types.ts";
import {
  EpicNotFoundError,
  ProjectNotFoundError,
  ArchiveTooLargeError,
  TransferError,
} from "./errors.ts";
import type {
  DbEpicRow,
  DbProjectRow,
  DbTicketRow,
  DbCommentRow,
  DbReviewFindingRow,
  DbDemoScriptRow,
  DbTicketWorkflowStateRow,
} from "./db-rows.ts";
import { safeJsonParse } from "./json.ts";
import { getDataDir } from "./db.ts";

// ============================================
// Internal Helpers
// ============================================

function getUsername(): string {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}

function getAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function getAttachmentsDir(): string {
  return join(getDataDir(), "attachments");
}

function toExportedTicket(row: DbTicketRow): ExportedTicket {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    position: row.position,
    epicId: row.epic_id,
    tags: safeJsonParse<string[]>(row.tags, []),
    subtasks: safeJsonParse(row.subtasks, []),
    isBlocked: row.is_blocked === 1,
    blockedReason: row.blocked_reason,
    attachments: safeJsonParse(row.attachments, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    // Deliberately excluded: linkedFiles, linkedCommits, branchName, prNumber, prUrl, prStatus
  };
}

function toExportedComment(row: DbCommentRow): ExportedComment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    content: row.content,
    author: row.author,
    type: row.type,
    createdAt: row.created_at,
  };
}

function toExportedFinding(row: DbReviewFindingRow): ExportedReviewFinding {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    iteration: row.iteration,
    agent: row.agent,
    severity: row.severity,
    category: row.category,
    description: row.description,
    filePath: row.file_path,
    lineNumber: row.line_number,
    suggestedFix: row.suggested_fix,
    status: row.status,
    fixedAt: row.fixed_at,
    createdAt: row.created_at,
  };
}

function toExportedDemoScript(row: DbDemoScriptRow): ExportedDemoScript {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    steps: safeJsonParse(row.steps, []),
    generatedAt: row.generated_at,
    completedAt: row.completed_at,
    feedback: row.feedback,
    passed: row.passed === null ? null : row.passed === 1,
  };
}

function toExportedWorkflowState(row: DbTicketWorkflowStateRow): ExportedWorkflowState {
  return {
    ticketId: row.ticket_id,
    currentPhase: row.current_phase,
    reviewIteration: row.review_iteration,
    findingsCount: row.findings_count,
    findingsFixed: row.findings_fixed,
    demoGenerated: row.demo_generated === 1,
  };
}

interface DbEpicWorkflowRow {
  id: string;
  epic_id: string;
  tickets_total: number;
  tickets_done: number;
  learnings: string | null;
}

function toExportedEpicWorkflowState(row: DbEpicWorkflowRow): ExportedEpicWorkflowState {
  return {
    epicId: row.epic_id,
    ticketsTotal: row.tickets_total,
    ticketsDone: row.tickets_done,
    learnings: safeJsonParse(row.learnings, []),
  };
}

/**
 * Read attachment files for a list of tickets, returning buffers and metadata.
 * Missing files produce warnings, not failures.
 */
function gatherAttachments(
  tickets: ExportedTicket[],
  warnings: string[]
): { buffers: Map<string, Buffer>; files: ExportedAttachmentFile[] } {
  const buffers = new Map<string, Buffer>();
  const files: ExportedAttachmentFile[] = [];
  const attachmentsDir = getAttachmentsDir();

  for (const ticket of tickets) {
    for (const att of ticket.attachments) {
      const filePath = join(attachmentsDir, ticket.id, att.filename);
      const archivePath = `attachments/${ticket.id}/${att.filename}`;

      if (existsSync(filePath)) {
        try {
          buffers.set(archivePath, readFileSync(filePath));
          files.push({
            archivePath,
            originalTicketId: ticket.id,
            filename: att.filename,
          });
        } catch {
          warnings.push(`Could not read attachment: ${filePath}`);
        }
      } else {
        warnings.push(`Attachment file not found on disk: ${filePath}`);
      }
    }
  }

  return { buffers, files };
}

/**
 * Gather all related data for a set of tickets.
 */
function gatherTicketRelatedData(db: DbHandle, ticketIds: string[]) {
  if (ticketIds.length === 0) {
    return { comments: [], findings: [], demoScripts: [], workflowStates: [] };
  }

  const placeholders = ticketIds.map(() => "?").join(",");

  const commentRows = db
    .prepare(`SELECT * FROM ticket_comments WHERE ticket_id IN (${placeholders}) ORDER BY created_at`)
    .all(...ticketIds) as DbCommentRow[];

  const findingRows = db
    .prepare(`SELECT * FROM review_findings WHERE ticket_id IN (${placeholders}) ORDER BY created_at`)
    .all(...ticketIds) as DbReviewFindingRow[];

  const demoRows = db
    .prepare(`SELECT * FROM demo_scripts WHERE ticket_id IN (${placeholders})`)
    .all(...ticketIds) as DbDemoScriptRow[];

  const workflowRows = db
    .prepare(`SELECT * FROM ticket_workflow_state WHERE ticket_id IN (${placeholders})`)
    .all(...ticketIds) as DbTicketWorkflowStateRow[];

  return {
    comments: commentRows.map(toExportedComment),
    findings: findingRows.map(toExportedFinding),
    demoScripts: demoRows.map(toExportedDemoScript),
    workflowStates: workflowRows.map(toExportedWorkflowState),
  };
}

// ============================================
// Export Functions
// ============================================

/**
 * Gather all data for an epic export.
 */
export function gatherEpicExportData(db: DbHandle, epicId: string): ExportResult {
  const epic = db.prepare("SELECT * FROM epics WHERE id = ?").get(epicId) as
    | DbEpicRow
    | undefined;
  if (!epic) throw new EpicNotFoundError(epicId);

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(epic.project_id) as
    | DbProjectRow
    | undefined;
  if (!project) throw new ProjectNotFoundError(epic.project_id);

  const ticketRows = db
    .prepare("SELECT * FROM tickets WHERE epic_id = ? ORDER BY position")
    .all(epicId) as DbTicketRow[];

  const tickets = ticketRows.map(toExportedTicket);
  const ticketIds = tickets.map((t) => t.id);
  const { comments, findings, demoScripts, workflowStates } = gatherTicketRelatedData(
    db,
    ticketIds
  );

  // Epic workflow state (learnings)
  const epicWorkflowRow = db
    .prepare(
      "SELECT id, epic_id, tickets_total, tickets_done, learnings FROM epic_workflow_state WHERE epic_id = ?"
    )
    .get(epicId) as DbEpicWorkflowRow | undefined;
  const epicWorkflowStates = epicWorkflowRow ? [toExportedEpicWorkflowState(epicWorkflowRow)] : [];

  const warnings: string[] = [];
  const { buffers, files } = gatherAttachments(tickets, warnings);

  const exportedEpic: ExportedEpic = {
    id: epic.id,
    title: epic.title,
    description: epic.description,
    color: epic.color,
    createdAt: epic.created_at,
  };

  const manifest: BrainDumpManifest = {
    version: MANIFEST_VERSION,
    exportType: "epic",
    exportedAt: new Date().toISOString(),
    exportedBy: getUsername(),
    appVersion: getAppVersion(),
    sourceProject: { name: project.name },
    epics: [exportedEpic],
    tickets,
    comments,
    reviewFindings: findings,
    demoScripts,
    workflowStates,
    epicWorkflowStates,
    attachmentFiles: files,
  };

  // Size check
  const manifestSize = Buffer.byteLength(JSON.stringify(manifest));
  let totalSize = manifestSize;
  for (const buf of buffers.values()) {
    totalSize += buf.length;
  }
  if (totalSize > MAX_ARCHIVE_SIZE_BYTES) {
    throw new ArchiveTooLargeError(totalSize, MAX_ARCHIVE_SIZE_BYTES);
  }

  return { manifest, attachmentBuffers: buffers };
}

/**
 * Gather all data for a project export (all epics + orphan tickets).
 */
export function gatherProjectExportData(db: DbHandle, projectId: string): ExportResult {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as
    | DbProjectRow
    | undefined;
  if (!project) throw new ProjectNotFoundError(projectId);

  const epicRows = db
    .prepare("SELECT * FROM epics WHERE project_id = ? ORDER BY created_at")
    .all(projectId) as DbEpicRow[];

  const epics: ExportedEpic[] = epicRows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    color: e.color,
    createdAt: e.created_at,
  }));

  // All tickets in the project (includes orphans with no epic)
  const ticketRows = db
    .prepare("SELECT * FROM tickets WHERE project_id = ? ORDER BY position")
    .all(projectId) as DbTicketRow[];

  const tickets = ticketRows.map(toExportedTicket);
  const ticketIds = tickets.map((t) => t.id);
  const { comments, findings, demoScripts, workflowStates } = gatherTicketRelatedData(
    db,
    ticketIds
  );

  // Epic workflow states for all epics in the project
  const epicIds = epicRows.map((e) => e.id);
  let epicWorkflowStates: ExportedEpicWorkflowState[] = [];
  if (epicIds.length > 0) {
    const ePlaceholders = epicIds.map(() => "?").join(",");
    const epicWorkflowRows = db
      .prepare(
        `SELECT id, epic_id, tickets_total, tickets_done, learnings FROM epic_workflow_state WHERE epic_id IN (${ePlaceholders})`
      )
      .all(...epicIds) as DbEpicWorkflowRow[];
    epicWorkflowStates = epicWorkflowRows.map(toExportedEpicWorkflowState);
  }

  const warnings: string[] = [];
  const { buffers, files } = gatherAttachments(tickets, warnings);

  const manifest: BrainDumpManifest = {
    version: MANIFEST_VERSION,
    exportType: "project",
    exportedAt: new Date().toISOString(),
    exportedBy: getUsername(),
    appVersion: getAppVersion(),
    sourceProject: { name: project.name },
    epics,
    tickets,
    comments,
    reviewFindings: findings,
    demoScripts,
    workflowStates,
    epicWorkflowStates,
    attachmentFiles: files,
  };

  const manifestSize = Buffer.byteLength(JSON.stringify(manifest));
  let totalSize = manifestSize;
  for (const buf of buffers.values()) {
    totalSize += buf.length;
  }
  if (totalSize > MAX_ARCHIVE_SIZE_BYTES) {
    throw new ArchiveTooLargeError(totalSize, MAX_ARCHIVE_SIZE_BYTES);
  }

  return { manifest, attachmentBuffers: buffers };
}

// ============================================
// Import Function
// ============================================

/**
 * Import data from a manifest into a target project.
 *
 * - Generates fresh UUIDs for all entities
 * - Remaps all foreign keys (epicId, ticketId)
 * - Adds `shared-by:{username}` tag to every imported ticket
 * - Adds provenance comment to every imported ticket
 * - Handles conflict resolution for epic name collisions
 * - Writes attachment files to disk
 */
export function importData(params: ImportParams): ImportResult {
  const { db, manifest, attachmentBuffers, targetProjectId, resetStatuses, conflictResolution } =
    params;

  // Validate target project exists
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(targetProjectId) as
    | DbProjectRow
    | undefined;
  if (!project) throw new ProjectNotFoundError(targetProjectId);

  const warnings: string[] = [];
  const idMap: Record<string, string> = {};
  const now = new Date().toISOString();
  const sharedByTag = `shared-by:${manifest.exportedBy}`;

  // Build epic name conflict map
  const existingEpics = db
    .prepare("SELECT id, title FROM epics WHERE project_id = ?")
    .all(targetProjectId) as Array<{ id: string; title: string }>;
  const existingEpicByTitle = new Map(existingEpics.map((e) => [e.title, e.id]));

  // Find the highest position in each status column for the target project
  const maxPositionRow = db
    .prepare("SELECT MAX(position) as max_pos FROM tickets WHERE project_id = ?")
    .get(targetProjectId) as { max_pos: number | null } | undefined;
  let nextPosition = (maxPositionRow?.max_pos ?? 0) + 1;

  let epicCount = 0;
  let ticketCount = 0;
  let commentCount = 0;
  let findingCount = 0;
  let demoScriptCount = 0;
  let attachmentCount = 0;

  db.prepare("BEGIN").run();
  try {
    // ---- Phase 1: Import Epics ----
    for (const epic of manifest.epics) {
      const existingId = existingEpicByTitle.get(epic.title);

      if (existingId && conflictResolution === "replace") {
        // Delete existing epic's tickets and related data (cascade), then reuse the ID
        db.prepare("DELETE FROM tickets WHERE epic_id = ?").run(existingId);
        db.prepare("DELETE FROM epic_workflow_state WHERE epic_id = ?").run(existingId);
        db.prepare("UPDATE epics SET description = ?, color = ?, created_at = ? WHERE id = ?").run(
          epic.description,
          epic.color,
          epic.createdAt,
          existingId
        );
        idMap[epic.id] = existingId;
        epicCount++;
      } else if (existingId && conflictResolution === "merge") {
        // Reuse existing epic ID, tickets will be merged below
        idMap[epic.id] = existingId;
        epicCount++;
      } else {
        // "create-new" or no conflict
        const newId = randomUUID();
        const title =
          existingId && conflictResolution === "create-new"
            ? `${epic.title} (from ${manifest.exportedBy})`
            : epic.title;

        db.prepare(
          "INSERT INTO epics (id, title, description, project_id, color, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(newId, title, epic.description, targetProjectId, epic.color, epic.createdAt);
        idMap[epic.id] = newId;
        epicCount++;
      }
    }

    // ---- Phase 2: Import Tickets ----
    // For merge mode, build a title→id map of existing tickets in each epic
    const existingTicketsByEpicTitle = new Map<string, Map<string, string>>();
    if (conflictResolution === "merge") {
      for (const epic of manifest.epics) {
        const newEpicId = idMap[epic.id];
        if (newEpicId) {
          const existingTickets = db
            .prepare("SELECT id, title FROM tickets WHERE epic_id = ?")
            .all(newEpicId) as Array<{ id: string; title: string }>;
          const titleMap = new Map(existingTickets.map((t) => [t.title, t.id]));
          existingTicketsByEpicTitle.set(epic.id, titleMap);
        }
      }
    }

    for (const ticket of manifest.tickets) {
      const newEpicId = ticket.epicId ? (idMap[ticket.epicId] ?? null) : null;
      const tags = [...ticket.tags, sharedByTag];
      const position = nextPosition++;
      const status = resetStatuses ? "backlog" : ticket.status;

      // In merge mode, check if a ticket with the same title exists in the target epic
      if (conflictResolution === "merge" && ticket.epicId) {
        const titleMap = existingTicketsByEpicTitle.get(ticket.epicId);
        const existingTicketId = titleMap?.get(ticket.title);

        if (existingTicketId) {
          // Update existing ticket with imported data
          db.prepare(
            `UPDATE tickets SET description = ?, status = ?, priority = ?,
             tags = ?, subtasks = ?, is_blocked = ?, blocked_reason = ?,
             attachments = ?, updated_at = ?, completed_at = ?
             WHERE id = ?`
          ).run(
            ticket.description,
            status,
            ticket.priority,
            JSON.stringify(tags),
            JSON.stringify(ticket.subtasks),
            ticket.isBlocked ? 1 : 0,
            ticket.blockedReason,
            JSON.stringify(ticket.attachments),
            now,
            ticket.completedAt,
            existingTicketId
          );
          idMap[ticket.id] = existingTicketId;
          ticketCount++;
          continue;
        }
      }

      // Create new ticket
      const newId = randomUUID();
      db.prepare(
        `INSERT INTO tickets (id, title, description, status, priority, position, project_id, epic_id,
         tags, subtasks, is_blocked, blocked_reason, attachments, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId,
        ticket.title,
        ticket.description,
        status,
        ticket.priority,
        position,
        targetProjectId,
        newEpicId,
        JSON.stringify(tags),
        JSON.stringify(ticket.subtasks),
        ticket.isBlocked ? 1 : 0,
        ticket.blockedReason,
        JSON.stringify(ticket.attachments),
        ticket.createdAt,
        now,
        ticket.completedAt
      );
      idMap[ticket.id] = newId;
      ticketCount++;
    }

    // ---- Phase 3: Import Comments + Provenance ----
    for (const comment of manifest.comments) {
      const newTicketId = idMap[comment.ticketId];
      if (!newTicketId) {
        warnings.push(`Skipped comment ${comment.id}: ticket ${comment.ticketId} not mapped`);
        continue;
      }
      const newId = randomUUID();
      db.prepare(
        "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(newId, newTicketId, comment.content, comment.author, comment.type, comment.createdAt);
      idMap[comment.id] = newId;
      commentCount++;
    }

    // Add provenance comment to each imported ticket
    for (const ticket of manifest.tickets) {
      const newTicketId = idMap[ticket.id];
      if (!newTicketId) continue;
      const provenanceId = randomUUID();
      const provenanceContent = `Imported from "${manifest.sourceProject.name}" by ${manifest.exportedBy} on ${manifest.exportedAt} (${manifest.exportType} export, v${manifest.appVersion})`;
      db.prepare(
        "INSERT INTO ticket_comments (id, ticket_id, content, author, type, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(provenanceId, newTicketId, provenanceContent, "brain-dump", "comment", now);
      commentCount++;
    }

    // ---- Phase 4: Import Review Findings ----
    for (const finding of manifest.reviewFindings) {
      const newTicketId = idMap[finding.ticketId];
      if (!newTicketId) {
        warnings.push(
          `Skipped finding ${finding.id}: ticket ${finding.ticketId} not mapped`
        );
        continue;
      }
      const newId = randomUUID();
      db.prepare(
        `INSERT INTO review_findings (id, ticket_id, iteration, agent, severity, category, description,
         file_path, line_number, suggested_fix, status, fixed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId,
        newTicketId,
        finding.iteration,
        finding.agent,
        finding.severity,
        finding.category,
        finding.description,
        finding.filePath,
        finding.lineNumber,
        finding.suggestedFix,
        finding.status,
        finding.fixedAt,
        finding.createdAt
      );
      idMap[finding.id] = newId;
      findingCount++;
    }

    // ---- Phase 5: Import Demo Scripts ----
    for (const demo of manifest.demoScripts) {
      const newTicketId = idMap[demo.ticketId];
      if (!newTicketId) {
        warnings.push(
          `Skipped demo script ${demo.id}: ticket ${demo.ticketId} not mapped`
        );
        continue;
      }
      const newId = randomUUID();
      db.prepare(
        `INSERT INTO demo_scripts (id, ticket_id, steps, generated_at, completed_at, feedback, passed)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId,
        newTicketId,
        JSON.stringify(demo.steps),
        demo.generatedAt,
        demo.completedAt,
        demo.feedback,
        demo.passed === null ? null : demo.passed ? 1 : 0
      );
      idMap[demo.id] = newId;
      demoScriptCount++;
    }

    // ---- Phase 6: Import Workflow States ----
    for (const ws of manifest.workflowStates) {
      const newTicketId = idMap[ws.ticketId];
      if (!newTicketId) continue;
      const newId = randomUUID();
      db.prepare(
        `INSERT OR IGNORE INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration,
         findings_count, findings_fixed, demo_generated, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId,
        newTicketId,
        ws.currentPhase,
        ws.reviewIteration,
        ws.findingsCount,
        ws.findingsFixed,
        ws.demoGenerated ? 1 : 0,
        now,
        now
      );
    }

    for (const ews of manifest.epicWorkflowStates) {
      const newEpicId = idMap[ews.epicId];
      if (!newEpicId) continue;
      const newId = randomUUID();
      db.prepare(
        `INSERT OR IGNORE INTO epic_workflow_state (id, epic_id, tickets_total, tickets_done, learnings, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId,
        newEpicId,
        ews.ticketsTotal,
        ews.ticketsDone,
        JSON.stringify(ews.learnings),
        now,
        now
      );
    }

    db.prepare("COMMIT").run();
  } catch (error) {
    db.prepare("ROLLBACK").run();
    throw error instanceof TransferError
      ? error
      : new TransferError(
          `Import failed: ${error instanceof Error ? error.message : String(error)}`
        );
  }

  // ---- Phase 7: Write Attachment Files (outside transaction) ----
  const attachmentsDir = getAttachmentsDir();
  for (const file of manifest.attachmentFiles) {
    const newTicketId = idMap[file.originalTicketId];
    if (!newTicketId) continue;

    const buffer = attachmentBuffers.get(file.archivePath);
    if (!buffer) {
      warnings.push(`Attachment buffer missing for: ${file.archivePath}`);
      continue;
    }

    const targetDir = join(attachmentsDir, newTicketId);
    try {
      if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, file.filename), buffer);
      attachmentCount++;
    } catch {
      warnings.push(`Failed to write attachment: ${file.archivePath}`);
    }
  }

  return {
    epicCount,
    ticketCount,
    commentCount,
    findingCount,
    demoScriptCount,
    attachmentCount,
    idMap,
    warnings,
  };
}
