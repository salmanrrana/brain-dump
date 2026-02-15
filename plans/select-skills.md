# Feature: Skill Hints for Implementation and Review

## Overview

Enable users to specify skills that should be mentioned in implementation and review prompts. When starting work on a ticket or launching a review, Claude receives explicit skill guidance in the context.

---

## Context & Problem

**Problem**: Claude doesn't know which skills are relevant for a specific project. When working on a ticket or reviewing code, Claude should get explicit hints about which skills to load and use.

**Solution**: Simple skill hints layer where:

- Users specify implementation skills for epics/tickets (e.g., "use tanstack-query patterns")
- Users specify review skills for epics/tickets (e.g., "focus on react performance")
- When starting work, prompt includes: `"Use these skills: tanstack-query, brain-dump-workflow"`
- When reviewing, prompt includes: `"Use these skills for review: code-reviewer, react-best-practices"`

**User Requirements**:

- ✅ Skills stored as JSON arrays in epic/ticket records
- ✅ Epic-level defaults with ticket-level overrides
- ✅ Simple UI field to select skills (dropdown/tags)
- ✅ Skills mentioned in workflow context automatically

---

## Database Schema

### Schema Changes (Migration 0010)

**Add columns to existing tables:**

```sql
ALTER TABLE epics ADD COLUMN implementation_skills TEXT DEFAULT '[]';
ALTER TABLE epics ADD COLUMN review_skills TEXT DEFAULT '[]';

ALTER TABLE tickets ADD COLUMN implementation_skills_override TEXT;  -- null = use epic default
ALTER TABLE tickets ADD COLUMN review_skills_override TEXT;          -- null = use epic default
```

**TypeScript Types** (add to `src/lib/schema.ts`):

```typescript
export const epics = sqliteTable("epics", {
  // ... existing fields ...
  implementationSkills: text("implementation_skills").default("[]"), // JSON string[]
  reviewSkills: text("review_skills").default("[]"), // JSON string[]
});

export const tickets = sqliteTable("tickets", {
  // ... existing fields ...
  implementationSkillsOverride: text("implementation_skills_override"), // JSON string[] | null
  reviewSkillsOverride: text("review_skills_override"), // JSON string[] | null
});
```

**Purpose**: Store skill hints that should be mentioned in prompts. Epic-level defaults with ticket-level overrides.

---

## How It Works

### Epic Skill Defaults

1. User opens epic modal
2. Sets "Implementation Skills" (e.g., `["tanstack-query", "brain-dump-workflow"]`)
3. Sets "Review Skills" (e.g., `["code-reviewer", "react-best-practices"]`)
4. Skills are stored in `epics.implementation_skills` and `epics.review_skills`

### Ticket-Level Overrides (Optional)

1. When creating a ticket in an epic, it inherits epic's skills by default
2. User can expand "Skills" section in ticket modal to override
3. Overrides stored in `tickets.implementation_skills_override` and `tickets.review_skills_override`
4. If override is null → use epic's skills

### Context Injection

1. When Claude starts work (`workflow` tool, `action: "start-work"`):
   - Resolve effective skills (ticket override OR epic default)
   - Include in context: `"Use these implementation skills: tanstack-query, brain-dump-workflow"`

2. When Claude reviews code:
   - Include in context: `"Use these review skills: code-reviewer, react-best-practices"`

### What Skills Can Be

Skills are simply strings that map to Claude Code skills:

- `"tanstack-query"` - Use TanStack Query patterns
- `"brain-dump-workflow"` - Follow Brain Dump workflow
- `"code-reviewer"` - Focus on code quality
- `"react-best-practices"` - Follow React performance patterns
- `"custom-auth-patterns"` - Custom project patterns

No validation needed - just text that gets included in the prompt.

---

## UI Implementation

### EpicModal

Add a "Skills" section (inline, after Color field):

```tsx
<div>
  <label>Implementation Skills</label>
  <textarea placeholder="tanstack-query, brain-dump-workflow" value={implementationSkills} onChange={...} />
  <small>Comma-separated list of skills to mention in implementation prompts</small>
</div>

<div>
  <label>Review Skills</label>
  <textarea placeholder="code-reviewer, react-best-practices" value={reviewSkills} onChange={...} />
  <small>Comma-separated list of skills to mention in review prompts</small>
</div>
```

Simple text inputs. No autocomplete needed.

### TicketModal

Add a collapsible "Skills" section:

```tsx
const [showSkills, setShowSkills] = useState(false);

<button onClick={() => setShowSkills(!showSkills)}>
  Skills {ticket.epicId && !overrideMode && <span>(inherited from epic)</span>}
</button>

{showSkills && (
  <div>
    <label>
      <input type="checkbox" onChange={(e) => setOverrideMode(e.target.checked)} />
      Override epic skills
    </label>

    {overrideMode && (
      <>
        <textarea placeholder="..." value={implementationSkills} onChange={...} />
        <textarea placeholder="..." value={reviewSkills} onChange={...} />
      </>
    )}
  </div>
)}
```

Simple, no autocomplete.

---

## Backward Compatibility

**Guarantee**: Epics/tickets with empty skills work unchanged.

**How**:

- Empty skills = empty string in prompt context
- Claude doesn't see any skill hints
- Existing behavior unaffected

**Migration**: Opt-in. Users add skills as they discover patterns worth documenting.

---

## Implementation Plan

### Phase 1: Database Migration (1 day)

**Files to Create**:

- `drizzle/migrations/0010_add_skill_hints.sql` - Add columns to epics and tickets

**Files to Modify**:

- `src/lib/schema.ts` - Add field exports to epics and tickets tables

**Tasks**:

1. Create migration file with ALTER TABLE statements
2. Update schema.ts with new fields
3. Run `pnpm db:migrate` and verify
4. Run tests: `pnpm test`

**Acceptance Criteria**:

- Migration applies cleanly
- Existing data unaffected
- Schema types updated correctly

### Phase 2: MCP Tool Updates (1 day)

**Files to Modify**:

- `mcp-server/core/epic.ts` - Add functions to get/set skills
- `mcp-server/core/ticket.ts` - Add functions to get/set skill overrides
- `mcp-server/core/workflow.ts` - Inject skills into context when starting work
- `mcp-server/tools/epic.ts` - Pass skills through to core
- `mcp-server/tools/ticket.ts` - Pass skills through to core
- `mcp-server/tools/workflow.ts` - Include skills in returned context

**Tasks**:

1. Add getter/setter functions in core modules
2. Extend tool actions to accept/return skills
3. Modify `workflow` `start-work` to include skills in context string
4. Test via Claude Code MCP integration

**Acceptance Criteria**:

- `epic` tool can get/set skills in DB
- `ticket` tool can get/set skill overrides
- `workflow start-work` includes skills in context
- All changes backward compatible (empty skills = no context change)

### Phase 3: UI Components (1-2 days)

**Files to Create**:

- `src/api/skills.ts` - Helper for CRUD operations

**Files to Modify**:

- `src/components/EpicModal.tsx` - Add inline skills section
- `src/components/TicketModal.tsx` - Add collapsible skills section
- `src/lib/hooks.ts` - Add useUpdateEpicSkills, useUpdateTicketSkills mutations

**Tasks**:

1. Add simple textarea inputs to EpicModal
2. Add collapsible section to TicketModal with override toggle
3. Wire up TanStack Query mutations for save/update
4. Test in dev mode: `pnpm dev`

**Acceptance Criteria**:

- EpicModal can save skills
- TicketModal can save skill overrides
- Skills persist to database
- Overrides correctly show "inherited from epic" indicator

### Phase 4: Integration Testing (1 day)

**Files to Create**:

- `e2e/skills.spec.ts` - End-to-end tests

**Tasks**:

1. Test: Create epic → set skills → verify DB
2. Test: Create ticket → override skills → verify inheritance
3. Test: Start work → verify skills in context
4. Test: No skills set → verify empty/default behavior

**Acceptance Criteria**:

- All E2E tests pass
- No regressions in existing Ralph workflow
- Skills correctly propagate from epic to tickets

---

## Summary

**Total Scope**: ~4 days of work

**Simplicity**:

- No validation or skill registry needed
- Just text fields, no autocomplete
- Simple string injection into prompts
- Minimal MCP changes

**Key Files**:

1. `drizzle/migrations/0010_add_skill_hints.sql` - Schema
2. `src/lib/schema.ts` - Types
3. `mcp-server/core/workflow.ts` - Context injection
4. `src/components/EpicModal.tsx` - Epic skills UI
5. `src/components/TicketModal.tsx` - Ticket override UI

---

## Future Enhancements

- Skill autocomplete UI with suggestions
- Skill validation against installed skills
- Skill versioning (e.g., `tanstack-query@v5`)
- Analytics on most-used skills per project
- Skill templates (save/reuse common skill combinations)
