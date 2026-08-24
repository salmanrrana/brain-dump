import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { epics, projects } from "../lib/schema";
import { eq } from "drizzle-orm";
import { getTicketBriefing, type FailedVerificationSummary } from "../../core/ticket-briefing.ts";

function formatVerificationFailureContext(failure: FailedVerificationSummary): string {
  const lines = [
    `Verification run ${failure.runId} failed at ${failure.finishedAt} (round ${failure.round}).`,
    "",
  ];

  for (const step of failure.failedSteps) {
    const evidence = step.evidenceFiles.length
      ? step.evidenceFiles.map((file) => `${file.path} (${file.hash})`).join(", ")
      : "none";
    lines.push(`- Step ${step.order}: ${step.message}`);
    lines.push(`  Evidence: ${evidence}`);
  }

  return lines.join("\n");
}

// Get formatted context for Claude Code
export const getTicketContext = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => {
    if (!ticketId) {
      throw new Error("Ticket ID is required");
    }
    return ticketId;
  })
  .handler(({ data: ticketId }) => {
    const briefing = getTicketBriefing(sqlite, ticketId);
    const { ticket, epic, relatedDoneTickets, unaddressedChangeRequest, failedVerification } =
      briefing;

    const project = ticket.project;
    if (!project) {
      throw new Error(`Project not found: ${ticket.projectId}`);
    }
    const subtasks = ticket.subtasks;
    const linkedFiles = ticket.linkedFiles;

    // Build the context markdown
    const contextParts: string[] = [];

    // Task header
    contextParts.push(`# Task: ${ticket.title}`);
    contextParts.push("");

    // Project info
    contextParts.push("## Project");
    contextParts.push(`Name: ${project.name}`);
    contextParts.push(`Path: ${project.path}`);
    contextParts.push("");

    // Epic context
    if (epic) {
      contextParts.push("## Epic Context");
      contextParts.push(`**${epic.title}**`);
      if (epic.description) {
        contextParts.push("");
        contextParts.push(epic.description);
      }
      contextParts.push("");
    }

    if (ticket.status !== "done") {
      if (unaddressedChangeRequest) {
        contextParts.push("## Human Requested Changes - Fix This First");
        contextParts.push(unaddressedChangeRequest);
        contextParts.push("");
      }

      if (failedVerification) {
        contextParts.push("## Verification Failures - Fix This First");
        contextParts.push(formatVerificationFailureContext(failedVerification));
        contextParts.push("");
      }
    }

    if (ticket.description) {
      contextParts.push("## Description");
      contextParts.push(ticket.description);
      contextParts.push("");
    }

    // Subtasks
    if (subtasks.length > 0) {
      contextParts.push("## Subtasks");
      for (const subtask of subtasks) {
        const checkbox = subtask.completed ? "[x]" : "[ ]";
        contextParts.push(`- ${checkbox} ${subtask.text}`);
      }
      contextParts.push("");
    }

    // Relevant files
    if (linkedFiles.length > 0) {
      contextParts.push("## Relevant Files");
      for (const file of linkedFiles) {
        contextParts.push(`- ${file}`);
      }
      contextParts.push("");
    }

    // Related completed work
    if (relatedDoneTickets.length > 0) {
      contextParts.push("## Related Completed Work");
      for (const related of relatedDoneTickets) {
        const summary = related.description
          ? `${related.title}: ${related.description.slice(0, 100)}${related.description.length > 100 ? "..." : ""}`
          : related.title;
        contextParts.push(`- ${summary}`);
      }
      contextParts.push("");
    }

    // Priority and status info
    contextParts.push("## Status");
    contextParts.push(`Current status: ${ticket.status}`);
    if (ticket.priority) {
      contextParts.push(`Priority: ${ticket.priority}`);
    }
    if (ticket.isBlocked) {
      contextParts.push(`BLOCKED: ${ticket.blockedReason ?? "No reason provided"}`);
    }
    contextParts.push("");

    // Git workflow instructions
    contextParts.push("## Git Workflow");
    contextParts.push(
      `Start work by invoking \`workflow({ action: "start-work", ticketId: "${ticket.id}" })\` to create/check out the branch.`
    );
    contextParts.push("Do NOT create branches manually with git commands.");
    contextParts.push("Make commits with the format: `feat(" + ticket.id + "): <description>`");
    contextParts.push("");
    contextParts.push(
      "**IMPORTANT:** Never commit directly to main or dev. Always use feature branches."
    );
    contextParts.push("");

    // Mandatory workflow instructions
    contextParts.push("## MANDATORY Workflow (MCP tools — NOT local alternatives)");
    contextParts.push("");
    contextParts.push(
      "You MUST invoke these Brain Dump MCP tools literally. Do NOT use local git commands,"
    );
    contextParts.push("local review skills, or text descriptions as substitutes.");
    contextParts.push("");
    contextParts.push("Steps (each is a LITERAL MCP tool invocation):");
    contextParts.push(
      `1. \`workflow({ action: "start-work", ticketId: "${ticket.id}" })\` → creates branch, starts tracking`
    );
    contextParts.push(
      `2. \`session({ action: "create", ticketId: "${ticket.id}" })\` → creates session for state tracking`
    );
    contextParts.push(
      "3. Write code → discover and run this project's validation commands → add a test_report comment with exact pass/fail/skipped results → commit"
    );
    contextParts.push(
      `4. \`workflow({ action: "complete-work", ticketId: "${ticket.id}", summary: "..." })\` → moves to ai_review`
    );
    contextParts.push(
      '5. Self-review → `review({ action: "submit-finding", ... })` for each issue → fix → `review({ action: "mark-fixed", ... })` → verify `review({ action: "check-complete", ticketId: "..." })`'
    );
    contextParts.push(
      `6. \`review({ action: "generate-demo", ticketId: "${ticket.id}", steps: [...] })\` → then STOP for AI verification runner certification`
    );
    contextParts.push("");
    contextParts.push(
      "These are LITERAL tool calls. If you skip them, no record appears in Brain Dump."
    );
    contextParts.push("");

    const context = contextParts.join("\n");

    return {
      context,
      projectPath: project.path,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      projectName: project.name,
      epicName: epic?.title ?? null,
    };
  });

// Get context for epic work (mainly project path for workflow initialization)
export const getEpicContext = createServerFn({ method: "GET" })
  .inputValidator((epicId: string) => {
    if (!epicId) {
      throw new Error("Epic ID is required");
    }
    return epicId;
  })
  .handler(({ data: epicId }) => {
    // Get the epic first
    const epic = db.select().from(epics).where(eq(epics.id, epicId)).get();
    if (!epic) {
      throw new Error(`Epic not found: ${epicId}`);
    }

    // Get related project
    const project = db.select().from(projects).where(eq(projects.id, epic.projectId)).get();
    if (!project) {
      throw new Error(`Project not found: ${epic.projectId}`);
    }

    return {
      epicId: epic.id,
      epicTitle: epic.title,
      projectPath: project.path,
      projectName: project.name,
    };
  });
