/**
 * Learning reconciliation business logic for the core layer.
 *
 * Extracted from mcp-server/tools/learnings.ts.
 * All functions take a DbHandle and return typed results or throw CoreError subclasses.
 */

import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import type { DbHandle, Learning, LearningType, EpicInsight } from "./types.ts";
import { TicketNotFoundError, EpicNotFoundError, InvalidStateError } from "./errors.ts";
import { addComment } from "./comment.ts";
import { listComments } from "./comment.ts";

// ============================================
// Internal DB Row Types
// ============================================

interface TicketRow {
  id: string;
  title: string;
  status: string;
  epic_id: string | null;
}

interface DbEpicWorkflowState {
  id: string;
  epic_id: string;
  tickets_total: number;
  tickets_done: number;
  learnings: string | null;
  created_at: string;
  updated_at: string;
}

interface DbEpicRow {
  id: string;
  title: string;
  description: string | null;
  project_id: string;
}

interface CountResult {
  count: number;
}

// ============================================
// Public Types
// ============================================

export interface LearningEntry {
  ticketId: string;
  ticketTitle: string;
  learnings: Learning[];
  appliedAt: string;
}

export interface DocUpdateResult {
  file: string;
  section: string;
  status: "success" | "failed";
  error?: string;
}

export interface ReconcileLearningsResult {
  ticketId: string;
  ticketTitle: string;
  learningsStored: number;
  docsUpdated: DocUpdateResult[];
  commentWarning?: string | undefined;
}

export interface GetEpicLearningsResult {
  epicId: string;
  epicTitle: string;
  ticketsCompleted: number;
  learnings: LearningEntry[];
}

export interface AutoExtractLearningsResult {
  epicId: string;
  epicTitle: string;
  ticketsProcessed: number;
  ticketsSkipped: number;
  totalLearningsExtracted: number;
  results: ReconcileLearningsResult[];
}

// ============================================
// Public API
// ============================================

/**
 * Extract and reconcile learnings from a completed ticket.
 * Stores learnings in epic workflow state and optionally updates project docs.
 */
export function reconcileLearnings(
  db: DbHandle,
  ticketId: string,
  learnings: Learning[],
  updateDocs: boolean = false
): ReconcileLearningsResult {
  const ticket = db
    .prepare("SELECT id, title, status, epic_id FROM tickets WHERE id = ?")
    .get(ticketId) as TicketRow | undefined;

  if (!ticket) {
    throw new TicketNotFoundError(ticketId);
  }

  if (ticket.status !== "done") {
    throw new InvalidStateError("ticket", ticket.status, "done", "reconcile learnings");
  }

  if (!ticket.epic_id) {
    throw new InvalidStateError(
      "ticket",
      "no epic",
      "assigned to an epic",
      "reconcile learnings (learnings are stored at the epic level)"
    );
  }

  const learningEntry: LearningEntry = {
    ticketId,
    ticketTitle: ticket.title,
    learnings,
    appliedAt: new Date().toISOString(),
  };

  const epicState = db
    .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
    .get(ticket.epic_id) as DbEpicWorkflowState | undefined;

  const now = new Date().toISOString();

  if (!epicState) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO epic_workflow_state (id, epic_id, tickets_total, tickets_done, learnings, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?, ?)`
    ).run(id, ticket.epic_id, JSON.stringify([learningEntry]), now, now);
  } else {
    const existingLearnings: LearningEntry[] = epicState.learnings
      ? JSON.parse(epicState.learnings)
      : [];
    existingLearnings.push(learningEntry);

    db.prepare(
      "UPDATE epic_workflow_state SET learnings = ?, updated_at = ? WHERE epic_id = ?"
    ).run(JSON.stringify(existingLearnings), now, ticket.epic_id);
  }

  // Apply documentation updates if requested
  const docsUpdated: DocUpdateResult[] = [];
  if (updateDocs) {
    for (const learning of learnings) {
      if (learning.suggestedUpdate) {
        const { file, section, content } = learning.suggestedUpdate;
        try {
          const filePath = file.startsWith("/") ? file : join(process.cwd(), file);

          let fileContent = "";
          if (existsSync(filePath)) {
            fileContent = readFileSync(filePath, "utf8");
          }

          const sectionMarker = `## ${section}`;
          let updated = false;

          if (fileContent.includes(sectionMarker)) {
            const lines = fileContent.split("\n");
            const sectionIndex = lines.findIndex((l) => l === sectionMarker);
            const nextSectionIndex = lines.findIndex(
              (l, i) => i > sectionIndex && l.startsWith("##")
            );

            if (nextSectionIndex !== -1) {
              lines.splice(nextSectionIndex, 0, content, "");
            } else {
              lines.push("", content);
            }

            fileContent = lines.join("\n");
            updated = true;
          } else {
            fileContent += `\n## ${section}\n${content}\n`;
            updated = true;
          }

          if (updated) {
            writeFileSync(filePath, fileContent, "utf8");
            docsUpdated.push({ file, section, status: "success" });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          docsUpdated.push({ file, section, status: "failed", error: errorMsg });
        }
      }
    }
  }

  // Update tickets_done count
  const ticketsDone = (
    db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ? AND status = 'done'")
      .get(ticket.epic_id) as CountResult
  ).count;

  db.prepare(
    "UPDATE epic_workflow_state SET tickets_done = ?, updated_at = ? WHERE epic_id = ?"
  ).run(ticketsDone, now, ticket.epic_id);

  // Create audit trail comment
  const learningsLines = learnings.map((l) => `- [${l.type}] ${l.description}`).join("\n");
  const successfulUpdates = docsUpdated.filter((u) => u.status === "success");
  const docsSection =
    successfulUpdates.length > 0
      ? `\n\nDocumentation updated:\n${successfulUpdates.map((u) => `- ${u.file} (${u.section})`).join("\n")}`
      : "";
  const commentContent = `Learnings reconciled from ticket.\n\nLearnings recorded:\n${learningsLines}${docsSection}`;

  let commentWarning: string | undefined;
  try {
    addComment(db, { ticketId, content: commentContent, type: "progress" });
  } catch (err) {
    commentWarning = `Audit trail comment was not saved: ${err instanceof Error ? err.message : String(err)}`;
  }

  return {
    ticketId,
    ticketTitle: ticket.title,
    learningsStored: learnings.length,
    docsUpdated,
    commentWarning,
  };
}

/**
 * Auto-extract learnings from completed tickets in an epic.
 * For each done ticket that doesn't already have learnings,
 * extracts a "workflow" learning from its work_summary comments.
 * Handles deduplication: tickets with existing learnings are skipped.
 */
export function autoExtractLearnings(db: DbHandle, epicId: string): AutoExtractLearningsResult {
  const epic = db.prepare("SELECT id, title FROM epics WHERE id = ?").get(epicId) as
    | DbEpicRow
    | undefined;

  if (!epic) {
    throw new EpicNotFoundError(epicId);
  }

  // Get all done tickets in this epic
  const doneTickets = db
    .prepare("SELECT id, title, status, epic_id FROM tickets WHERE epic_id = ? AND status = 'done'")
    .all(epicId) as TicketRow[];

  // Get existing learnings to check which tickets already have them
  const epicState = db
    .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
    .get(epicId) as DbEpicWorkflowState | undefined;

  const existingLearnings: LearningEntry[] = epicState?.learnings
    ? JSON.parse(epicState.learnings)
    : [];

  const ticketIdsWithLearnings = new Set(existingLearnings.map((l) => l.ticketId));

  const results: ReconcileLearningsResult[] = [];
  let ticketsSkipped = 0;
  let totalLearningsExtracted = 0;

  for (const ticket of doneTickets) {
    if (ticketIdsWithLearnings.has(ticket.id)) {
      ticketsSkipped++;
      continue;
    }

    const learnings = extractLearningsFromTicket(db, ticket.id, ticket.title);

    if (learnings.length === 0) {
      continue;
    }

    const result = reconcileLearnings(db, ticket.id, learnings);
    results.push(result);
    totalLearningsExtracted += result.learningsStored;
  }

  return {
    epicId,
    epicTitle: epic.title,
    ticketsProcessed: results.length,
    ticketsSkipped,
    totalLearningsExtracted,
    results,
  };
}

/**
 * Extract learnings from a ticket's comments and review findings.
 * Work summaries become "workflow" learnings, fixed review findings become "anti-pattern" learnings.
 */
/**
 * Categorize a bullet point based on keywords.
 * Returns the most specific type that matches.
 */
function categorizeBullet(text: string): LearningType {
  const lower = text.toLowerCase();

  // Anti-patterns: bugs, fixes, workarounds, contradictions
  if (/\b(fix|bug|broke|crash|fail|workaround|contradict|regression|revert)\b/.test(lower)) {
    return "anti-pattern";
  }

  // Tool usage: scripts, CLI, hooks, commands, libraries
  if (/\b(script|hook|cli|command|tool|parser|migration|drizzle|sqlite|npm|pnpm)\b/.test(lower)) {
    return "tool-usage";
  }

  // Patterns: added, created, implemented with architectural significance
  if (/\b(pattern|abstraction|reusable|generic|interface|architecture|design)\b/.test(lower)) {
    return "pattern";
  }

  return "workflow";
}

/**
 * Parse a work summary into individual bullet-point insights.
 * Strips markdown headers, extracts actionable lines, and categorizes each.
 */
function parseWorkSummaryIntoBullets(content: string): Learning[] {
  const learnings: Learning[] = [];

  // Strip markdown headers (## Work Summary, etc.)
  const stripped = content.replace(/^#{1,4}\s+.+$/gm, "").trim();
  if (!stripped) return learnings;

  // Split into lines and extract meaningful bullets
  const lines = stripped.split("\n");
  const bullets: string[] = [];
  let currentBullet = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Start of a new bullet (- or * or numbered list)
    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      if (currentBullet) bullets.push(currentBullet);
      currentBullet = line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "");
    } else if (line && currentBullet) {
      // Continuation of current bullet
      currentBullet += " " + line;
    } else if (line && !currentBullet) {
      // Standalone line (not a bullet) — treat as its own item
      currentBullet = line;
    } else if (!line && currentBullet) {
      // Empty line ends current bullet
      bullets.push(currentBullet);
      currentBullet = "";
    }
  }
  if (currentBullet) bullets.push(currentBullet);

  // If no bullets found, the whole thing is one block — skip it if too generic
  if (bullets.length === 0) return learnings;

  // Filter out noise: too short, or just "All checks pass" type lines
  const NOISE_PATTERNS = [
    /^all\s+(checks|tests)\s+pass/i,
    /^(type-check|lint|test).*pass/i,
    /^\(?\d+\s+(error|warning)/i,
    /^ticket\s+"[^"]+"\s+completed/i,
    /^all\s+(prior|previous)\s+implementation/i,
  ];

  for (const bullet of bullets) {
    const trimmed = bullet.trim();
    // Skip very short or noisy bullets
    if (trimmed.length < 15) continue;
    if (NOISE_PATTERNS.some((p) => p.test(trimmed))) continue;

    // Truncate individual bullets to a reasonable length
    const description = trimmed.length > 200 ? trimmed.slice(0, 197) + "..." : trimmed;
    const type = categorizeBullet(description);

    learnings.push({ type, description });
  }

  return learnings;
}

function extractLearningsFromTicket(
  db: DbHandle,
  ticketId: string,
  ticketTitle: string
): Learning[] {
  const learnings: Learning[] = [];

  // Extract from work_summary comments — parse into individual insights
  const comments = listComments(db, ticketId);
  const workSummaries = comments.filter((c) => c.type === "work_summary");

  for (const summary of workSummaries) {
    const content = summary.content.trim();
    if (content.length > 0) {
      const parsed = parseWorkSummaryIntoBullets(content);
      learnings.push(...parsed);
    }
  }

  // Extract from fixed review findings (critical/major only)
  interface FindingRow {
    description: string;
    severity: string;
    category: string;
  }
  const fixedFindings = db
    .prepare(
      `SELECT description, severity, category FROM review_findings
       WHERE ticket_id = ? AND status = 'fixed' AND severity IN ('critical', 'major')
       ORDER BY created_at ASC`
    )
    .all(ticketId) as FindingRow[];

  for (const finding of fixedFindings) {
    learnings.push({
      type: "anti-pattern",
      description: `[${finding.category}] ${finding.description}`,
    });
  }

  // If nothing meaningful extracted, add a basic completion note
  if (learnings.length === 0) {
    learnings.push({
      type: "workflow",
      description: `Ticket "${ticketTitle}" completed successfully.`,
    });
  }

  return learnings;
}

/**
 * Get all accumulated learnings for an epic.
 */
export function getEpicLearnings(db: DbHandle, epicId: string): GetEpicLearningsResult {
  const epic = db.prepare("SELECT id, title FROM epics WHERE id = ?").get(epicId) as
    | DbEpicRow
    | undefined;

  if (!epic) {
    throw new EpicNotFoundError(epicId);
  }

  const epicState = db
    .prepare("SELECT * FROM epic_workflow_state WHERE epic_id = ?")
    .get(epicId) as DbEpicWorkflowState | undefined;

  const learnings: LearningEntry[] = epicState?.learnings ? JSON.parse(epicState.learnings) : [];

  const ticketsCompleted = (
    db
      .prepare("SELECT COUNT(*) as count FROM tickets WHERE epic_id = ? AND status = 'done'")
      .get(epicId) as CountResult
  ).count;

  return {
    epicId,
    epicTitle: epic.title,
    ticketsCompleted,
    learnings,
  };
}

// ============================================
// Epic Analysis Context (for AI sessions)
// ============================================

export interface EpicAnalysisContext {
  epicId: string;
  epicTitle: string;
  projectPath: string;
  prompt: string;
}

/**
 * Gather epic context and build a prompt for AI analysis.
 * Provides the epic/ticket IDs and lets Claude explore sessions and data itself.
 */
export function gatherEpicAnalysisContext(db: DbHandle, epicId: string): EpicAnalysisContext {
  const epic = db
    .prepare("SELECT id, title, description, project_id FROM epics WHERE id = ?")
    .get(epicId) as DbEpicRow | undefined;

  if (!epic) throw new EpicNotFoundError(epicId);

  const project = db
    .prepare("SELECT id, name, path FROM projects WHERE id = ?")
    .get(epic.project_id) as { id: string; name: string; path: string } | undefined;

  if (!project) throw new Error(`Project not found for epic ${epicId}`);

  // Get ticket IDs and titles for reference
  const tickets = db
    .prepare("SELECT id, title, status FROM tickets WHERE epic_id = ? ORDER BY position")
    .all(epicId) as Array<{ id: string; title: string; status: string }>;

  const ticketList = tickets.map((t) => `- ${t.title} (${t.status}) — ID: ${t.id}`).join("\n");

  const prompt = `You have ONE job: analyze this epic and save structured insights. Follow these steps exactly.

## Step 1: Gather data (spend ~2 minutes max)

Run these commands to understand the epic:

\`\`\`bash
cd ${project.path}
pnpm brain-dump ticket list --epic ${epicId} --pretty
\`\`\`

Then for each done ticket, get its context:
\`\`\`bash
pnpm brain-dump context --ticket <TICKET_ID> --pretty
\`\`\`

Also scan Claude Code session transcripts for usage patterns:
\`\`\`bash
find ~/.claude/projects/ -name "*.jsonl" -newer /tmp/ 2>/dev/null | head -20
\`\`\`

Read the CLI reference for available tools: \`${project.path}/docs/cli.md\`

## Step 2: Analyze and produce insights

From the data, identify:
- **frequent-actions**: What patterns repeat across sessions? What does the user do over and over?
- **skills**: Reusable workflows that could become Claude Code skills (e.g., "always run lint+typecheck+test after changes")
- **plugins**: Things that could become standalone Claude Code plugins or tools
- **agents**: Tasks that could run autonomously as subagents without human oversight
- **project-docs**: Conventions or patterns that belong in CLAUDE.md

## Step 3: SAVE the insights (REQUIRED — this is the whole point)

Build a JSON array with your findings and save it. Each item needs a category, title, and description.
Keep titles short (3-8 words). Keep descriptions to 1-2 sentences max.

\`\`\`bash
cat > /tmp/insights.json << 'EOF'
[
  {"category": "frequent-actions", "title": "Example title", "description": "One sentence about what you observed."},
  {"category": "skills", "title": "Example skill", "description": "What this skill would automate."},
  {"category": "plugins", "title": "Example plugin", "description": "What this plugin would do."},
  {"category": "agents", "title": "Example agent", "description": "What this agent would handle autonomously."},
  {"category": "project-docs", "title": "Example convention", "description": "What should be documented in CLAUDE.md."}
]
EOF
pnpm brain-dump epic save-insights --epic ${epicId} --insights-file /tmp/insights.json
\`\`\`

You MUST run the save-insights command above. If you don't, the analysis is wasted.

## Epic: ${epic.title}

${epic.description ?? "No description."}

## Tickets in this epic

${ticketList}`;

  return {
    epicId,
    epicTitle: epic.title,
    projectPath: project.path,
    prompt,
  };
}

// ============================================
// Epic Insights (AI-generated analysis)
// ============================================

export interface SaveEpicInsightsResult {
  epicId: string;
  insightsSaved: number;
}

export interface GetEpicInsightsResult {
  epicId: string;
  epicTitle: string;
  insights: EpicInsight[];
  analyzedAt: string | null;
}

/**
 * Save AI-generated insights for an epic.
 * Replaces any existing insights (each analysis is a fresh view).
 */
export function saveEpicInsights(
  db: DbHandle,
  epicId: string,
  insights: EpicInsight[]
): SaveEpicInsightsResult {
  const epic = db.prepare("SELECT id FROM epics WHERE id = ?").get(epicId) as
    | { id: string }
    | undefined;

  if (!epic) throw new EpicNotFoundError(epicId);

  const now = new Date().toISOString();
  const insightsJson = JSON.stringify(insights);

  const epicState = db
    .prepare("SELECT id FROM epic_workflow_state WHERE epic_id = ?")
    .get(epicId) as { id: string } | undefined;

  if (!epicState) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO epic_workflow_state (id, epic_id, tickets_total, tickets_done, insights, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?, ?)`
    ).run(id, epicId, insightsJson, now, now);
  } else {
    db.prepare("UPDATE epic_workflow_state SET insights = ?, updated_at = ? WHERE epic_id = ?").run(
      insightsJson,
      now,
      epicId
    );
  }

  return { epicId, insightsSaved: insights.length };
}

/**
 * Get AI-generated insights for an epic.
 */
export function getEpicInsights(db: DbHandle, epicId: string): GetEpicInsightsResult {
  const epic = db.prepare("SELECT id, title FROM epics WHERE id = ?").get(epicId) as
    | DbEpicRow
    | undefined;

  if (!epic) throw new EpicNotFoundError(epicId);

  const epicState = db
    .prepare("SELECT insights, updated_at FROM epic_workflow_state WHERE epic_id = ?")
    .get(epicId) as { insights: string | null; updated_at: string } | undefined;

  const insights: EpicInsight[] = epicState?.insights ? JSON.parse(epicState.insights) : [];

  return {
    epicId,
    epicTitle: epic.title,
    insights,
    analyzedAt: epicState?.insights ? epicState.updated_at : null,
  };
}

/**
 * Clear all learnings for an epic so they can be re-extracted.
 */
export function clearEpicLearnings(
  db: DbHandle,
  epicId: string
): { epicId: string; cleared: boolean } {
  const epic = db.prepare("SELECT id FROM epics WHERE id = ?").get(epicId) as
    | { id: string }
    | undefined;
  if (!epic) throw new EpicNotFoundError(epicId);

  const result = db
    .prepare("UPDATE epic_workflow_state SET learnings = NULL, updated_at = ? WHERE epic_id = ?")
    .run(new Date().toISOString(), epicId);

  return { epicId, cleared: result.changes > 0 };
}
