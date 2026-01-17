# Kanban & Ticket Workflow

> **Track every ticket from idea to deployed, with full AI activity history.**

Your kanban board is the single source of truth. Every ticket, every status change, every AI work session—all tracked automatically.

---

## TL;DR — Quick Reference

| Action | How |
|--------|-----|
| Create project | Settings → "Add Project" → Select folder |
| Create ticket | Click "+" in any column |
| Start work | Click "Start with Claude" on ticket |
| Move ticket | Drag to new column |
| Complete work | `complete_ticket_work(ticketId)` or drag to Done |

**Status flow:** `backlog` → `ready` → `in_progress` → `review` → `done`

**AI flow:** `in_progress` → `ai_review` → `human_review` → `done`

---

## See a Ticket's Full Journey

Here's what happens when you work a ticket from start to finish:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. CREATE TICKET                                                           │
│     └─ "Add user authentication"                                            │
│     └─ Status: backlog, Position: 1.0                                       │
│     └─ Tags: ["auth", "security"], Priority: high                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  2. GROOM & READY                                                           │
│     └─ Add acceptance criteria, link reference files                        │
│     └─ Drag to "Ready" column                                               │
│     └─ Status: ready                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  3. START WORK                                                              │
│     └─ Click "Start with Claude"                                            │
│     └─ MCP: start_ticket_work("ticket-id")                                  │
│     └─ Branch created: feature/abc-user-auth                                │
│     └─ Status: in_progress                                                  │
│     └─ Comment auto-added: "Starting work on: Add user authentication"      │
├─────────────────────────────────────────────────────────────────────────────┤
│  4. IMPLEMENT                                                               │
│     └─ Claude writes AuthService.ts, LoginForm.tsx                          │
│     └─ Tests added and passing                                              │
│     └─ Commits linked to ticket automatically                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  5. COMPLETE                                                                │
│     └─ MCP: complete_ticket_work("ticket-id", "Added OAuth + email login")  │
│     └─ Status: review                                                       │
│     └─ Work summary comment added                                           │
│     └─ PRD updated: passes = true                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  6. REVIEW & DONE                                                           │
│     └─ Human reviews PR                                                     │
│     └─ Drag to "Done" column                                                │
│     └─ Status: done, completedAt: timestamp                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Result:** Full audit trail of who did what, when, and why.

---

## Data Hierarchy

Brain Dump uses a simple hierarchy:

```
Project → Epic (optional) → Ticket → Comments
```

```mermaid
flowchart TB
    subgraph "📁 Project Layer"
        P["Project<br/>────────────<br/>• Filesystem path<br/>• Working method<br/>• Color theme"]
    end

    subgraph "📋 Organization Layer"
        E1["Epic: Auth<br/>────────────<br/>• Groups related work<br/>• Optional"]
        E2["Epic: Dashboard"]
    end

    subgraph "🎫 Work Layer"
        T1["Ticket: Login form"]
        T2["Ticket: OAuth"]
        T3["Ticket: Charts"]
        T4["Ticket: Filters"]
    end

    subgraph "💬 Activity Layer"
        C1["Comment: Work summary"]
        C2["Comment: Test results"]
    end

    P --> E1
    P --> E2
    E1 --> T1
    E1 --> T2
    E2 --> T3
    E2 --> T4
    T1 --> C1
    T1 --> C2

    style P fill:#4f46e5,color:#fff
    style E1 fill:#7c3aed,color:#fff
    style E2 fill:#7c3aed,color:#fff
    style T1 fill:#ec4899,color:#fff
    style T2 fill:#ec4899,color:#fff
    style T3 fill:#ec4899,color:#fff
    style T4 fill:#ec4899,color:#fff
```

---

## Creating Projects

```mermaid
flowchart LR
    A["Create Project<br/>(name, path, color)"] --> B{Directory<br/>exists?}
    B -->|No| C["Error:<br/>Directory not found"]
    B -->|Yes| D{Path<br/>already used?}
    D -->|Yes| E["Error:<br/>Project exists"]
    D -->|No| F["Generate UUID"]
    F --> G["Save to database"]
    G --> H["Project ready ✅"]

    style C fill:#ef4444,color:#fff
    style E fill:#ef4444,color:#fff
    style H fill:#22c55e,color:#fff
```

**Project Fields:**

| Field | Purpose |
|-------|---------|
| `path` | Links project to filesystem (must be unique) |
| `workingMethod` | `auto`, `claude-code`, `vscode`, `opencode` |
| `color` | UI theme color for visual distinction |

---

## Creating Tickets

```mermaid
flowchart LR
    A["Create Ticket<br/>(title, projectId)"] --> B{Project<br/>exists?}
    B -->|No| C["Error"]
    B -->|Yes| D{Epic ID<br/>provided?}
    D -->|Yes| E{Epic exists<br/>in project?}
    E -->|No| F["Error"]
    E -->|Yes| G["Calculate position"]
    D -->|No| G
    G --> H["Set status: backlog"]
    H --> I["Save ticket"]
    I --> J["Ticket ready ✅"]

    style C fill:#ef4444,color:#fff
    style F fill:#ef4444,color:#fff
    style J fill:#22c55e,color:#fff
```

**Ticket Fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `title` | string | Short description (shown on card) |
| `description` | markdown | Full context for AI (acceptance criteria, etc.) |
| `status` | enum | Kanban column |
| `priority` | enum | `high`, `medium`, `low` |
| `tags` | array | Categorization (filterable) |
| `subtasks` | array | Checklist items |
| `linkedFiles` | array | Reference paths for AI context |
| `position` | float | Sort order within column |

---

## Ticket Status Flow

Tickets flow through seven possible statuses:

```mermaid
stateDiagram-v2
    [*] --> backlog: Created
    backlog --> ready: Groomed
    ready --> in_progress: Work started
    in_progress --> review: Code complete
    in_progress --> ai_review: Ralph working
    ai_review --> human_review: AI done
    human_review --> done: Approved
    review --> done: Approved
    done --> [*]

    note right of ai_review: 🤖 Ralph autonomous flow
    note right of review: 👤 Manual review flow
```

**Status Descriptions:**

| Status | Meaning | Who's Working | Column Color |
|--------|---------|---------------|--------------|
| `backlog` | Not yet ready | Nobody | Slate |
| `ready` | Groomed and ready | Nobody | Slate |
| `in_progress` | Active development | Human or AI | Slate |
| `review` | Manual code review | Human reviewer | Slate |
| `ai_review` | Ralph completed work | Awaiting human | **Amber** |
| `human_review` | Human verifying AI | Human reviewer | **Rose** |
| `done` | Complete | Nobody | Slate |

---

## Kanban Board

### 7 Columns

```mermaid
flowchart LR
    subgraph Board["Kanban Board"]
        subgraph Col1["Backlog"]
            T1["Ticket 1"]
            T2["Ticket 2"]
        end
        subgraph Col2["Ready"]
            T3["Ticket 3"]
        end
        subgraph Col3["In Progress"]
            T4["Ticket 4"]
        end
        subgraph Col4["Review"]
            T5["Ticket 5"]
        end
        subgraph Col5["AI Review 🤖"]
            T6["Ticket 6"]
        end
        subgraph Col6["Human Review 👤"]
            T7["Ticket 7"]
        end
        subgraph Col7["Done ✅"]
            T8["Ticket 8"]
        end
    end

    style Col5 fill:#fbbf24,color:#000
    style Col6 fill:#fb7185,color:#000
```

### Drag and Drop

```mermaid
sequenceDiagram
    participant User
    participant Board as Kanban Board
    participant API
    participant DB as Database

    User->>Board: Drag ticket card
    Board->>Board: Show drag overlay

    User->>Board: Drop on new column
    Board->>Board: Calculate new position
    Board->>API: updateTicketStatus()
    API->>DB: UPDATE tickets SET status, position
    DB-->>API: Success
    API-->>Board: Updated ticket
    Board->>Board: Re-render
```

### Position Calculation

Positions are floating-point numbers, allowing infinite insertions:

```mermaid
flowchart TD
    A["Drop ticket"] --> B{Where<br/>dropped?}

    B -->|"Empty column"| C["position = lastTicket + 1"]
    B -->|"On existing ticket"| D{First<br/>position?}

    D -->|Yes| E["position = target / 2"]
    D -->|No| F["position = (prev + target) / 2"]

    C --> G["Update database"]
    E --> G
    F --> G
```

**Example:**
```
Existing positions: [1.0, 2.0, 3.0]
Drop between 1.0 and 2.0 → position = 1.5
Drop before 1.0 → position = 0.5
Drop after 3.0 → position = 4.0
```

---

## MCP Tools

### Creating Tickets

```typescript
create_ticket({
  projectId: "uuid",
  title: "Add login form",
  description: "## Overview\n...",
  priority: "high",
  epicId: "optional-uuid",
  tags: ["auth", "frontend"]
})
```

### Workflow Tools

```mermaid
flowchart LR
    A["start_ticket_work"] --> B["Creates branch<br/>Sets in_progress<br/>Posts comment"]
    C["complete_ticket_work"] --> D["Sets review<br/>Updates PRD<br/>Suggests next"]
    E["add_ticket_comment"] --> F["Logs activity<br/>Work summaries<br/>Test reports"]

    style A fill:#6366f1,color:#fff
    style C fill:#22c55e,color:#fff
    style E fill:#f59e0b,color:#000
```

### Querying

```typescript
// List tickets with filters
list_tickets({
  projectId: "uuid",
  status: "in_progress",
  limit: 20
})

// Find tickets linked to a file
get_tickets_for_file({
  filePath: "src/api/auth.ts"
})
```

---

## Deletion Safety

All delete operations use **dry-run by default**:

```mermaid
flowchart TD
    A["Delete request<br/>confirm=false"] --> B["Count affected items"]
    B --> C["Return preview:<br/>• Tickets to delete<br/>• Comments to delete<br/>• Epics to unlink"]

    D["Delete request<br/>confirm=true"] --> E["Transaction:<br/>1. Delete comments<br/>2. Delete tickets<br/>3. Delete epics<br/>4. Delete project"]
    E --> F["Return confirmation ✅"]

    style C fill:#fbbf24,color:#000
    style F fill:#22c55e,color:#fff
```

**Cascade Rules:**

| Delete | What Happens |
|--------|--------------|
| Project | All epics, tickets, and comments deleted |
| Epic | Tickets **unlinked** (not deleted) |
| Ticket | All comments deleted |

---

## Troubleshooting

### Ticket not showing on board

**Cause:** Ticket might be in a different project or have a filter applied

**Fix:**
1. Check the project selector in the sidebar
2. Clear any status filters
3. Search by ticket title: `list_tickets({ title: "your search" })`

### Drag and drop not working

**Cause:** Usually a stale UI state

**Fix:**
1. Refresh the page
2. Check browser console for errors
3. Ensure you're dragging from the ticket card, not buttons

### Ticket stuck in wrong status

**Cause:** MCP tool might have failed mid-operation

**Fix:**
```typescript
// Manually update status
update_ticket_status({
  ticketId: "your-ticket-id",
  status: "ready"  // or desired status
})
```

### Comments not appearing

**Cause:** TanStack Query cache might be stale

**Fix:**
1. Refresh the page
2. Click on another ticket and back
3. Check that the comment was actually created: `get_ticket_comments({ ticketId: "..." })`

---

## Ready to Start Working?

1. **Create a project** — Link a folder from your filesystem
2. **Add some tickets** — Describe what you want built
3. **Click "Start with Claude"** — AI gets full context automatically
4. **Watch the magic** — Status updates, commits linked, work tracked

**Pro tip:** Write detailed acceptance criteria in the ticket description. The AI will use them to know when the work is complete.

---

## Related Documentation

- [Ralph Workflow](./ralph-workflow.md) — Autonomous ticket processing
- [MCP Tools Reference](../mcp-tools.md) — Full API documentation
- [Main README](../../README.md) — Quick start guide
