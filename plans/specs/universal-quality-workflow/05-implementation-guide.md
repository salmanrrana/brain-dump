## 6. Implementation Guide

### Step 1: Database Schema Updates

**File**: `src/lib/schema.ts`

```typescript
// Add ticket workflow state table
export const ticketWorkflowState = sqliteTable("ticket_workflow_state", {
  ticket_id: text("ticket_id")
    .primaryKey()
    .references(() => tickets.id, { onDelete: "cascade" }),

  // Implementation phase
  plan_written: integer("plan_written").notNull().default(0),
  validation_passed: integer("validation_passed").notNull().default(0),

  // AI Review phase
  ai_review_started: integer("ai_review_started").notNull().default(0),
  review_findings_count: integer("review_findings_count").notNull().default(0),
  review_iteration: integer("review_iteration").notNull().default(0),
  all_findings_fixed: integer("all_findings_fixed").notNull().default(0),

  // Human Review phase
  demo_script_generated: integer("demo_script_generated").notNull().default(0),
  demo_script: text("demo_script"),
  human_ran_demo: integer("human_ran_demo").notNull().default(0),
  human_feedback: text("human_feedback"),
  human_approved: integer("human_approved").notNull().default(0),

  // Completion
  learnings_reconciled: integer("learnings_reconciled").notNull().default(0),
  learnings: text("learnings"),

  // Timestamps
  started_at: text("started_at"),
  completed_at: text("completed_at"),
});

// Add epic workflow state table
export const epicWorkflowState = sqliteTable("epic_workflow_state", {
  epic_id: text("epic_id")
    .primaryKey()
    .references(() => epics.id, { onDelete: "cascade" }),

  // Completion tracking
  total_tickets: integer("total_tickets").notNull().default(0),
  completed_tickets: integer("completed_tickets").notNull().default(0),

  // DoD Audit
  dod_audit_passed: integer("dod_audit_passed").notNull().default(0),
  dod_audit_findings: text("dod_audit_findings"), // JSON array

  // Epic Review
  epic_review_passed: integer("epic_review_passed").notNull().default(0),
  epic_review_iteration: integer("epic_review_iteration").notNull().default(0),

  // Demo & Feedback
  epic_demo_script: text("epic_demo_script"),
  epic_human_feedback: text("epic_human_feedback"),
  epic_approved: integer("epic_approved").notNull().default(0),

  // Learnings & PR
  learnings_reconciled: integer("learnings_reconciled").notNull().default(0),
  pr_url: text("pr_url"),
  pr_number: integer("pr_number"),
});

// Add review findings table
export const reviewFindings = sqliteTable("review_findings", {
  id: text("id").primaryKey(),
  ticket_id: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  epic_id: text("epic_id")
    .notNull()
    .references(() => epics.id, { onDelete: "cascade" }),

  agent: text("agent").notNull(),
  priority: text("priority").notNull(), // P0-P4

  file_path: text("file_path").notNull(),
  line_number: integer("line_number"),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  suggested_fix: text("suggested_fix"),

  status: text("status").notNull().default("open"), // open, fixed, wontfix
  fix_description: text("fix_description"),

  iteration: integer("iteration").notNull().default(1),
  created_at: text("created_at").notNull(),
  fixed_at: text("fixed_at"),
});

// Add demo scripts table
export const demoScripts = sqliteTable("demo_scripts", {
  id: text("id").primaryKey(),
  ticket_id: text("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  epic_id: text("epic_id")
    .notNull()
    .references(() => epics.id, { onDelete: "cascade" }),

  title: text("title").notNull(),
  description: text("description"),
  steps: text("steps").notNull(), // JSON array of DemoStep

  generated_at: text("generated_at").notNull(),
  executed_at: text("executed_at"),
  executed_by: text("executed_by"),
  passed: integer("passed"),
});
```

### Step 2: Remove Legacy `review` Status

**File**: `src/lib/constants.ts`

```typescript
// Status options for ticket forms - CLEANED UP
export const STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "ready", label: "Ready" },
  { value: "in_progress", label: "In Progress" },
  // REMOVED: { value: "review", label: "Review" },
  { value: "ai_review", label: "AI Review" },
  { value: "human_review", label: "Human Review" },
  { value: "done", label: "Done" },
] as const;

export const COLUMN_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  // REMOVED: "review",
  "ai_review",
  "human_review",
  "done",
] as const;

export const STATUS_ORDER: Record<string, number> = {
  backlog: 0,
  ready: 1,
  in_progress: 2,
  // REMOVED: review: 3,
  ai_review: 3,
  human_review: 4,
  done: 5,
};

// Remove from STATUS_BADGE_CONFIG, getStatusColor, etc.
```

**Migration**: Update existing tickets with `status = 'review'` to `status = 'ai_review'`

### Step 3: MCP Workflow Tools (with Comments & Telemetry)

**File**: `mcp-server/tools/workflow-v2.js`

Every MCP tool that advances the workflow MUST:

1. Create a ticket comment documenting the action
2. Emit telemetry events for observability
3. Update status appropriately

```javascript
import { z } from "zod";
import { addTicketComment } from "./comments.js";
import { logToolEvent, logContextEvent } from "./telemetry.js";

export function registerWorkflowV2Tools(server, db) {
  // Helper: Add comment and telemetry in one call
  async function documentAction(
    ticketId,
    { commentType = "progress", commentContent, author = "claude", telemetryEvent, telemetryData }
  ) {
    // Always add comment
    await addTicketComment(db, {
      ticketId,
      content: commentContent,
      author,
      type: commentType,
    });

    // Log telemetry if session exists
    const session = await getActiveTelemetrySession(ticketId);
    if (session && telemetryEvent) {
      await logToolEvent(db, {
        sessionId: session.id,
        ticketId,
        event: telemetryEvent,
        ...telemetryData,
      });
    }
  }

  /**
   * Start work on a ticket - with precondition checking
   */
  server.tool(
    "start_ticket_work",
    {
      description: "Begin work on a ticket. Checks preconditions and sets up workflow tracking.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID to start" },
        },
        required: ["ticketId"],
      },
    },
    async ({ ticketId }) => {
      const ticket = await getTicket(ticketId);
      if (!ticket) {
        return error(`Ticket ${ticketId} not found`);
      }

      // PRECONDITION 1: No other ticket in progress for this project
      const inProgress = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.project_id, ticket.project_id), eq(tickets.status, "in_progress")))
        .get();

      if (inProgress) {
        return error(
          `BLOCKED: Ticket "${inProgress.title}" (${inProgress.id}) is already in progress.\n\n` +
            `You must complete it first:\n` +
            `  complete_ticket_work({ ticketId: "${inProgress.id}", summary: "..." })\n\n` +
            `Or abandon it:\n` +
            `  abandon_ticket_work({ ticketId: "${inProgress.id}", reason: "..." })`
        );
      }

      // PRECONDITION 2: Previous ticket was reviewed (if exists)
      const lastCompleted = await db
        .select()
        .from(tickets)
        .where(and(eq(tickets.project_id, ticket.project_id), eq(tickets.status, "done")))
        .orderBy(desc(tickets.completed_at))
        .get();

      if (lastCompleted) {
        const workflowState = await db
          .select()
          .from(ticketWorkflowState)
          .where(eq(ticketWorkflowState.ticket_id, lastCompleted.id))
          .get();

        if (workflowState && !workflowState.human_approved) {
          return error(
            `BLOCKED: Previous ticket "${lastCompleted.title}" was not fully reviewed.\n\n` +
              `Run the review workflow:\n` +
              `  /review-ticket ${lastCompleted.id}`
          );
        }
      }

      // All good - start work
      await db
        .update(tickets)
        .set({
          status: "in_progress",
          updated_at: new Date().toISOString(),
          branch_name: branchName,
        })
        .where(eq(tickets.id, ticketId));

      await db
        .insert(ticketWorkflowState)
        .values({
          ticket_id: ticketId,
          started_at: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: ticketWorkflowState.ticket_id,
          set: { started_at: new Date().toISOString() },
        });

      // Create branch
      const branchName = `feature/${ticket.id.slice(0, 8)}-${slugify(ticket.title)}`;

      // MANDATORY: Document the action
      await documentAction(ticketId, {
        commentType: "progress",
        commentContent:
          `**Started work on ticket**\n\n` +
          `- Branch: \`${branchName}\`\n` +
          `- Status: in_progress\n` +
          `- Started at: ${new Date().toISOString()}`,
        author: "claude", // or "ralph" depending on context
        telemetryEvent: "start",
        telemetryData: {
          toolName: "start_ticket_work",
          params: { ticketId, branchName },
        },
      });

      // Start telemetry session for this ticket
      await startTelemetrySession(db, {
        ticketId,
        projectId: ticket.project_id,
        environment: detectEnvironment(),
      });

      // Log context event (what context was loaded)
      await logContextEvent(db, {
        sessionId: await getActiveTelemetrySession(ticketId).id,
        hasDescription: !!ticket.description,
        hasAcceptanceCriteria: !!ticket.subtasks,
        criteriaCount: ticket.subtasks ? JSON.parse(ticket.subtasks).length : 0,
        commentCount: await getCommentCount(ticketId),
      });

      return success(
        `Started work on: ${ticket.title}\n\n` +
          `Branch: ${branchName}\n\n` +
          `## Next Steps:\n` +
          `1. Write a 5-10 bullet micro-plan using TaskCreate\n` +
          `2. Implement the changes\n` +
          `3. Run validation: pnpm check\n` +
          `4. Complete: complete_ticket_work({ ticketId: "${ticketId}", summary: "..." })`
      );
    }
  );

  /**
   * Complete ticket work - moves to ai_review
   */
  server.tool(
    "complete_ticket_work",
    {
      description: "Finish implementation and move to AI review phase.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          summary: { type: "string", description: "Summary of work done" },
        },
        required: ["ticketId", "summary"],
      },
    },
    async ({ ticketId, summary }) => {
      const ticket = await getTicket(ticketId);
      const workflowState = await getWorkflowState(ticketId);

      // WARN if plan wasn't written (add comment but don't block)
      if (!workflowState?.plan_written) {
        await documentAction(ticketId, {
          commentType: "progress",
          commentContent: `⚠️ **Warning**: Ticket completed without a micro-plan being written`,
          author: "system",
        });
      }

      // Move to ai_review
      await db
        .update(tickets)
        .set({ status: "ai_review", updated_at: new Date().toISOString() })
        .where(eq(tickets.id, ticketId));

      await db
        .update(ticketWorkflowState)
        .set({ ai_review_started: 1 })
        .where(eq(ticketWorkflowState.ticket_id, ticketId));

      // MANDATORY: Document the work summary
      await documentAction(ticketId, {
        commentType: "work_summary",
        commentContent:
          `**Implementation Complete**\n\n` +
          `## Summary\n${summary}\n\n` +
          `## Status\n` +
          `- Previous: in_progress\n` +
          `- Current: ai_review\n` +
          `- Next: Automated code review`,
        author: "claude",
        telemetryEvent: "end",
        telemetryData: {
          toolName: "complete_ticket_work",
          params: { ticketId },
          success: true,
        },
      });

      return success(
        `Implementation complete! Moving to AI Review.\n\n` +
          `## Summary:\n${summary}\n\n` +
          `## Next Steps:\n` +
          `The ticket is now in AI Review. Run:\n` +
          `  /review-ticket ${ticketId}\n\n` +
          `This will:\n` +
          `1. Run all 7 review agents\n` +
          `2. Create findings for any issues\n` +
          `3. Enter fix loop until clean\n` +
          `4. Move to Human Review when done`
      );
    }
  );

  /**
   * Submit review finding
   */
  server.tool(
    "submit_review_finding",
    {
      description: "Report an issue found by a review agent.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket ID (null for epic-level)" },
          epicId: { type: "string" },
          agent: {
            type: "string",
            enum: [
              "code-reviewer",
              "silent-failure-hunter",
              "code-simplifier",
              "context7-library-compliance",
              "react-best-practices",
              "cruft-detector",
              "senior-engineer",
            ],
          },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3", "P4"] },
          filePath: { type: "string" },
          lineNumber: { type: "number" },
          summary: { type: "string" },
          description: { type: "string" },
          suggestedFix: { type: "string" },
        },
        required: ["epicId", "agent", "priority", "filePath", "summary", "description"],
      },
    },
    async (input) => {
      const id = crypto.randomUUID();
      const workflowState = input.ticketId
        ? await getWorkflowState(input.ticketId)
        : await getEpicWorkflowState(input.epicId);

      await db.insert(reviewFindings).values({
        id,
        ticket_id: input.ticketId,
        epic_id: input.epicId,
        agent: input.agent,
        priority: input.priority,
        file_path: input.filePath,
        line_number: input.lineNumber,
        summary: input.summary,
        description: input.description,
        suggested_fix: input.suggestedFix,
        iteration: workflowState?.review_iteration || 1,
        created_at: new Date().toISOString(),
      });

      // Update counts
      if (input.ticketId) {
        await db.run(sql`
          UPDATE ticket_workflow_state
          SET review_findings_count = review_findings_count + 1
          WHERE ticket_id = ${input.ticketId}
        `);
      }

      return success(`Finding recorded: ${input.summary} [${input.priority}]`);
    }
  );

  /**
   * Mark finding as fixed
   */
  server.tool(
    "mark_finding_fixed",
    {
      description: "Mark a review finding as fixed.",
      inputSchema: {
        type: "object",
        properties: {
          findingId: { type: "string" },
          fixDescription: { type: "string" },
        },
        required: ["findingId"],
      },
    },
    async ({ findingId, fixDescription }) => {
      await db
        .update(reviewFindings)
        .set({
          status: "fixed",
          fix_description: fixDescription,
          fixed_at: new Date().toISOString(),
        })
        .where(eq(reviewFindings.id, findingId));

      return success(`Finding marked as fixed.`);
    }
  );

  /**
   * Generate demo script
   */
  server.tool(
    "generate_demo_script",
    {
      description: "Generate a demo script for manual testing.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          epicId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                instruction: { type: "string" },
                expectedResult: { type: "string" },
              },
              required: ["instruction", "expectedResult"],
            },
          },
        },
        required: ["epicId", "title", "steps"],
      },
    },
    async ({ ticketId, epicId, title, description, steps }) => {
      const id = crypto.randomUUID();

      const stepsWithOrder = steps.map((s, i) => ({
        order: i + 1,
        instruction: s.instruction,
        expectedResult: s.expectedResult,
        passed: null,
        notes: null,
      }));

      await db.insert(demoScripts).values({
        id,
        ticket_id: ticketId,
        epic_id: epicId,
        title,
        description,
        steps: JSON.stringify(stepsWithOrder),
        generated_at: new Date().toISOString(),
      });

      // Update workflow state
      if (ticketId) {
        await db
          .update(ticketWorkflowState)
          .set({ demo_script_generated: 1, demo_script: id })
          .where(eq(ticketWorkflowState.ticket_id, ticketId));
      } else {
        await db
          .update(epicWorkflowState)
          .set({ epic_demo_script: id })
          .where(eq(epicWorkflowState.epic_id, epicId));
      }

      // Format for display
      let output = `## Demo Script: ${title}\n\n`;
      if (description) output += `${description}\n\n`;
      output += `### Steps:\n\n`;
      stepsWithOrder.forEach((s, i) => {
        output += `${i + 1}. ${s.instruction}\n`;
        output += `   **Expected:** ${s.expectedResult}\n\n`;
      });
      output += `\n---\n`;
      output += `After running the demo, provide feedback:\n`;
      output += `  submit_demo_feedback({ demoId: "${id}", passed: true/false, feedback: "..." })`;

      return success(output);
    }
  );

  /**
   * Submit demo feedback
   */
  server.tool(
    "submit_demo_feedback",
    {
      description: "Submit feedback after running the demo.",
      inputSchema: {
        type: "object",
        properties: {
          demoId: { type: "string" },
          passed: { type: "boolean" },
          feedback: { type: "string" },
          stepResults: {
            type: "array",
            items: {
              type: "object",
              properties: {
                stepNumber: { type: "number" },
                passed: { type: "boolean" },
                notes: { type: "string" },
              },
            },
          },
        },
        required: ["demoId", "passed"],
      },
    },
    async ({ demoId, passed, feedback, stepResults }) => {
      const demo = await db.select().from(demoScripts).where(eq(demoScripts.id, demoId)).get();

      if (!demo) {
        return error(`Demo ${demoId} not found`);
      }

      // Update step results if provided
      if (stepResults) {
        const steps = JSON.parse(demo.steps);
        stepResults.forEach((sr) => {
          const step = steps.find((s) => s.order === sr.stepNumber);
          if (step) {
            step.passed = sr.passed;
            step.notes = sr.notes;
          }
        });
        await db
          .update(demoScripts)
          .set({ steps: JSON.stringify(steps) })
          .where(eq(demoScripts.id, demoId));
      }

      await db
        .update(demoScripts)
        .set({
          executed_at: new Date().toISOString(),
          executed_by: "human",
          passed: passed ? 1 : 0,
        })
        .where(eq(demoScripts.id, demoId));

      // Update workflow state
      if (demo.ticket_id) {
        await db
          .update(ticketWorkflowState)
          .set({
            human_ran_demo: 1,
            human_feedback: feedback,
            human_approved: passed ? 1 : 0,
          })
          .where(eq(ticketWorkflowState.ticket_id, demo.ticket_id));

        if (passed) {
          await db
            .update(tickets)
            .set({ status: "done", completed_at: new Date().toISOString() })
            .where(eq(tickets.id, demo.ticket_id));
        }
      }

      if (passed) {
        return success(
          `Demo passed! Ticket moved to Done.\n\n` +
            `## Next Steps:\n` +
            `1. Run /reconcile-learnings to update CLAUDE.md\n` +
            `2. Continue with next ticket: /next-task`
        );
      } else {
        return success(
          `Demo found issues. Ticket remains in Human Review.\n\n` +
            `Feedback: ${feedback}\n\n` +
            `## Next Steps:\n` +
            `1. Address the feedback\n` +
            `2. Run validation: pnpm check\n` +
            `3. Generate new demo: generate_demo_script(...)\n` +
            `4. Re-run demo with user`
        );
      }
    }
  );

  /**
   * Reconcile learnings
   */
  server.tool(
    "reconcile_learnings",
    {
      description: "Update CLAUDE.md, specs, and future tickets with learnings.",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          epicId: { type: "string" },
          learnings: { type: "string", description: "What was learned" },
          claudeMdUpdates: { type: "string", description: "Updates to add to CLAUDE.md" },
          specUpdates: { type: "array", items: { type: "string" } },
          futureTicketUpdates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ticketId: { type: "string" },
                update: { type: "string" },
              },
            },
          },
        },
        required: ["learnings"],
      },
    },
    async ({ ticketId, epicId, learnings, claudeMdUpdates, specUpdates, futureTicketUpdates }) => {
      // Update workflow state
      if (ticketId) {
        await db
          .update(ticketWorkflowState)
          .set({ learnings_reconciled: 1, learnings })
          .where(eq(ticketWorkflowState.ticket_id, ticketId));
      }
      if (epicId) {
        await db
          .update(epicWorkflowState)
          .set({ learnings_reconciled: 1 })
          .where(eq(epicWorkflowState.epic_id, epicId));
      }

      let output = `## Learnings Recorded\n\n${learnings}\n\n`;

      if (claudeMdUpdates) {
        output += `## CLAUDE.md Updates\n\nThe following should be added to CLAUDE.md:\n\n${claudeMdUpdates}\n\n`;
      }

      if (specUpdates?.length) {
        output += `## Spec Updates\n\nThe following specs should be updated:\n`;
        specUpdates.forEach((s) => (output += `- ${s}\n`));
        output += `\n`;
      }

      if (futureTicketUpdates?.length) {
        output += `## Future Ticket Updates\n\nThe following tickets should be updated with new context:\n`;
        futureTicketUpdates.forEach((t) => (output += `- ${t.ticketId}: ${t.update}\n`));
      }

      return success(output);
    }
  );
}

// Helper functions
function success(message) {
  return { content: [{ type: "text", text: message }] };
}

function error(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}
```

### Step 4: Skills (Portable Prompts)

**File**: `.claude/commands/next-task.md`

```markdown
---
description: Pick up the next task with precondition checking
---

# Next Task

You are starting work on the next available task.

## Steps

1. Call `start_ticket_work({ ticketId: "<next-ticket>" })`
   - The tool will check preconditions and block if needed
   - Follow any instructions in the response

2. If successful, write a 5-10 bullet micro-plan using TaskCreate

3. Implement the changes

4. Run validation: `pnpm check`

5. Complete: `complete_ticket_work({ ticketId, summary: "..." })`

## Important

- The MCP tool enforces preconditions - trust its guidance
- If blocked, follow the instructions to unblock
- Always write a plan before coding
- Always validate before completing
```

**File**: `.claude/commands/review-ticket.md`

```markdown
---
description: Run full review workflow on a ticket
---

# Review Ticket

You are running the AI review workflow for a ticket in `ai_review` status.

## Steps

1. Run all 7 review agents in parallel using Task tool:
   - pr-review-toolkit:code-reviewer
   - pr-review-toolkit:silent-failure-hunter
   - pr-review-toolkit:code-simplifier
   - context7-library-compliance
   - react-best-practices
   - cruft-detector
   - senior-engineer

2. For EVERY issue found, call `submit_review_finding`:
```

submit_review_finding({
ticketId: "<ticket-id>",
epicId: "<epic-id>",
agent: "code-reviewer",
priority: "P2",
filePath: "src/api/tickets.ts",
lineNumber: 42,
summary: "Missing input validation",
description: "...",
suggestedFix: "..."
})

```

3. After all agents complete, get findings:
`get_review_findings({ ticketId: "<ticket-id>" })`

4. Fix issues in priority order (P0 first):
- Make the fix
- Run `pnpm check`
- Call `mark_finding_fixed({ findingId: "...", fixDescription: "..." })`
- Commit: `git commit -m "fix(review): ..."`

5. Re-run review to check for regressions

6. When all findings fixed, generate demo:
```

generate_demo_script({
ticketId: "<ticket-id>",
epicId: "<epic-id>",
title: "Demo: [Ticket Title]",
steps: [
{ instruction: "Open http://localhost:4242", expectedResult: "App loads" },
{ instruction: "Click on ticket X", expectedResult: "Modal opens" },
...
]
})

```

7. Present demo script to user and wait for feedback
```

---

## Acceptance Criteria

### Status Cleanup

- [ ] Remove `review` from STATUS_OPTIONS
- [ ] Remove `review` from COLUMN_STATUSES
- [ ] Remove `review` from STATUS_ORDER
- [ ] Remove `review` from STATUS_BADGE_CONFIG
- [ ] Update `getStatusColor` to not handle `review`
- [ ] Migration: `UPDATE tickets SET status = 'ai_review' WHERE status = 'review'`

### Comments & Documentation

- [ ] `start_ticket_work` creates "Started work" comment
- [ ] `complete_ticket_work` creates work_summary comment
- [ ] `submit_review_finding` creates progress comment with finding summary
- [ ] `mark_finding_fixed` creates progress comment with fix description
- [ ] `generate_demo_script` creates progress comment with step count
- [ ] `submit_demo_feedback` creates comment with user feedback
- [ ] `reconcile_learnings` creates progress comment listing updates
- [ ] All comments include timestamps and author
- [ ] Comment type is appropriate (progress, work_summary, test_report, comment)

### Telemetry & Observability

- [ ] `start_ticket_work` starts telemetry session
- [ ] `start_ticket_work` logs context event (description, criteria, comments)
- [ ] Each MCP tool logs tool event (start/end with params)
- [ ] `complete_ticket_work` logs session transition
- [ ] Review agents log their findings count
- [ ] Fix loop logs each iteration
- [ ] Demo submission logs outcome
- [ ] Session end logs totals (tools, tokens, duration, outcome)
- [ ] Telemetry visible in Brain Dump UI ticket detail

### Status Updates

- [ ] `start_ticket_work` sets status to `in_progress`
- [ ] `complete_ticket_work` sets status to `ai_review`
- [ ] AI review pass sets status to `human_review`
- [ ] `submit_demo_feedback(passed=true)` sets status to `done`
- [ ] Status changes are atomic with workflow state updates
- [ ] UI reflects status changes in real-time (via TanStack Query invalidation)

### Database Schema

- [ ] Create `ticket_workflow_state` table
- [ ] Create `epic_workflow_state` table
- [ ] Create `review_findings` table
- [ ] Create `demo_scripts` table
- [ ] Run migrations

### MCP Tools

- [ ] `start_ticket_work` with precondition checking
- [ ] `complete_ticket_work` moves to ai_review
- [ ] `submit_review_finding` stores findings
- [ ] `mark_finding_fixed` updates status
- [ ] `generate_demo_script` creates demo
- [ ] `submit_demo_feedback` records feedback
- [ ] `reconcile_learnings` updates state

### Skills

- [ ] `/next-task` skill
- [ ] `/review-ticket` skill
- [ ] `/review-epic` skill
- [ ] `/demo` skill
- [ ] `/reconcile-learnings` skill

### Installation & Multi-Environment

- [ ] `install.sh` configures MCP for Claude Code
- [ ] `install.sh` configures MCP for OpenCode
- [ ] `install.sh` configures MCP for VS Code (if installed)
- [ ] `install.sh` configures MCP for Cursor (if installed)
- [ ] `install.sh` installs global hooks to `~/.claude/hooks/`
- [ ] `install.sh` installs global skills to `~/.claude/commands/`
- [ ] `uninstall.sh` cleanly removes all MCP configurations
- [ ] `uninstall.sh` removes hooks without breaking other hooks
- [ ] `uninstall.sh` removes skills
- [ ] `brain-dump doctor` command verifies all environments
- [ ] Documentation updated for multi-environment setup

### Claude Code Specific Integration (Primary Environment)

- [ ] All hooks installed to `~/.claude/hooks/` (global)
- [ ] `SessionStart` hook for telemetry session start
- [ ] `PreToolUse` hook for tool start logging (writes to queue)
- [ ] `PostToolUse` hook for tool end logging (writes to queue)
- [ ] `PostToolUseFailure` hook for tool failure logging
- [ ] `UserPromptSubmit` hook for prompt capture
- [ ] `Stop` hook for telemetry session end and queue flush
- [ ] Queue file pattern: `.claude/telemetry-queue.jsonl`
- [ ] Correlation file: `.claude/tool-correlations.json`
- [ ] Session file: `.claude/telemetry-session.json`
- [ ] `~/.claude/settings.json` hook configuration updated
- [ ] Install script merges hooks without overwriting existing
- [ ] Workflow enforcement hooks installed (state enforcement)
- [ ] Skills installed to `~/.claude/commands/`
- [ ] Verify hooks work with `claude --print-hooks`
- [ ] Documentation references official Claude Code hook docs

### OpenCode Specific Integration

- [ ] Brain Dump plugin created: `brain-dump-telemetry.ts`
- [ ] Plugin implements `tool.execute.before` hook for tool start logging
- [ ] Plugin implements `tool.execute.after` hook for tool end logging
- [ ] Plugin implements `session.created` hook for session start
- [ ] Plugin implements `session.idle` hook for session end
- [ ] Plugin installed to `~/.config/opencode/plugins/` (global)
- [ ] `AGENTS.md` template created for workflow enforcement
- [ ] `.opencode/skills/brain-dump-workflow/SKILL.md` skill created
- [ ] `opencode.json` snippet for MCP server configuration
- [ ] Install script detects OpenCode and installs plugin
- [ ] Install script creates `AGENTS.md` if not exists
- [ ] Documentation references OpenCode plugin docs
- [ ] Test plugin with `opencode mcp debug brain-dump`

### VS Code Specific Integration (Instructions-Based)

- [ ] `.vscode/mcp.json` template created for projects
- [ ] `.github/copilot-instructions.md` template for workflow enforcement
- [ ] `.github/skills/brain-dump-workflow.skill.md` for auto-activated guidance
- [ ] Install script detects VS Code and creates appropriate configs
- [ ] Install script offers to create `.github/copilot-instructions.md`
- [ ] MCP server works with VS Code's stdio transport format
- [ ] Documentation for VS Code MCP server trust flow

> **Note**: VS Code extension with Language Model Tool API is OUT OF SCOPE for this epic. We will use the instructions-based approach which provides medium enforcement via prompt guidance + MCP preconditions.

### Cursor Specific Integration (Full Hooks Support)

- [ ] Brain Dump hooks created for Cursor: `.cursor/hooks/` directory
- [ ] `sessionStart` hook for telemetry session start
- [ ] `sessionEnd` hook for telemetry session end
- [ ] `preToolUse` hook for tool start logging
- [ ] `postToolUse` hook for tool end logging (success)
- [ ] `postToolUseFailure` hook for tool end logging (failure)
- [ ] `beforeSubmitPrompt` hook for user prompt capture
- [ ] `.cursor/hooks.json` configuration file created
- [ ] `.cursor/mcp.json` template created
- [ ] `.cursor/rules/brain-dump-workflow.md` rule created
- [ ] `.cursor/skills/brain-dump-workflow/SKILL.md` skill created
- [ ] Install script detects Cursor and installs hooks to `~/.cursor/hooks/`
- [ ] Install script creates `.cursor/hooks.json` or updates existing
- [ ] Test Claude Code hook compatibility (Cursor loads `.claude/settings.json`)
- [ ] Document Cursor-specific hook format differences
- [ ] Verify MCP server compatibility with Cursor's implementation

### Human Review Approval UI

- [ ] `DemoPanel` component shows demo steps
- [ ] `DemoStep` component with pass/fail/skip buttons
- [ ] Notes field for each step
- [ ] Overall feedback text area
- [ ] "Approve & Complete" button (validates all steps marked)
- [ ] "Request Changes" button (requires failed step or feedback)
- [ ] Kanban card shows "Demo Ready" badge when in human_review
- [ ] Ticket detail shows prominent "Start Demo Review" CTA
- [ ] Toast notification when ticket enters human_review
- [ ] `getDemoScript` server function
- [ ] `updateDemoStep` server function
- [ ] `submitDemoFeedback` server function
- [ ] `useDemoScript` TanStack Query hook
- [ ] Approval triggers `/reconcile-learnings` prompt
- [ ] Rejection creates comment with issues for AI

### Integration

- [ ] Ralph script uses new workflow
- [ ] Hooks enforce workflow in Claude Code
- [ ] OpenCode guided by MCP responses (same as Claude Code behavior)
- [ ] VS Code/Cursor guided by MCP responses
- [ ] UI shows workflow state
- [ ] human_review tickets show action required indicator

---

### Installation & Multi-Environment Configuration

The install/uninstall scripts MUST configure MCP servers, skills, and hooks for ALL supported environments.

#### Supported Environments

| Environment     | MCP Config Location                                | Hooks/Events                                                                                                          | Skills/Instructions                                     | Workflow Enforcement                    |
| --------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| **Claude Code** | `~/.claude/settings.json`                          | ✅ Full hooks (PreToolUse, PostToolUse, SessionStart, Stop, etc.)                                                     | ✅ `.claude/commands/`                                  | ✅ Hooks block bad actions              |
| **OpenCode**    | `opencode.json` (project or `~/.config/opencode/`) | ✅ Plugin events (40+): `tool.execute.before/after`, `session.created/idle/error`                                     | ✅ `.opencode/skills/`, `AGENTS.md`                     | ✅ Plugin intercept + MCP preconditions |
| **Cursor**      | `.cursor/mcp.json`                                 | ✅ Full hooks (preToolUse, postToolUse, sessionStart, sessionEnd, beforeSubmitPrompt, etc.) + **loads Claude hooks!** | ✅ `.cursor/rules/`, `.cursor/skills/`                  | ✅ Hooks block bad actions              |
| **VS Code**     | `.vscode/mcp.json` (workspace) or global settings  | ❌ No hooks (instructions only)                                                                                       | ✅ `.github/copilot-instructions.md`, `.github/skills/` | ⚠️ Instructions + MCP preconditions     |

**VS Code Extensibility Details:**

| Feature                 | API                                               | Purpose                                | Telemetry Use                                                    |
| ----------------------- | ------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| Custom Instructions     | `.github/copilot-instructions.md`                 | Inject guidance into all chat requests | Enforce workflow, prompt to log                                  |
| Agent Skills            | `.github/skills/*.skill.md`                       | Auto-activated reusable prompts        | Workflow guidance per context                                    |
| Language Model Tool API | `vscode.lm.registerTool()`                        | Define custom tools with callbacks     | `prepareInvocation` = PreToolUse, `invoke finally` = PostToolUse |
| MCP Server Provider     | `vscode.lm.registerMcpServerDefinitionProvider()` | Programmatic MCP server registration   | Could intercept/wrap MCP calls                                   |
| Chat Participant API    | `vscode.chat.registerChatParticipant()`           | Custom @-mention assistants            | Control interaction flow                                         |

**Enforcement Comparison:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     WORKFLOW ENFORCEMENT BY ENVIRONMENT                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Claude Code: HOOKS + MCP                                                   │
│  ─────────────────────────                                                  │
│  [PreToolUse Hook]──► BLOCK if wrong state ──► [MCP Tool]──► Database      │
│        │                                                                    │
│        └──► "Call update_session_state first"                               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Cursor: HOOKS + MCP (Claude-compatible!)                                   │
│  ─────────────────────────────────────────                                  │
│  [preToolUse Hook]──► BLOCK (exit 2) ──► [MCP Tool]──► Database            │
│        │                                                                    │
│        └──► Same as Claude Code! Can load Claude hooks directly             │
│                                                                             │
│  [.cursor/rules/]──► AI reads workflow rules ──► AI follows                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  OpenCode: PLUGIN EVENTS + MCP                                              │
│  ─────────────────────────────                                              │
│  [tool.execute.before]──► Log start + can modify ──► [Tool Executes]       │
│        │                                                   │                │
│        │                                                   ▼                │
│        │                                           [tool.execute.after]     │
│        │                                                   │                │
│        │                                                   └── Log end      │
│        │                                                                    │
│        └──► Plugin can intercept and block (modify output)                  │
│                                                                             │
│  [AGENTS.md]──► AI reads workflow rules ──► AI follows                      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  VS Code: INSTRUCTIONS + MCP (No hooks)                                     │
│  ──────────────────────────────────────                                     │
│  [copilot-instructions.md]──► AI reads ──► AI follows (hopefully)           │
│        │                                   │                                │
│        │                                   ▼                                │
│        │                         [MCP Tool]──► BLOCK if precondition fails  │
│        │                                   │                                │
│        └── "Use start_ticket_work first"   └──► "BLOCKED: ticket in_progress│
│                                                  already exists"            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Enforcement Strength Comparison:**

| Environment           | Can Block Tools             | Can Modify Params | Auto Telemetry | User Prompt           |
| --------------------- | --------------------------- | ----------------- | -------------- | --------------------- |
| **Claude Code**       | ✅ PreToolUse returns block | ❌ No             | ✅ Full        | ✅ UserPromptSubmit   |
| **Cursor**            | ✅ preToolUse exit code 2   | ❌ No             | ✅ Full        | ✅ beforeSubmitPrompt |
| **OpenCode (Plugin)** | ⚠️ Via output modification  | ✅ Yes            | ✅ Full        | ❌ No                 |
| **VS Code**           | ⚠️ MCP preconditions only   | ❌ No             | ⚠️ MCP only    | ❌ No                 |

#### Install Script Requirements

**File**: `install.sh`

```bash
#!/bin/bash

# ... existing install logic ...

install_mcp_server() {
  echo "📡 Configuring MCP server for all environments..."

  MCP_SERVER_PATH="$BRAIN_DUMP_ROOT/mcp-server/index.js"

  # 1. Claude Code (global)
  if [ -f "$HOME/.claude.json" ]; then
    CLAUDE_CONFIG="$HOME/.claude.json"
  else
    CLAUDE_CONFIG="$HOME/.claude/settings.json"
    mkdir -p "$HOME/.claude"
  fi

  # Add brain-dump MCP server to Claude Code config
  # Uses jq to merge into existing config
  jq --arg path "$MCP_SERVER_PATH" \
    '.mcpServers["brain-dump"] = {
      "command": "node",
      "args": [$path],
      "env": {}
    }' "$CLAUDE_CONFIG" > "$CLAUDE_CONFIG.tmp" && mv "$CLAUDE_CONFIG.tmp" "$CLAUDE_CONFIG"
  echo "  ✓ Claude Code configured"

  # 2. OpenCode (global)
  OPENCODE_CONFIG="$HOME/.opencode/config.json"
  if [ -d "$HOME/.opencode" ]; then
    # OpenCode uses similar MCP config structure
    jq --arg path "$MCP_SERVER_PATH" \
      '.mcpServers["brain-dump"] = {
        "command": "node",
        "args": [$path]
      }' "$OPENCODE_CONFIG" > "$OPENCODE_CONFIG.tmp" && mv "$OPENCODE_CONFIG.tmp" "$OPENCODE_CONFIG"
    echo "  ✓ OpenCode configured"
  fi

  # 3. VS Code (global user settings)
  VSCODE_CONFIG="$HOME/.vscode/settings.json"
  if [ -d "$HOME/.vscode" ]; then
    # VS Code MCP extension uses different config structure
    jq --arg path "$MCP_SERVER_PATH" \
      '.["mcp.servers"]["brain-dump"] = {
        "command": "node",
        "args": [$path]
      }' "$VSCODE_CONFIG" > "$VSCODE_CONFIG.tmp" && mv "$VSCODE_CONFIG.tmp" "$VSCODE_CONFIG"
    echo "  ✓ VS Code configured"
  fi

  # 4. Cursor (global)
  CURSOR_CONFIG="$HOME/.cursor/settings.json"
  if [ -d "$HOME/.cursor" ]; then
    jq --arg path "$MCP_SERVER_PATH" \
      '.["mcp.servers"]["brain-dump"] = {
        "command": "node",
        "args": [$path]
      }' "$CURSOR_CONFIG" > "$CURSOR_CONFIG.tmp" && mv "$CURSOR_CONFIG.tmp" "$CURSOR_CONFIG"
    echo "  ✓ Cursor configured"
  fi
}

install_hooks() {
  echo "🪝 Installing workflow hooks for Claude Code..."

  HOOKS_DIR="$HOME/.claude/hooks"
  mkdir -p "$HOOKS_DIR"

  # Copy workflow enforcement hooks
  cp "$BRAIN_DUMP_ROOT/hooks/enforce-workflow-preconditions.sh" "$HOOKS_DIR/"
  cp "$BRAIN_DUMP_ROOT/hooks/document-workflow-action.sh" "$HOOKS_DIR/"
  cp "$BRAIN_DUMP_ROOT/hooks/capture-claude-tasks.sh" "$HOOKS_DIR/"

  chmod +x "$HOOKS_DIR"/*.sh

  # Update Claude Code settings to use hooks
  # ... hook configuration in settings.json ...

  echo "  ✓ Hooks installed to $HOOKS_DIR"
}

install_skills() {
  echo "📚 Installing workflow skills..."

  SKILLS_DIR="$HOME/.claude/commands"
  mkdir -p "$SKILLS_DIR"

  # Copy global skills (work in any project)
  cp "$BRAIN_DUMP_ROOT/.claude/commands/next-task.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/review-ticket.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/review-epic.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/demo.md" "$SKILLS_DIR/"
  cp "$BRAIN_DUMP_ROOT/.claude/commands/reconcile-learnings.md" "$SKILLS_DIR/"

  echo "  ✓ Skills installed to $SKILLS_DIR"
}

# Main install
install_mcp_server
install_hooks
install_skills
```

#### Uninstall Script Requirements

**File**: `uninstall.sh`

```bash
#!/bin/bash

uninstall_mcp_server() {
  echo "📡 Removing MCP server from all environments..."

  # 1. Claude Code
  for config in "$HOME/.claude.json" "$HOME/.claude/settings.json"; do
    if [ -f "$config" ]; then
      jq 'del(.mcpServers["brain-dump"])' "$config" > "$config.tmp" && mv "$config.tmp" "$config"
    fi
  done
  echo "  ✓ Claude Code cleaned"

  # 2. OpenCode
  if [ -f "$HOME/.opencode/config.json" ]; then
    jq 'del(.mcpServers["brain-dump"])' "$HOME/.opencode/config.json" > tmp && mv tmp "$HOME/.opencode/config.json"
    echo "  ✓ OpenCode cleaned"
  fi

  # 3. VS Code
  if [ -f "$HOME/.vscode/settings.json" ]; then
    jq 'del(.["mcp.servers"]["brain-dump"])' "$HOME/.vscode/settings.json" > tmp && mv tmp "$HOME/.vscode/settings.json"
    echo "  ✓ VS Code cleaned"
  fi

  # 4. Cursor
  if [ -f "$HOME/.cursor/settings.json" ]; then
    jq 'del(.["mcp.servers"]["brain-dump"])' "$HOME/.cursor/settings.json" > tmp && mv tmp "$HOME/.cursor/settings.json"
    echo "  ✓ Cursor cleaned"
  fi
}

uninstall_hooks() {
  echo "🪝 Removing workflow hooks..."

  rm -f "$HOME/.claude/hooks/enforce-workflow-preconditions.sh"
  rm -f "$HOME/.claude/hooks/document-workflow-action.sh"
  rm -f "$HOME/.claude/hooks/capture-claude-tasks.sh"

  # Remove hook configuration from settings (but keep other hooks)
  # ... careful removal of only brain-dump hooks ...

  echo "  ✓ Hooks removed"
}

uninstall_skills() {
  echo "📚 Removing workflow skills..."

  rm -f "$HOME/.claude/commands/next-task.md"
  rm -f "$HOME/.claude/commands/review-ticket.md"
  rm -f "$HOME/.claude/commands/review-epic.md"
  rm -f "$HOME/.claude/commands/demo.md"
  rm -f "$HOME/.claude/commands/reconcile-learnings.md"

  echo "  ✓ Skills removed"
}

# Main uninstall
uninstall_mcp_server
uninstall_hooks
uninstall_skills
```

#### Configuration Verification

Add a verification command to check all environments are configured:

```bash
brain-dump doctor
```

Output:

```
🩺 Brain Dump Environment Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MCP Server Configuration:
  ✓ Claude Code  - brain-dump MCP configured in ~/.claude/settings.json
  ✓ OpenCode     - brain-dump MCP configured in ~/.opencode/config.json
  ✗ VS Code      - MCP not configured (run: brain-dump install --vscode)
  ✓ Cursor       - brain-dump MCP configured in ~/.cursor/settings.json

Hooks (Claude Code only):
  ✓ enforce-workflow-preconditions.sh
  ✓ document-workflow-action.sh
  ✓ capture-claude-tasks.sh

Skills:
  ✓ /next-task
  ✓ /review-ticket
  ✓ /review-epic
  ✓ /demo
  ✓ /reconcile-learnings

Database:
  ✓ SQLite database at ~/.local/share/brain-dump/brain-dump.db
  ✓ All migrations applied
  ✓ Workflow tables exist

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: 1 issue found

To fix VS Code:
  brain-dump install --vscode
```

#### Per-Project vs Global Configuration

| Component      | Scope       | Location                      |
| -------------- | ----------- | ----------------------------- |
| MCP Server     | Global      | User config files             |
| Workflow Hooks | Global      | `~/.claude/hooks/`            |
| General Skills | Global      | `~/.claude/commands/`         |
| Project Skills | Per-Project | `.claude/commands/`           |
| Project Hooks  | Per-Project | `.claude/hooks/` (in project) |

**Rationale**:

- MCP server is the same for all projects (connects to same database)
- Workflow hooks enforce the same quality standards everywhere
- Skills like `/next-task` work the same everywhere
- Projects can ADD custom skills/hooks but not remove global ones

#### Required Changes to Existing Scripts

**Current State**: `install.sh` and `uninstall.sh` exist but may not handle all environments.

**Changes Needed**:

| File           | Current                       | Needed Change                            |
| -------------- | ----------------------------- | ---------------------------------------- |
| `install.sh`   | Installs for Claude Code only | Add OpenCode, VS Code, Cursor MCP config |
| `install.sh`   | May not install global hooks  | Add `install_hooks()` function           |
| `install.sh`   | May not install global skills | Add `install_skills()` function          |
| `uninstall.sh` | May only clean Claude Code    | Add cleanup for all 4 environments       |
| `uninstall.sh` | May not remove hooks          | Add `uninstall_hooks()` function         |
| `uninstall.sh` | May not remove skills         | Add `uninstall_skills()` function        |
| `cli/index.ts` | No `doctor` command           | Add `brain-dump doctor` verification     |

**New Files Needed**:

| File                                      | Purpose                                 |
| ----------------------------------------- | --------------------------------------- |
| `hooks/enforce-workflow-preconditions.sh` | PreToolUse hook for workflow gates      |
| `hooks/document-workflow-action.sh`       | PostToolUse hook for comments/telemetry |
| `.claude/commands/next-task.md`           | Global skill for picking next task      |
| `.claude/commands/review-ticket.md`       | Global skill for ticket review          |
| `.claude/commands/review-epic.md`         | Global skill for epic review            |
| `.claude/commands/demo.md`                | Global skill for demo generation        |
| `.claude/commands/reconcile-learnings.md` | Global skill for updating docs          |

**Environment Detection Logic**:

```bash
# Detect which environments are installed
detect_environments() {
  ENVS=""

  # Claude Code - check for claude CLI
  if command -v claude &> /dev/null; then
    ENVS="$ENVS claude-code"
  fi

  # OpenCode - check for opencode CLI
  if command -v opencode &> /dev/null; then
    ENVS="$ENVS opencode"
  fi

  # VS Code - check for code CLI or config dir
  if command -v code &> /dev/null || [ -d "$HOME/.vscode" ]; then
    ENVS="$ENVS vscode"
  fi

  # Cursor - check for cursor CLI or config dir
  if command -v cursor &> /dev/null || [ -d "$HOME/.cursor" ]; then
    ENVS="$ENVS cursor"
  fi

  echo "$ENVS"
}
```

**Config File Locations by OS**:

| Environment | macOS                                                     | Linux                                 | Windows                               |
| ----------- | --------------------------------------------------------- | ------------------------------------- | ------------------------------------- |
| Claude Code | `~/.claude/settings.json`                                 | `~/.claude/settings.json`             | `%APPDATA%\claude\settings.json`      |
| OpenCode    | `~/.opencode/config.json`                                 | `~/.opencode/config.json`             | `%APPDATA%\opencode\config.json`      |
| VS Code     | `~/Library/Application Support/Code/User/settings.json`   | `~/.config/Code/User/settings.json`   | `%APPDATA%\Code\User\settings.json`   |
| Cursor      | `~/Library/Application Support/Cursor/User/settings.json` | `~/.config/Cursor/User/settings.json` | `%APPDATA%\Cursor\User\settings.json` |

**MCP Config Differences**:

```jsonc
// Claude Code / OpenCode (similar format)
// Location: ~/.claude/settings.json or ~/.opencode/config.json
{
  "mcpServers": {
    "brain-dump": {
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"]
    }
  }
}

// VS Code - Workspace config
// Location: .vscode/mcp.json (per-project, shareable with team)
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"],
      "env": {}
    }
  }
}

// VS Code - User settings (global)
// Location: ~/Library/Application Support/Code/User/settings.json (macOS)
//           ~/.config/Code/User/settings.json (Linux)
// Run "MCP: Add Server" command and select "Global"

// Cursor (similar to VS Code)
// Location: .cursor/mcp.json or Cursor settings
{
  "servers": {
    "brain-dump": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/mcp-server/index.js"]
    }
  }
}
```

**VS Code Additional Setup**:

VS Code requires enabling MCP features and optionally installing custom instructions:

```bash
# 1. Enable MCP in VS Code settings
# Add to settings.json or run via command palette:
# "chat.mcp.enabled": true
# "chat.mcp.discovery.enabled": true  # Auto-detect from Claude Desktop config

# 2. Install custom instructions for workflow enforcement
mkdir -p .github
cat > .github/copilot-instructions.md << 'EOF'
# Brain Dump Workflow

When working on Brain Dump tickets:

## Required Workflow
1. Start work: `start_ticket_work({ ticketId })`
2. Write micro-plan using TaskCreate
3. Implement changes
4. Validate: `pnpm check`
5. Complete: `complete_ticket_work({ ticketId, summary })`

## Telemetry
- Call `log_tool_event` for significant operations
- The MCP server tracks session automatically

## Status Flow
in_progress → ai_review → human_review → done
EOF

# 3. Optionally install agent skills
mkdir -p .github/skills
# Copy skill files from brain-dump installation
```

**VS Code MCP Server Trust**:

On first use, VS Code will prompt to trust the MCP server:

1. Server appears in Extensions view under "MCP Servers"
2. Click to start the server
3. Confirm trust when prompted
4. Server tools become available in Copilot chat

---
