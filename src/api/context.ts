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
  .handler(async ({ data: ticketId }) => {
    // Get the ticket
    const ticket = db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    // Get the project
    const project = db.select().from(projects).where(eq(projects.id, ticket.projectId)).get();
    if (!project) {
      throw new Error(`Project not found: ${ticket.projectId}`);
    }

    // Get the epic if it exists
    let epic = null;
    if (ticket.epicId) {
      epic = db.select().from(epics).where(eq(epics.id, ticket.epicId)).get();
    }

    // Get related completed tickets in same epic
    let relatedTickets: typeof ticket[] = [];
    if (ticket.epicId) {
      relatedTickets = db
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
        .all();
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
    const branchSlug = ticket.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);
    contextParts.push("## Git Workflow");
    contextParts.push("Before making changes, create a feature branch:");
    contextParts.push("```bash");
    contextParts.push("git fetch origin");
    contextParts.push(`git checkout -b claude/${ticket.id}-${branchSlug} origin/dev  # or origin/main if no dev branch`);
    contextParts.push("```");
    contextParts.push("");
    contextParts.push("Make commits with the format: `feat(" + ticket.id + "): <description>`");
    contextParts.push("");
    contextParts.push("**IMPORTANT:** Never commit directly to main or dev. Always use feature branches.");
    contextParts.push("");

    // MCP integration instructions
    contextParts.push("## When Complete");
    contextParts.push("When you finish this task:");
    contextParts.push("1. Ensure all changes are committed to your feature branch");
    contextParts.push("2. Push your branch and create a PR:");
    contextParts.push("   ```bash");
    contextParts.push("   git push -u origin <branch-name>");
    contextParts.push("   gh pr create --base dev --title \"feat(" + ticket.id + "): <description>\" --body \"<PR description>\"");
    contextParts.push("   ```");
    contextParts.push("3. Update the ticket status using the Brain Dump MCP server:");
    contextParts.push(`   - Use \`update_ticket_status\` with ticketId: "${ticket.id}" and status: "review"`);
    contextParts.push("   - Use \"done\" only after the PR is merged");
    contextParts.push("4. Add a work summary comment using `add_ticket_comment`:");
    contextParts.push(`   - ticketId: "${ticket.id}"`);
    contextParts.push("   - author: \"claude\"");
    contextParts.push("   - type: \"work_summary\"");
    contextParts.push("   - content: Summary of changes made, files modified, PR link, and any notes");
    contextParts.push("");
    contextParts.push("The MCP server is already configured - just call the tools directly.");
    contextParts.push("");

    const context = contextParts.join("\n");

    return {
      context,
      projectPath: project.path,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
    };
  });
