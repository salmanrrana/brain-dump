# Ticket Migration Guide

## What Changed

The monolithic spec file has been split into 7 focused sub-files:

- `plans/specs/universal-quality-workflow/00-overview.md` - Overview & philosophy
- `plans/specs/universal-quality-workflow/01-reference-tables.md` - Status tables, gates, tools
- `plans/specs/universal-quality-workflow/02-type-definitions.md` - TypeScript types
- `plans/specs/universal-quality-workflow/03-state-machine.md` - State machine diagrams
- `plans/specs/universal-quality-workflow/04-design-decisions.md` - Design rationale
- `plans/specs/universal-quality-workflow/05-implementation-guide.md` - Implementation steps
- `plans/specs/universal-quality-workflow/06-human-review-approval-ui.md` - UI/UX for review
- `README.md` - Index and cross-reference guide

**No content was removed** - all information is preserved, just better organized.

---

## Benefits

✅ **Reduced context bloat**: Tickets load only sections they need
✅ **Faster AI processing**: Smaller files = faster reading by Ralph/Claude
✅ **Better navigation**: Easier for humans to find specific sections
✅ **Clearer dependencies**: Each ticket's actual dependencies are explicit

---

## How to Update Your Tickets

### Via Claude Code MCP Tools

For each ticket in the universal-quality-workflow epic:

```javascript
// 1. Find your ticket ID (visible in Brain Dump UI or ticket name)
const ticketId = "123";

// 2. Call link_files_to_ticket with the SPECIFIC sections you need
await mcp_client.link_files_to_ticket({
  ticketId,
  files: [
    "plans/specs/universal-quality-workflow/01-reference-tables.md",
    // Add other relevant sections...
  ],
});
```

### Recommended Mappings by Ticket Type

**Tickets about workflow architecture/gates:**

- `01-reference-tables.md` (status transitions, gates, tools)
- `03-state-machine.md` (state flows)

**Tickets about MCP tool implementation:**

- `01-reference-tables.md` (tool definitions & preconditions)
- `02-type-definitions.md` (input/output types)
- `05-implementation-guide.md` (code examples)

**Tickets about database schema:**

- `02-type-definitions.md` (type definitions)
- `05-implementation-guide.md` (schema changes section)

**Tickets about UI/UX:**

- `06-human-review-approval-ui.md` (all UI content)
- `01-reference-tables.md` (workflow gates that impact UI)

**Tickets about validation/enforcement:**

- `01-reference-tables.md` (gates & validation rules)
- `03-state-machine.md` (state validation logic)

**Tickets about comments/telemetry:**

- `01-reference-tables.md` (Comments & Documentation section, Telemetry Events)

**Tickets about design decisions/philosophy:**

- `04-design-decisions.md`
- `00-overview.md`

**Tickets about end-to-end implementation:**

- `00-overview.md` (context)
- `05-implementation-guide.md` (step-by-step guide)
- `02-type-definitions.md` (types to implement)

---

## Via Brain Dump UI (When Available)

1. Open the ticket in Brain Dump
2. Look for "Linked Files" section
3. Click "Add File"
4. Search for and select the specific section(s)
5. Save

---

## Verification Checklist

After updating a ticket's file links:

- [ ] Ticket links to at least one specific sub-file (not the old monolithic file)
- [ ] All linked files are in `plans/specs/universal-quality-workflow/` directory
- [ ] No tickets link to `universal-quality-workflow.md` in the parent directory (the old file)

---

## Old File Cleanup

Once all tickets are migrated:

1. Verify no tickets link to `plans/specs/universal-quality-workflow.md` (old monolithic file)
2. Delete the old file: `rm plans/specs/universal-quality-workflow.md`
3. Keep `universal-quality-workflow.md.backup` for historical reference

The backup file lets you recover if needed, but won't clutter ticket linking.

---

## Example: Full Migration for a Ticket

**Before:** Ticket ABC-001 links to `plans/specs/universal-quality-workflow.md` (37KB, 3387 lines)

**After:** Ticket ABC-001 links to:

- `plans/specs/universal-quality-workflow/01-reference-tables.md` (52KB in isolation, but clearly scoped)
- `plans/specs/universal-quality-workflow/05-implementation-guide.md` (54KB, focused on one section)

**Result:** Ralph loads ~80KB of focused content instead of 37KB of mixed content, and the context is more targeted.

---

## Questions?

Refer to the README in this directory for file descriptions and quick reference guide.
