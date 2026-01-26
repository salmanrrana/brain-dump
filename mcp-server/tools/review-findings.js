/**
 * Review findings management tools for Brain Dump MCP server.
 * Handles submitting, updating, and querying findings from code review agents.
 * @module tools/review-findings
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { log } from "../lib/logging.js";
import { addComment } from "../lib/comment-utils.js";
import { getActiveTelemetrySession, logMcpCallEvent, withTelemetry } from "../lib/telemetry-self-log.js";

const AGENTS = ["code-reviewer", "silent-failure-hunter", "code-simplifier"];
const SEVERITIES = ["critical", "major", "minor", "suggestion"];

/**
 * Register review findings tools with the MCP server.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {import("better-sqlite3").Database} db
 */
export function registerReviewFindingsTools(server, db) {
  // Submit review finding
  server.tool(
    "submit_review_finding",
    `Submit a finding from a code review agent.

Validates that ticket is in ai_review status and creates/updates workflow state.
Automatically increments review iteration on first finding of the session.

Args:
  ticketId: The ticket ID to submit finding for
  agent: Which review agent found this ('code-reviewer', 'silent-failure-hunter', 'code-simplifier')
  severity: Finding severity ('critical', 'major', 'minor', 'suggestion')
  category: Category of finding (e.g., 'type-safety', 'error-handling', 'performance')
  description: Detailed description of the issue
  filePath: Optional file path where issue was found
  lineNumber: Optional line number
  suggestedFix: Optional suggestion for how to fix

Returns the created finding with ID and current counts.`,
    {
      ticketId: z.string().describe("Ticket ID"),
      agent: z.enum(AGENTS).describe("Review agent that found this"),
      severity: z.enum(SEVERITIES).describe("Finding severity"),
      category: z.string().describe("Category of finding"),
      description: z.string().describe("Detailed description"),
      filePath: z.string().optional().describe("File path affected"),
      lineNumber: z.number().optional().describe("Line number"),
      suggestedFix: z.string().optional().describe("Suggested fix"),
    },
    withTelemetry(db, "submit_review_finding", (params) => params.ticketId, async ({ ticketId, agent, severity, category, description, filePath, lineNumber, suggestedFix }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}\n\nUse list_tickets to see available tickets.` }],
          isError: true,
        };
      }

      if (ticket.status !== "ai_review") {
        return {
          content: [{ type: "text", text: `Ticket must be in ai_review status to submit findings.\nCurrent status: ${ticket.status}\n\nUse complete_ticket_work to move to ai_review first.` }],
          isError: true,
        };
      }

      // Get or create workflow state
      let workflowState = db.prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?").get(ticketId);
      if (!workflowState) {
        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO ticket_workflow_state (id, ticket_id, current_phase, review_iteration, findings_count, findings_fixed, demo_generated, created_at, updated_at)
           VALUES (?, ?, 'ai_review', 1, 0, 0, 0, ?, ?)`
        ).run(id, ticketId, now, now);
        workflowState = db.prepare("SELECT * FROM ticket_workflow_state WHERE ticket_id = ?").get(ticketId);
      }

      // Insert finding
      const findingId = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO review_findings (id, ticket_id, iteration, agent, severity, category, description, file_path, line_number, suggested_fix, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`
      ).run(
        findingId,
        ticketId,
        workflowState.review_iteration,
        agent,
        severity,
        category,
        description,
        filePath || null,
        lineNumber || null,
        suggestedFix || null,
        now
      );

      // Increment findings count
      const updatedAt = new Date().toISOString();
      db.prepare(
        "UPDATE ticket_workflow_state SET findings_count = findings_count + 1, updated_at = ? WHERE ticket_id = ?"
      ).run(updatedAt, ticketId);

      // Create progress comment (per spec: mandatory audit trail)
      const severityEmoji = { critical: "🔴", major: "🟠", minor: "🟡", suggestion: "💡" }[severity] || "📌";
      const commentContent = `Review finding: ${severityEmoji} [${severity}] ${category}\n\n${description}${filePath ? `\n\nFile: ${filePath}${lineNumber ? `:${lineNumber}` : ""}` : ""}${suggestedFix ? `\n\nSuggested fix:\n${suggestedFix}` : ""}`;
      const commentResult = addComment(db, ticketId, commentContent, null, "progress");
      const commentWarning = commentResult.success ? "" : `\n\n**Warning:** Audit trail comment was not saved: ${commentResult.error}`;

      log.info(`Finding submitted for ticket ${ticketId}: [${severity}] ${category}`);

      return {
        content: [{
          type: "text",
          text: `Finding submitted successfully!\n\nFinding ID: ${findingId}\nAgent: ${agent}\nSeverity: ${severity}\nCategory: ${category}\n\nTotal findings: ${workflowState.findings_count + 1}${commentWarning}`,
        }],
      };
    })
  );

  // Mark finding as fixed
  server.tool(
    "mark_finding_fixed",
    `Mark a review finding as fixed, won't fix, or duplicate.

Args:
  findingId: The finding ID to update
  status: New status ('fixed', 'wont_fix', 'duplicate')
  fixDescription: Optional description of how it was fixed

Returns the updated finding.`,
    {
      findingId: z.string().describe("Finding ID to update"),
      status: z.enum(["fixed", "wont_fix", "duplicate"]).describe("New status"),
      fixDescription: z.string().optional().describe("How the issue was fixed"),
    },
    async ({ findingId, status, fixDescription }) => {
      const finding = db.prepare("SELECT * FROM review_findings WHERE id = ?").get(findingId);
      if (!finding) {
        return {
          content: [{ type: "text", text: `Finding not found: ${findingId}` }],
          isError: true,
        };
      }

      // Self-logging for telemetry in non-hook environments (after finding lookup to get ticketId)
      const telemetrySession = getActiveTelemetrySession(db, finding.ticket_id);
      let correlationId = null;
      const startTime = Date.now();
      if (telemetrySession) {
        correlationId = logMcpCallEvent(db, {
          sessionId: telemetrySession.id,
          ticketId: telemetrySession.ticket_id,
          event: "start",
          toolName: "mark_finding_fixed",
          params: { findingId, status },
        });
      }

      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(finding.ticket_id);
      if (!ticket) {
        if (telemetrySession && correlationId) {
          logMcpCallEvent(db, {
            sessionId: telemetrySession.id,
            ticketId: telemetrySession.ticket_id,
            event: "end",
            toolName: "mark_finding_fixed",
            correlationId,
            success: false,
            durationMs: Date.now() - startTime,
            error: "Ticket not found",
          });
        }
        return {
          content: [{ type: "text", text: `Ticket not found for this finding` }],
          isError: true,
        };
      }

      // Update finding status
      const now = new Date().toISOString();
      const fixedAt = status === "fixed" ? now : null;
      db.prepare(
        "UPDATE review_findings SET status = ?, fixed_at = ? WHERE id = ?"
      ).run(status, fixedAt, findingId);

      // Increment findings_fixed if status is 'fixed'
      if (status === "fixed") {
        db.prepare(
          "UPDATE ticket_workflow_state SET findings_fixed = findings_fixed + 1, updated_at = ? WHERE ticket_id = ?"
        ).run(now, finding.ticket_id);

        // Check if all critical/major findings are now fixed
        const openCriticalMajor = db.prepare(
          "SELECT COUNT(*) as count FROM review_findings WHERE ticket_id = ? AND status = 'open' AND severity IN ('critical', 'major')"
        ).get(finding.ticket_id);

        if (openCriticalMajor.count === 0) {
          log.info(`All critical/major findings fixed for ticket ${finding.ticket_id}`);
        }
      }

      // Create progress comment (per spec: mandatory audit trail)
      const statusEmoji = { fixed: "✅", wont_fix: "⏭️", duplicate: "📋" }[status] || "📝";
      const contentLines = [
        `${statusEmoji} Finding marked as ${status}`,
        `Category: ${finding.category}`,
        `Severity: ${finding.severity}`,
      ];
      if (fixDescription) {
        contentLines.push(`\nFix description:\n${fixDescription}`);
      }
      const commentResult = addComment(db, finding.ticket_id, contentLines.join("\n"), null, "progress");
      const commentWarning = commentResult.success ? "" : `\n\n**Warning:** Audit trail comment was not saved: ${commentResult.error}`;

      log.info(`Finding ${findingId} marked as ${status}`);

      // Log successful completion to telemetry
      if (telemetrySession && correlationId) {
        logMcpCallEvent(db, {
          sessionId: telemetrySession.id,
          ticketId: telemetrySession.ticket_id,
          event: "end",
          toolName: "mark_finding_fixed",
          correlationId,
          success: true,
          durationMs: Date.now() - startTime,
        });
      }

      return {
        content: [{
          type: "text",
          text: `Finding marked as ${status}.\n\nUpdated: ${now}${commentWarning}`,
        }],
      };
    }
  );

  // Get review findings
  server.tool(
    "get_review_findings",
    `Get review findings for a ticket with optional filtering.

Args:
  ticketId: Ticket ID to get findings for
  status: Optional filter by status ('open', 'fixed', 'wont_fix', 'duplicate')
  severity: Optional filter by severity ('critical', 'major', 'minor', 'suggestion')
  agent: Optional filter by agent

Returns array of findings.`,
    {
      ticketId: z.string().describe("Ticket ID"),
      status: z.enum(["open", "fixed", "wont_fix", "duplicate"]).optional().describe("Filter by status"),
      severity: z.enum(SEVERITIES).optional().describe("Filter by severity"),
      agent: z.enum(AGENTS).optional().describe("Filter by agent"),
    },
    withTelemetry(db, "get_review_findings", (params) => params.ticketId, async ({ ticketId, status, severity, agent }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      let query = "SELECT * FROM review_findings WHERE ticket_id = ?";
      const params = [ticketId];

      if (status) {
        query += " AND status = ?";
        params.push(status);
      }
      if (severity) {
        query += " AND severity = ?";
        params.push(severity);
      }
      if (agent) {
        query += " AND agent = ?";
        params.push(agent);
      }

      query += " ORDER BY created_at DESC";

      const findings = db.prepare(query).all(...params);

      const summary = {
        total: findings.length,
        bySeverity: {
          critical: findings.filter(f => f.severity === "critical").length,
          major: findings.filter(f => f.severity === "major").length,
          minor: findings.filter(f => f.severity === "minor").length,
          suggestion: findings.filter(f => f.severity === "suggestion").length,
        },
        byStatus: {
          open: findings.filter(f => f.status === "open").length,
          fixed: findings.filter(f => f.status === "fixed").length,
          wont_fix: findings.filter(f => f.status === "wont_fix").length,
          duplicate: findings.filter(f => f.status === "duplicate").length,
        },
      };

      return {
        content: [{
          type: "text",
          text: `Found ${findings.length} finding(s).\n\n${JSON.stringify(summary, null, 2)}\n\nFindings:\n\n${findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.category} - ${f.status}\n   ${f.description}${f.file_path ? `\n   File: ${f.file_path}${f.line_number ? `:${f.line_number}` : ""}` : ""}`).join("\n\n")}`,
        }],
      };
    })
  );

  // Check if review is complete
  server.tool(
    "check_review_complete",
    `Check if all critical/major findings have been resolved.

Args:
  ticketId: Ticket ID to check

Returns object with completion status and counts.`,
    {
      ticketId: z.string().describe("Ticket ID"),
    },
    withTelemetry(db, "check_review_complete", (params) => params.ticketId, async ({ ticketId }) => {
      const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
      if (!ticket) {
        return {
          content: [{ type: "text", text: `Ticket not found: ${ticketId}` }],
          isError: true,
        };
      }

      const findings = db.prepare("SELECT * FROM review_findings WHERE ticket_id = ?").all(ticketId);

      const openCritical = findings.filter(f => f.severity === "critical" && f.status === "open").length;
      const openMajor = findings.filter(f => f.severity === "major" && f.status === "open").length;
      const openMinor = findings.filter(f => f.severity === "minor" && f.status === "open").length;
      const totalFixed = findings.filter(f => f.status === "fixed").length;

      const canProceed = openCritical === 0 && openMajor === 0;

      const result = {
        complete: canProceed,
        openCritical,
        openMajor,
        openMinor,
        totalFixed,
        canProceedToHumanReview: canProceed,
        totalFindings: findings.length,
      };

      const message = canProceed
        ? `✅ Review complete! All critical and major findings are resolved.\n\nTotal findings: ${findings.length}\nFixed: ${totalFixed}\nMinor/suggestions: ${openMinor}`
        : `❌ Cannot proceed to human review.\n\nOpen critical: ${openCritical}\nOpen major: ${openMajor}\nOpen minor/suggestions: ${openMinor}\n\nFix the critical and major findings first.`;

      return {
        content: [{
          type: "text",
          text: `${message}\n\n${JSON.stringify(result, null, 2)}`,
        }],
      };
    })
  );
}
