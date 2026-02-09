import { createServerFn } from "@tanstack/react-start";
import { db } from "../lib/db";
import { tickets, projects, epics } from "../lib/schema";
import { eq, and, not } from "drizzle-orm";
import type { Subtask } from "./tickets";
import { safeJsonParse } from "../lib/utils";

// Get formatted context for Claude Code
export const getTicketContext = createServerFn({ method: "GET" })
  .inputValidator((ticketId: string) => {
    if (!ticketId) {
      throw new Error("Ticket ID is required");
    }
    return ticketId;
  })
  .handler(({ data: ticketId }) => {
    // Get the ticket first (required for dependent queries)
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    // Get related data - better-sqlite3 is synchronous so no parallelization needed
    const project = db.select().from(projects).where(eq(projects.id, ticket.projectId)).get();

    const epic = ticket.epicId
      ? db.select().from(epics).where(eq(epics.id, ticket.epicId)).get()
      : null;

    const relatedTickets = ticket.epicId
      ? db
          .select()
          .from(tickets)
          .where(
            and(
              eq(tickets.epicId, ticket.epicId),
              eq(tickets.status, "done"),
              not(eq(tickets.id, ticket.id))
            )
          )
          .orderBy(tickets.completedAt)
          .limit(5)
          .all()
      : [];

    if (!project) {
      throw new Error(`Project not found: ${ticket.projectId}`);
    }

    // Parse subtasks
    const subtasks = safeJsonParse<Subtask[]>(ticket.subtasks, []);

    // Parse linked files
    const linkedFiles = safeJsonParse<string[]>(ticket.linkedFiles, []);

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

    // Description
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
    if (relatedTickets.length > 0) {
      contextParts.push("## Related Completed Work");
      for (const related of relatedTickets) {
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
    contextParts.push("3. Write code → run `pnpm type-check && pnpm lint && pnpm test` → commit");
    contextParts.push(
      `4. \`workflow({ action: "complete-work", ticketId: "${ticket.id}", summary: "..." })\` → moves to ai_review`
    );
    contextParts.push(
      '5. Self-review → `review({ action: "submit-finding", ... })` for each issue → fix → `review({ action: "mark-fixed", ... })` → verify `review({ action: "check-complete", ticketId: "..." })`'
    );
    contextParts.push(
      `6. \`review({ action: "generate-demo", ticketId: "${ticket.id}", steps: [...] })\` → then STOP for human approval`
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
