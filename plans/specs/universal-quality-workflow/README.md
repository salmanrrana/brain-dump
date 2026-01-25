# Universal Quality Workflow Spec

This directory contains the complete Universal Quality Workflow specification, split into focused sections for easier context management and ticket linking.

> **Epic**: Universal Quality Workflow
> **Author**: Claude
> **Status**: Draft
> **Inspiration**: Dillon Mulroy's tracer workflow (@dillon_mulroy)

---

## Document Structure

The spec is organized into the following sections:

### [00-overview.md](./00-overview.md)

The high-level context and value proposition. Read this first to understand:

- What the workflow solves
- User value delivered
- System fit
- Key philosophical insights

**Use for tickets about**: Overall workflow architecture, goals, philosophy

---

### [01-reference-tables.md](./01-reference-tables.md)

Complete reference tables covering:

- Ticket statuses (cleaned up workflow states)
- Workflow gates (pre-start, pre-complete, review gates)
- MCP tools (workflow engine)
- Epic workflow gates
- Comments & documentation requirements
- Telemetry events

**Use for tickets about**: Status transitions, gates, validation rules, MCP tool definitions, metrics/telemetry

---

### [02-type-definitions.md](./02-type-definitions.md)

TypeScript interfaces and data structures:

- Ticket/Review/Demo types
- Finding types
- Feedback types
- Comment types

**Use for tickets about**: Schema changes, type safety, database structure, API contracts

---

### [03-state-machine.md](./03-state-machine.md)

State machine diagrams and transitions:

- Ticket lifecycle state machine
- Review state machine
- Demo state machine
- Epic lifecycle state machine

**Use for tickets about**: State transitions, workflow orchestration, state validation

---

### [04-design-decisions.md](./04-design-decisions.md)

Rationale and justification:

- Why this workflow beats alternatives
- Design trade-offs explained
- Key assumptions
- Decision framework

**Use for tickets about**: Understanding "why" a feature exists, design rationale, architecture decisions

---

### [05-implementation-guide.md](./05-implementation-guide.md)

Step-by-step implementation:

- How to build each piece
- Code patterns and examples
- Integration points
- Testing strategy

**Use for tickets about**: Building features, implementation details, code organization

---

### [06-human-review-approval-ui.md](./06-human-review-approval-ui.md)

UI/UX for the human review phase:

- Demo script UI
- Feedback collection
- Approval workflow
- Visual design

**Use for tickets about**: UI components, user flows, approval interface, demo display

---

## How to Link Tickets

When creating a ticket for this epic, link to the specific section(s) relevant to that work:

```bash
# For a ticket about status transitions:
mcp__brain-dump__link_files_to_ticket({
  ticketId: "123",
  files: ["plans/specs/universal-quality-workflow/01-reference-tables.md"]
})

# For a ticket about UI:
mcp__brain-dump__link_files_to_ticket({
  ticketId: "456",
  files: ["plans/specs/universal-quality-workflow/06-human-review-approval-ui.md"]
})

# For a ticket touching multiple sections:
mcp__brain-dump__link_files_to_ticket({
  ticketId: "789",
  files: [
    "plans/specs/universal-quality-workflow/01-reference-tables.md",
    "plans/specs/universal-quality-workflow/05-implementation-guide.md"
  ]
})
```

---

## Migration Notes

- **Original file**: `plans/specs/universal-quality-workflow.md` has been preserved as `universal-quality-workflow.md.backup`
- **No content removed**: All information from the original spec is preserved in these sub-files
- **Clearer context**: Each ticket now loads only the sections it needs, reducing context bloat

---

## Quick Reference

Need something quick? Here's what's in each file:

| Need                           | File                             |
| ------------------------------ | -------------------------------- |
| Status/state definitions       | `01-reference-tables.md`         |
| MCP tool names & preconditions | `01-reference-tables.md`         |
| TypeScript types               | `02-type-definitions.md`         |
| State transitions              | `03-state-machine.md`            |
| Why X instead of Y             | `04-design-decisions.md`         |
| How to build it                | `05-implementation-guide.md`     |
| UI/UX details                  | `06-human-review-approval-ui.md` |
| Overview & philosophy          | `00-overview.md`                 |
