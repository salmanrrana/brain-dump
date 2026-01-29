# Brain Dump - Project Specification

## Overview

Brain Dump is a personal task management system that combines the best of JIRA and Trello. It provides a local-first, cross-project task tracking system with deep Claude Code integration.

**Primary goal:** Create tickets and track work across all your projects in one place, with the ability to hand off tasks to Claude Code with full context.

---

## Core Concepts

### Hierarchy

```
Projects (directory-bound codebases)
  └── Epics (large features/themes)
        └── Tickets (actionable tasks)
              └── Subtasks (checklist items)
```

- **Project**: Tied to a specific directory path on your filesystem
- **Epic**: A large feature or theme within a project (e.g., "Auth System", "Dashboard Redesign")
- **Ticket**: An actionable work item within an epic
- **Subtask**: A checklist item within a ticket

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start (React) |
| Routing | TanStack Router |
| Data Fetching | TanStack Query |
| Database | SQLite (via better-sqlite3 or Drizzle ORM) |
| Styling | Tailwind CSS |
| Drag & Drop | dnd-kit or @hello-pangea/dnd |

### Data Location

```
~/.brain-dump/
  ├── brain-dump.db     # SQLite database
  └── attachments/      # Uploaded files
```

---

## Technical Requirements

### Code Quality & Feedback Loops

Strong feedback loops are essential for both human development and Ralph automation:

| Requirement | Tool | Purpose |
|-------------|------|---------|
| Type Safety | TypeScript (strict mode) | Catch errors at compile time |
| Type Checking | `pnpm type-check` | Verify all types before commit |
| Unit Tests | Vitest | Test individual functions/components |
| Integration Tests | Vitest + Testing Library | Test component interactions |
| E2E Tests | Playwright | Test full user flows |
| Linting | ESLint + Prettier | Consistent code style |
| Pre-commit Hooks | Husky + lint-staged | Enforce quality before commit |

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Required npm Scripts

```json
{
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "check": "pnpm type-check && pnpm lint && pnpm test"
  }
}
```

### CI Requirements

Every commit must pass:
1. `pnpm type-check` - No TypeScript errors
2. `pnpm lint` - No ESLint errors
3. `pnpm test` - All unit/integration tests pass
4. `pnpm build` - Production build succeeds

### Database Requirements

- Use Drizzle ORM for type-safe database access
- All schema changes via migrations (never manual SQL)
- Foreign key constraints enforced
- Indexes on frequently queried columns

### Error Handling

- All async operations wrapped in try/catch
- User-facing errors show friendly messages
- Console errors include stack traces in dev
- No unhandled promise rejections

### Accessibility

- All interactive elements keyboard accessible
- Proper ARIA labels on custom components
- Focus management in modals
- Color contrast meets WCAG AA

---

## Ralph - Agent Orchestration

Ralph is a simple bash loop that runs Claude Code autonomously through a product backlog. Instead of complex multi-phase plans or agent SDKs, Ralph mimics how real engineers work: look at the task board, pick the next incomplete task, complete it, commit, repeat.

### Philosophy

1. Look at the task board (PRD)
2. Pick the first incomplete task
3. Complete it with all checks passing
4. Commit
5. Repeat until done

### File Structure

```
brain-dump/
├── plans/
│   ├── ralph.sh              # Autonomous loop runner
│   ├── ralph-once.sh         # Single iteration (human-in-loop)
│   ├── prd.json              # Product requirements / task backlog
│   └── progress.txt          # Agent memory across iterations
```

### prd.json Format

```json
{
  "project": "brain-dump",
  "description": "Personal task management with Claude Code integration",
  "spec": "SPEC.md",
  "items": [
    {
      "id": "BD-001",
      "title": "Project setup with TanStack Start",
      "description": "Initialize TanStack Start project with TypeScript, Tailwind, and Drizzle ORM",
      "acceptance_criteria": [
        "pnpm dev starts the dev server",
        "pnpm type-check passes",
        "pnpm build produces production bundle"
      ],
      "passes": false
    }
  ]
}
```

### ralph.sh (Autonomous Mode)

```bash
#!/bin/bash
set -e

MAX_ITERATIONS=$1
cd "$(dirname "$0")/.."

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo "=========================================="
  echo "Ralph iteration $i of $MAX_ITERATIONS"
  echo "=========================================="

  OUTPUT=$(claude -p "$(cat <<'EOF'
You are Ralph, working on the brain-dump project.

## Read these files first
- plans/prd.json - List of tasks
- plans/progress.txt - What's been done
- SPEC.md - Full project spec

## Your job
1. Find the FIRST item in plans/prd.json where "passes" is false
2. Implement that feature completely
3. Run: pnpm type-check && pnpm lint && pnpm test
4. Fix any failures
5. Update prd.json - set "passes": true
6. APPEND to plans/progress.txt what you did
7. Git commit with message: "feat(BD-XXX): description"

## Rules
- ONE task per iteration
- ALL checks must pass before marking complete
- Keep changes minimal
- Never skip tests

If ALL items have "passes": true, output exactly: RALPH_COMPLETE
EOF
)")

  echo "$OUTPUT"

  if echo "$OUTPUT" | grep -q "RALPH_COMPLETE"; then
    echo "All PRD items complete!"
    exit 0
  fi
done

echo "Reached max iterations ($MAX_ITERATIONS)"
```

### ralph-once.sh (Human-in-Loop)

```bash
#!/bin/bash
set -e
cd "$(dirname "$0")/.."

claude -p "$(cat <<'EOF'
You are Ralph, working on the brain-dump project.

## Read these files first
- plans/prd.json - List of tasks
- plans/progress.txt - What's been done
- SPEC.md - Full project spec

## Your job
1. Find the FIRST item in plans/prd.json where "passes" is false
2. Implement that feature completely
3. Run: pnpm type-check && pnpm lint && pnpm test
4. Fix any failures
5. Update prd.json - set "passes": true
6. APPEND to plans/progress.txt what you did
7. Git commit with message: "feat(BD-XXX): description"

## Rules
- ONE task per iteration
- ALL checks must pass before marking complete
- Keep changes minimal
- Never skip tests

If ALL items have "passes": true, let me know the sprint is complete!
EOF
)"
```

### Running Ralph

```bash
# Autonomous mode - runs up to 10 iterations
./plans/ralph.sh 10

# Human-in-loop mode - runs once, you review
./plans/ralph-once.sh
```

### Ralph Best Practices

1. **Small tasks** - Each PRD item should be completable in one context window
2. **Clear acceptance criteria** - Unambiguous, testable conditions
3. **Strong feedback loops** - Type checking + tests + linting must pass
4. **Git commits per task** - Clean history, easy to review/revert
5. **Progress memory** - progress.txt gives context across iterations
6. **Backstop limit** - Max iterations prevents infinite loops

### Future: Integration with Brain Dump

Eventually, Ralph can read tasks directly from the Brain Dump SQLite database instead of prd.json. The "Start Work" button in the UI would trigger Ralph for a specific ticket, creating a closed loop where you manage tasks in the UI and Ralph executes them

---

## Views

### Kanban Board

Five columns:
1. **Backlog** - Ideas and future work
2. **Ready** - Defined and ready to start
3. **In Progress** - Currently being worked on
4. **Review** - Self-review before marking done
5. **Done** - Completed work

Tickets can be dragged between columns and reordered within columns.

### List View

Sortable/filterable table view with columns:
- Title
- Status
- Priority
- Epic
- Tags
- Created date

### View Toggle

Global toggle button switches between Kanban and List view. Affects all visible tickets.

---

## Navigation

### Persistent Sidebar

Always-visible sidebar containing:
- Project tree (expandable)
  - Epics within each project
- Quick filters:
  - All tickets
  - My blocked tickets
  - Unassigned (no epic)
- Tag filter (multi-select)

Click any project/epic to filter the main board.

---

## Ticket Properties

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| `id` | string | auto | UUID |
| `title` | string | yes | Short description |
| `description` | text | no | Markdown supported |
| `status` | enum | yes | backlog, ready, in_progress, review, done |
| `priority` | enum | no | high, medium, low |
| `position` | number | auto | Manual drag order (persists) |
| `project_id` | FK | yes | Parent project |
| `epic_id` | FK | no | Parent epic (optional) |
| `tags` | string[] | no | Free-form tags |
| `subtasks` | json | no | Array of {text, completed} |
| `is_blocked` | boolean | no | Blocked flag |
| `blocked_reason` | text | no | Why it's blocked |
| `linked_files` | string[] | no | File paths for context |
| `attachments` | string[] | no | Uploaded file references |
| `created_at` | datetime | auto | |
| `updated_at` | datetime | auto | |
| `completed_at` | datetime | auto | Set when moved to done |

### Priority & Ordering

- Priority labels: High, Medium, Low (or none)
- Manual drag ordering takes precedence over priority
- Position persists exactly where you drop a ticket

### Blocked Flag

- Blocked is a flag, not a separate column
- Displays as a red badge/icon on the ticket card
- Blocked tickets remain in their current column
- Optional blocked_reason field

---

## Project Properties

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| `id` | string | auto | UUID |
| `name` | string | yes | Display name |
| `path` | string | yes | Absolute directory path |
| `color` | string | no | Accent color for UI |
| `created_at` | datetime | auto | |

---

## Epic Properties

| Property | Type | Required | Notes |
|----------|------|----------|-------|
| `id` | string | auto | UUID |
| `title` | string | yes | Epic name |
| `description` | text | no | What this epic covers |
| `project_id` | FK | yes | Parent project |
| `color` | string | no | Color coding |
| `created_at` | datetime | auto | |

---

## Claude Code Integration

### How It Works

1. Claude Code reads and writes to the same SQLite database
2. The web app and Claude Code share state through the database
3. Claude Code can create, update, and complete tickets

### Deep Link: "Start Work" Button

When you click "Start Work" on a ticket:

1. Generates a context payload with:
   - Ticket title and description
   - Subtasks checklist
   - Parent epic description
   - Linked file paths
   - Summaries of related completed tickets in same epic
   - Project directory path

2. Triggers terminal command:
   ```bash
   cd /path/to/project && claude --resume "ticket-context"
   ```

   Or copies context to clipboard if terminal launch fails.

### Context Format (passed to Claude Code)

```markdown
# Task: [Ticket Title]

## Project
Name: [Project Name]
Path: [/path/to/project]

## Epic Context
[Epic description]

## Description
[Ticket description]

## Subtasks
- [ ] Subtask 1
- [ ] Subtask 2

## Relevant Files
- src/components/Auth.tsx
- src/lib/auth.ts

## Related Completed Work
- [Previous ticket 1 summary]
- [Previous ticket 2 summary]
```

### Claude Code Skills (Future)

Potential `/brain-dump` skill that:
- Lists current tickets: `/brain-dump list`
- Creates a ticket: `/brain-dump add "title" --epic "epic-name"`
- Updates status: `/brain-dump done ticket-123`
- Shows ticket context: `/brain-dump show ticket-123`

---

## Search

Full-text search across:
- Ticket title
- Ticket description
- Subtask text
- Tags
- Epic name

Search bar in top navigation, filters results in real-time.

---

## Ticket Lifecycle

```
Create → Backlog → Ready → In Progress → Review → Done → Archive
                         ↓
                    [Blocked flag]
```

### Completed Tickets

- Move to "Done" column
- Remain visible in Done column (recent)
- Searchable in history
- `completed_at` timestamp set

### Deletion

- Confirmation dialog required
- Permanent deletion (no trash bin)

---

## File Attachments

- Drag-and-drop or click to upload
- Stored in `~/.brain-dump/attachments/`
- Filename format: `{ticket-id}/{uuid}-{original-name}`
- Displayed inline in ticket detail view
- Image previews supported

---

## UI/UX

### Theme

- **Dark mode default** (and primary focus)
- Light mode available as toggle

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  [Search...]           [View Toggle] [+ New Ticket] │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Projects │              Main Board Area                     │
│ ├─ Proj1 │         (Kanban or List View)                   │
│ │  └─Epic│                                                  │
│ ├─ Proj2 │                                                  │
│          │                                                  │
│ Tags     │                                                  │
│ ○ frontend                                                  │
│ ○ backend │                                                  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

### Ticket Card (Kanban)

```
┌────────────────────────────┐
│ [●] Ticket title          │ ← [●] = Blocked indicator
│ #frontend #api            │ ← Tags
│ ────────────────────────  │
│ Epic Name        [HIGH]   │ ← Priority badge
│ ☐ 2/5 subtasks            │ ← Subtask progress
└────────────────────────────┘
```

### Keyboard Shortcuts (v1 - Nice to Have)

| Key | Action |
|-----|--------|
| `n` | New ticket |
| `/` | Focus search |
| `?` | Show shortcuts |
| `Esc` | Close modal/deselect |

---

## Onboarding

First launch creates sample data:
- 1 example project ("Sample Project")
- 1 example epic ("Getting Started")
- 3-4 example tickets showing different states
- Clear "Delete all sample data" button

---

## What's NOT in v1

- Multi-user / authentication
- External integrations (GitHub, etc.)
- Due dates / deadlines
- Time tracking / estimates
- Desktop notifications
- Mobile-optimized view
- AI-powered ticket creation in web UI (uses Claude Code instead)

---

## Database Schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE epics (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  color TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'backlog',
  priority TEXT,
  position REAL NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  epic_id TEXT REFERENCES epics(id) ON DELETE SET NULL,
  tags TEXT, -- JSON array
  subtasks TEXT, -- JSON array of {text, completed}
  is_blocked INTEGER DEFAULT 0,
  blocked_reason TEXT,
  linked_files TEXT, -- JSON array of file paths
  attachments TEXT, -- JSON array of attachment paths
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

CREATE INDEX idx_tickets_project ON tickets(project_id);
CREATE INDEX idx_tickets_epic ON tickets(epic_id);
CREATE INDEX idx_tickets_status ON tickets(status);

-- Full-text search
CREATE VIRTUAL TABLE tickets_fts USING fts5(
  title,
  description,
  tags,
  content=tickets,
  content_rowid=rowid
);
```

---

## API Routes (TanStack Start Server Functions)

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Epics
- `GET /api/projects/:projectId/epics` - List epics
- `POST /api/epics` - Create epic
- `PUT /api/epics/:id` - Update epic
- `DELETE /api/epics/:id` - Delete epic

### Tickets
- `GET /api/tickets` - List/filter tickets
- `GET /api/tickets/:id` - Get ticket with context
- `POST /api/tickets` - Create ticket
- `PUT /api/tickets/:id` - Update ticket
- `PATCH /api/tickets/:id/status` - Update status only
- `PATCH /api/tickets/:id/position` - Update position only
- `DELETE /api/tickets/:id` - Delete ticket

### Attachments
- `POST /api/attachments` - Upload file
- `DELETE /api/attachments/:id` - Delete file

### Search
- `GET /api/search?q=...` - Full-text search

### Claude Context
- `GET /api/tickets/:id/context` - Get formatted context for Claude Code

---

## File Structure

```
brain-dump/
├── app/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx           # Main board view
│   │   └── api/
│   │       ├── projects.ts
│   │       ├── epics.ts
│   │       ├── tickets.ts
│   │       └── search.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── board/
│   │   │   ├── KanbanBoard.tsx
│   │   │   ├── KanbanColumn.tsx
│   │   │   ├── TicketCard.tsx
│   │   │   └── ListView.tsx
│   │   ├── tickets/
│   │   │   ├── TicketModal.tsx
│   │   │   ├── TicketForm.tsx
│   │   │   ├── SubtaskList.tsx
│   │   │   └── AttachmentUpload.tsx
│   │   ├── projects/
│   │   │   ├── ProjectForm.tsx
│   │   │   └── EpicForm.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Modal.tsx
│   │       ├── Badge.tsx
│   │       └── ...
│   ├── lib/
│   │   ├── db.ts               # SQLite connection
│   │   ├── schema.ts           # Drizzle schema
│   │   └── claude-context.ts   # Context generator
│   └── styles/
│       └── globals.css
├── drizzle/
│   └── migrations/
├── package.json
├── tailwind.config.ts
├── drizzle.config.ts
└── app.config.ts
```

---

## Implementation Phases

### Phase 1: Foundation
- Project setup (TanStack Start, SQLite, Tailwind)
- Database schema and migrations
- Basic CRUD for projects, epics, tickets
- Simple list view of tickets

### Phase 2: Kanban Board
- Kanban view with drag-and-drop
- Column management
- View toggle (Kanban/List)

### Phase 3: Full Ticket Features
- Ticket detail modal
- Subtasks
- Tags
- Blocked flag
- File attachments

### Phase 4: Navigation & Search
- Sidebar with project/epic tree
- Tag filtering
- Full-text search

### Phase 5: Claude Integration
- Context generation for tickets
- "Start Work" deep link
- Terminal command trigger

### Phase 6: Polish
- Dark mode styling
- Keyboard shortcuts
- Sample data onboarding
- Edge case handling

---

## Success Criteria

v1 is complete when:
1. Can create projects with directory paths
2. Can create epics within projects
3. Can create tickets with all properties
4. Kanban board with drag-and-drop works
5. List view with sorting works
6. Full-text search returns results
7. Can click "Start Work" and open Claude Code with context
8. File attachments upload and display
9. Dark mode looks good
10. Sample data appears on first launch
