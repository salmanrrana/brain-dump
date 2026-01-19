# Brain Dump UI Greenfield Sprint Plan

**Version:** 1.0
**Approach:** Greenfield UI rebuild on feature branch
**Stack:** TanStack Start + TanStack Query + TanStack Router (unchanged)
**Total Estimated Hours:** ~185-200 hours
**Sprints:** 7

---

## Development Strategy

### Parallel Development Setup

The new UI lives in a **feature branch** and runs on a **different port** so both UIs can run simultaneously for comparison and testing.

```
┌─────────────────────────────────────────────────────────────┐
│                    PARALLEL DEVELOPMENT                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   main branch (port 4242)      feature/ui-v2 (port 4243)    │
│   ┌─────────────────┐          ┌─────────────────┐          │
│   │   Current UI    │          │    New UI       │          │
│   │   (working)     │          │   (in dev)      │          │
│   └────────┬────────┘          └────────┬────────┘          │
│            │                            │                    │
│            └──────────┬─────────────────┘                    │
│                       │                                      │
│                       ▼                                      │
│            ┌─────────────────────┐                           │
│            │   Shared Database   │                           │
│            │   (SQLite)          │                           │
│            └─────────────────────┘                           │
│                       │                                      │
│            ┌─────────────────────┐                           │
│            │   Shared Backend    │                           │
│            │   src/api/*         │                           │
│            │   mcp-server/*      │                           │
│            └─────────────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Branch Strategy

```bash
# Create feature branch
git checkout -b feature/ui-v2

# Development workflow
git checkout main           # Run old UI on port 4242
pnpm dev

# In another terminal
git checkout feature/ui-v2  # Run new UI on port 4243
pnpm dev:v2
```

### Package.json Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "dev": "vinxi dev --port 4242",
    "dev:v2": "vinxi dev --port 4243",
    "build": "vinxi build",
    "start": "vinxi start"
  }
}
```

### What's Shared (Unchanged)

These files are **NOT modified** - both UIs use them:

```
src/api/                    # All server functions
├── tickets.ts              # Ticket CRUD
├── projects.ts             # Project CRUD
├── epics.ts                # Epic CRUD
├── settings.ts             # Settings CRUD
├── terminal.ts             # Launch actions (Claude, Ralph, OpenCode)
├── ralph.ts                # Ralph workflow
├── search.ts               # FTS5 search
└── services.ts             # Service discovery

src/lib/
├── schema.ts               # Database schema (Drizzle)
├── db.ts                   # Database connection
├── xdg.ts                  # XDG path utilities
├── backup.ts               # Backup logic
└── logging.ts              # Logging utilities

mcp-server/                 # MCP integration (standalone)
cli/                        # CLI tool
```

### What's Rebuilt (New Files)

```
src/components/             # All new components
src/routes/                 # New route structure
src/styles.css              # New with CSS variables
src/lib/theme.ts            # New theme system
src/lib/hooks.ts            # Keep queries, add UI hooks
```

---

## Tech Stack (Confirmed)

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | TanStack Start | React 19 + Vite + Nitro |
| Server State | TanStack Query | Existing hooks preserved |
| Routing | TanStack Router | File-based routing |
| Database | SQLite + Drizzle ORM | Unchanged |
| Styling | Tailwind CSS v4 + CSS Variables | New theme system |
| Drag & Drop | @dnd-kit | Unchanged |
| Icons | lucide-react | New (standardized) |

---

## Sprint 0: Setup (2-3 hours)

**Goal:** Create feature branch, configure parallel development, verify both UIs can run.

| Task | Description | Est. Hours |
|------|-------------|------------|
| 0.1 | Create `feature/ui-v2` branch | 0.25h |
| 0.2 | Add `dev:v2` script to package.json (port 4243) | 0.25h |
| 0.3 | Create `src/components-v2/` directory (temporary during dev) | 0.25h |
| 0.4 | Verify both UIs run simultaneously (different terminals) | 0.5h |
| 0.5 | Document parallel dev workflow in branch README | 0.5h |

**Validation:** Run `pnpm dev` and `pnpm dev:v2` simultaneously, both apps load without conflict.

---

## Sprint 1: Foundation & Design System (28-32 hours)

**Goal:** Establish theme system, CSS variables, and atomic component library.

**Demo:** Launch new UI at localhost:4243, see app shell with theme switcher. Toggle Ember/Mint/Solar themes.

**Prerequisites:** Sprint 0 complete

---

### Epic 1.1: Theme System

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 1.1.1 | Create CSS variables with `:root` and `[data-theme]` | `src/styles/variables.css` | Visual | All 3 themes defined: Ember (orange), Mint (emerald), Solar (gold). Base colors: `--bg-primary` (#0a0a0a), `--bg-secondary` (#111111), etc. |
| 1.1.2 | Create ThemeContext with localStorage persistence | `src/lib/theme.ts` | `src/lib/theme.test.ts` | `useTheme()` returns `{theme, setTheme}`. Persists to `brain-dump-theme` key. |
| 1.1.3 | Create ThemeProvider component | `src/components/ui/ThemeProvider.tsx` | Unit test | Wraps app, sets `data-theme` attribute on document |
| 1.1.4 | Create ThemeSwitcher component | `src/components/ui/ThemeSwitcher.tsx` | Unit test | 3 color dot buttons, click changes theme, current theme highlighted |
| 1.1.5 | Integrate theme CSS into styles.css | `src/styles.css` (new) | Visual | Tailwind + variables imported, body uses CSS variables |

---

### Epic 1.2: Base Component Library

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 1.2.1 | Button component (4 variants) | `src/components/ui/Button.tsx` | `Button.test.tsx` | primary (gradient), secondary, ghost, danger. Disabled state. |
| 1.2.2 | Input component | `src/components/ui/Input.tsx` | `Input.test.tsx` | text, search, textarea variants. Focus ring uses `--accent-primary`. |
| 1.2.3 | Select component | `src/components/ui/Select.tsx` | `Select.test.tsx` | Custom styled dropdown, chevron icon, keyboard nav. |
| 1.2.4 | Card component | `src/components/ui/Card.tsx` | Visual | Base card with `--bg-card`, optional glow prop for AI-active state. |
| 1.2.5 | Badge component | `src/components/ui/Badge.tsx` | Unit test | status, priority, pr-status variants with correct colors. |
| 1.2.6 | IconButton component | `src/components/ui/IconButton.tsx` | Visual | Square button for icons, hover state. |
| 1.2.7 | Toggle component | `src/components/ui/Toggle.tsx` | `Toggle.test.tsx` | Switch style, gradient fill when on. |
| 1.2.8 | Checkbox component | `src/components/ui/Checkbox.tsx` | Visual | Styled checkbox with accent checkmark. |

---

### Epic 1.3: Modal Foundation

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 1.3.1 | Modal base component | `src/components/ui/Modal.tsx` | `Modal.test.tsx` | Overlay with backdrop blur, focus trap, Escape closes, animation. |
| 1.3.2 | ModalHeader subcomponent | (in Modal.tsx) | Visual | Gradient icon area, title, close button per mockup. |
| 1.3.3 | ModalBody, ModalFooter | (in Modal.tsx) | Visual | Scrollable body, sticky footer with actions. |
| 1.3.4 | useModal hook | `src/lib/modal-hooks.ts` | Unit test | `{isOpen, open, close, toggle}` state management. |

---

### Epic 1.4: App Shell

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 1.4.1 | Create root layout | `src/routes/__root.tsx` | Visual | Grid: 64px sidebar + 1fr content. ThemeProvider wraps app. |
| 1.4.2 | Create Toast component | `src/components/ui/Toast.tsx` | Visual | Success/error/info variants, uses theme colors. |
| 1.4.3 | Create ToastProvider | `src/lib/toast.tsx` | Unit test | `useToast()` hook for showing toasts. |

---

### Sprint 1 Testing Checklist

- [ ] All theme variants render correctly
- [ ] Theme persists across refresh
- [ ] All button variants render
- [ ] Modal opens/closes with animation
- [ ] Focus trap works in modal
- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes

**Sprint 1 Deliverable:** App shell with theme switching. Compare at port 4242 (old) vs 4243 (new).

---

## Sprint 2: Navigation & Layout (26-30 hours)

**Goal:** Build icon sidebar, header with search, projects panel, and dashboard view.

**Demo:** Navigate between Dashboard/Board views. Open Projects panel. Search tickets.

**Prerequisites:** Sprint 1 complete

---

### Epic 2.1: Icon Sidebar

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 2.1.1 | IconSidebar component | `src/components/navigation/IconSidebar.tsx` | `IconSidebar.test.tsx` | 64px width, 4 nav items (Dashboard, Board, Projects, Settings). |
| 2.1.2 | NavItem component | `src/components/navigation/NavItem.tsx` | Visual | Icon + tooltip, active state with gradient background and glow. |
| 2.1.3 | Sidebar routing integration | (in IconSidebar.tsx) | E2E | Clicks navigate to correct routes. |

---

### Epic 2.2: Header

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 2.2.1 | Header component | `src/components/navigation/Header.tsx` | Visual | Logo area, search, view indicator, status pills. |
| 2.2.2 | SearchBar with FTS5 | `src/components/navigation/SearchBar.tsx` | `SearchBar.test.tsx` | Dropdown results, keyboard nav, uses existing search API. |
| 2.2.3 | StatusPill component | `src/components/navigation/StatusPill.tsx` | Visual | Shows Docker status, AI active with pulse animation. |
| 2.2.4 | NewTicketDropdown | `src/components/navigation/NewTicketDropdown.tsx` | Visual | "New Ticket" + "Start from Scratch" options. |

---

### Epic 2.3: Projects Panel

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 2.3.1 | ProjectsPanel component | `src/components/navigation/ProjectsPanel.tsx` | `ProjectsPanel.test.tsx` | 320px slide-out from left, covers sidebar (z-index 100). |
| 2.3.2 | ProjectItem component | `src/components/navigation/ProjectItem.tsx` | Visual | Icon, name, path, ticket stats, AI indicator. |
| 2.3.3 | useProjectsPanel hook | `src/lib/navigation-hooks.ts` | Unit test | Open/close state, click-outside to close. |
| 2.3.4 | Panel search filtering | (in ProjectsPanel.tsx) | Manual | Filter projects by name as user types. |

---

### Epic 2.4: Dashboard View

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 2.4.1 | Dashboard route | `src/routes/dashboard.tsx` | Visual | Stats grid, current focus, up next queue. |
| 2.4.2 | StatsGrid component | `src/components/dashboard/StatsGrid.tsx` | Unit test | 4 stat cards: total, in progress, AI active, done. |
| 2.4.3 | CurrentFocusCard | `src/components/dashboard/CurrentFocusCard.tsx` | Visual | Shows active ticket, click navigates to detail. |
| 2.4.4 | UpNextQueue | `src/components/dashboard/UpNextQueue.tsx` | Visual | Next 5 tickets in priority order. |

---

### Sprint 2 Testing Checklist

- [ ] Navigation between Dashboard/Board works
- [ ] Projects panel opens/closes
- [ ] Click outside closes panel
- [ ] Search returns results from FTS5
- [ ] Dashboard stats are accurate
- [ ] Compare navigation with old UI (port 4242)

**Sprint 2 Deliverable:** Full navigation working. Side-by-side comparison possible.

---

## Sprint 3: Kanban Board (30-34 hours)

**Goal:** Build kanban board with new card design and drag-and-drop.

**Demo:** View board with 7 columns. Drag tickets between columns. See priority borders, AI glow.

**Prerequisites:** Sprint 2 complete

---

### Epic 3.1: Board Layout

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 3.1.1 | KanbanBoard component | `src/components/board/KanbanBoard.tsx` | Visual | Horizontal scroll container, 7 columns. |
| 3.1.2 | KanbanColumn component | `src/components/board/KanbanColumn.tsx` | Visual | Header with count, drop zone, empty state. |
| 3.1.3 | Board route | `src/routes/index.tsx` | E2E | Default route shows kanban board. |

---

### Epic 3.2: Ticket Cards

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 3.2.1 | TicketCard component | `src/components/board/TicketCard.tsx` | `TicketCard.test.tsx` | Priority left border (red/orange/gray), title, tags. |
| 3.2.2 | AI-active glow state | (in TicketCard.tsx) | Visual | Pulse animation when ticket is being worked on. |
| 3.2.3 | GitInfo component | `src/components/board/GitInfo.tsx` | Visual | Branch badge, PR badge with status colors. |
| 3.2.4 | TicketTags component | `src/components/board/TicketTags.tsx` | Visual | Tag pills, max 3 visible + "+N more". |

---

### Epic 3.3: Drag and Drop

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 3.3.1 | DndProvider setup | `src/components/board/DndProvider.tsx` | Visual | @dnd-kit context wraps board. |
| 3.3.2 | SortableTicketCard | `src/components/board/SortableTicketCard.tsx` | E2E | Draggable ticket card wrapper. |
| 3.3.3 | DragOverlay | (in KanbanBoard.tsx) | Visual | Card preview while dragging. |
| 3.3.4 | Status update on drop | (in KanbanBoard.tsx) | E2E | Uses existing `updateTicket` API, invalidates query. |

---

### Epic 3.4: Board Filtering

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 3.4.1 | BoardHeader with filters | `src/components/board/BoardHeader.tsx` | Visual | Project, epic, tag filter chips. |
| 3.4.2 | useFilters hook | `src/lib/filter-hooks.ts` | Unit test | Filter state, URL sync. |
| 3.4.3 | Filter integration | (in KanbanBoard.tsx) | E2E | Filters applied via TanStack Query. |

---

### Sprint 3 Testing Checklist

- [ ] All 7 columns render
- [ ] Drag and drop updates status
- [ ] Position persists after drag
- [ ] Priority borders correct
- [ ] AI glow animates
- [ ] Filters work
- [ ] Compare board with old UI

**Sprint 3 Deliverable:** Fully functional kanban board. Feature parity with old board.

---

## Sprint 4: Ticket Flows (32-36 hours)

**Goal:** Build Create/Edit Ticket modals with activity section and launch actions.

**Demo:** Create ticket, edit ticket, add comment, use "Start with Claude" button.

**Prerequisites:** Sprint 3 complete

---

### Epic 4.1: Create Ticket Modal

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 4.1.1 | CreateTicketModal shell | `src/components/tickets/CreateTicketModal.tsx` | Visual | Uses Modal base, 2-column form layout. |
| 4.1.2 | Form fields | (in CreateTicketModal.tsx) | E2E | Title, description, project, priority, epic, tags. |
| 4.1.3 | EpicSelect (dependent) | `src/components/tickets/EpicSelect.tsx` | Unit test | Filters epics by selected project. |
| 4.1.4 | TagInput component | `src/components/tickets/TagInput.tsx` | `TagInput.test.tsx` | Add/remove pills, autocomplete existing tags. |
| 4.1.5 | Form validation | (in CreateTicketModal.tsx) | Unit test | Required fields, error display. |
| 4.1.6 | Submit with TanStack Query | (in CreateTicketModal.tsx) | E2E | Uses existing `createTicket` mutation, invalidates board query. |

---

### Epic 4.2: Edit Ticket Modal

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 4.2.1 | EditTicketModal shell | `src/components/tickets/EditTicketModal.tsx` | Visual | Extends Create modal pattern, loads ticket data. |
| 4.2.2 | Status dropdown | (in EditTicketModal.tsx) | Visual | 7 status options. |
| 4.2.3 | Blocked toggle | `src/components/tickets/BlockedToggle.tsx` | Visual | Checkbox + reason input when checked. |
| 4.2.4 | SubtaskList component | `src/components/tickets/SubtaskList.tsx` | `SubtaskList.test.tsx` | Add/remove/check subtasks. |
| 4.2.5 | Delete with confirmation | (in EditTicketModal.tsx) | E2E | Danger button, confirmation modal. |

---

### Epic 4.3: Launch Actions

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 4.3.1 | LaunchActions section | `src/components/tickets/LaunchActions.tsx` | Visual | "Start Work With" header, option cards. |
| 4.3.2 | SplitButton component | `src/components/ui/SplitButton.tsx` | `SplitButton.test.tsx` | Main action + dropdown chevron. |
| 4.3.3 | LaunchOption items | (in LaunchActions.tsx) | Visual | Claude (recommended), Ralph Native, Ralph Docker, OpenCode. |
| 4.3.4 | Integration with terminal API | (in LaunchActions.tsx) | Manual | Uses existing `launchTerminal` server function. |

---

### Epic 4.4: Activity Section

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 4.4.1 | ActivitySection container | `src/components/tickets/ActivitySection.tsx` | Visual | Scrollable comment list, input at bottom. |
| 4.4.2 | Comment component | `src/components/tickets/Comment.tsx` | Visual | 4 types: progress (teal), work-summary (purple), test-report (green), user (default). |
| 4.4.3 | CommentAvatar | `src/components/tickets/CommentAvatar.tsx` | Visual | Gradient backgrounds by author type. |
| 4.4.4 | CommentInput | `src/components/tickets/CommentInput.tsx` | Unit test | Textarea + submit, uses existing API. |
| 4.4.5 | Code block rendering | (in Comment.tsx) | Visual | Syntax highlighting in work summaries. |

---

### Sprint 4 Testing Checklist

- [ ] Create ticket flow works
- [ ] Edit ticket loads data
- [ ] Status change persists
- [ ] Subtasks add/remove/check
- [ ] Launch actions open terminal
- [ ] Comments display correctly
- [ ] New comment posts

**Sprint 4 Deliverable:** All ticket CRUD flows working. Compare with old modals.

---

## Sprint 5: Detail Views & Project Flows (26-30 hours)

**Goal:** Build Ticket Detail drill-down, Project/Epic modals, Inception flow.

**Demo:** Click ticket to drill down. Edit project. Create epic. Use "Start from Scratch".

**Prerequisites:** Sprint 4 complete

---

### Epic 5.1: Ticket Detail View

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 5.1.1 | Ticket detail route | `src/routes/ticket.$id.tsx` | E2E | Route `/ticket/:id` loads ticket. |
| 5.1.2 | BackNavigation | `src/components/navigation/BackNavigation.tsx` | Visual | "← Back to Board" link. |
| 5.1.3 | TicketDetailHeader | `src/components/tickets/TicketDetailHeader.tsx` | Visual | Title, status badge, edit button. |
| 5.1.4 | TicketDescription | `src/components/tickets/TicketDescription.tsx` | Visual | Formatted markdown with code blocks. |
| 5.1.5 | SubtasksProgress | `src/components/tickets/SubtasksProgress.tsx` | `SubtasksProgress.test.tsx` | Progress bar, checklist, "No subtasks" state. |
| 5.1.6 | RelatedTickets panel | `src/components/tickets/RelatedTickets.tsx` | Visual | Other tickets in same epic. |
| 5.1.7 | Full activity timeline | (reuse ActivitySection) | Visual | No height limit in detail view. |

---

### Epic 5.2: Project Modals

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 5.2.1 | CreateProjectModal | `src/components/projects/CreateProjectModal.tsx` | E2E | Name, path (with browse), color. |
| 5.2.2 | EditProjectModal | `src/components/projects/EditProjectModal.tsx` | E2E | Extends Create, adds preview, working method, delete. |
| 5.2.3 | ColorPicker component | `src/components/ui/ColorPicker.tsx` | Visual | Dropdown with color swatches. |
| 5.2.4 | WorkingMethodSelect | `src/components/projects/WorkingMethodSelect.tsx` | Visual | Claude/OpenCode/VS Code/Cursor options. |

---

### Epic 5.3: Epic Modal

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 5.3.1 | CreateEpicModal | `src/components/epics/CreateEpicModal.tsx` | E2E | Title, description, color. |
| 5.3.2 | "Create New" in epic dropdown | (in EpicSelect.tsx) | Manual | Option to create epic inline. |

---

### Epic 5.4: Inception Flow

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 5.4.1 | InceptionModal | `src/components/inception/InceptionModal.tsx` | Visual | Hero with rocket icon, AI explanation, launch options. |
| 5.4.2 | Skip AI link | (in InceptionModal.tsx) | Manual | Opens CreateProjectModal directly. |
| 5.4.3 | Wire to NewTicketDropdown | (in NewTicketDropdown.tsx) | E2E | "Start from Scratch" opens InceptionModal. |

---

### Sprint 5 Testing Checklist

- [ ] Ticket detail loads from URL
- [ ] Back navigation works
- [ ] Project CRUD flow works
- [ ] Epic CRUD flow works
- [ ] Inception launches correctly
- [ ] MCP tools still work

**Sprint 5 Deliverable:** All 10 user flows functional.

---

## Sprint 6: Settings & Polish (24-28 hours)

**Goal:** Build tabbed Settings modal, keyboard navigation, responsive design, accessibility.

**Demo:** Configure settings in tabs. Navigate app with keyboard. View on mobile.

**Prerequisites:** Sprint 5 complete

---

### Epic 6.1: Settings Modal

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 6.1.1 | SettingsModal (tabbed) | `src/components/settings/SettingsModal.tsx` | Visual | 4 tabs: General, Ralph, Git, Enterprise. |
| 6.1.2 | TabNav component | `src/components/settings/TabNav.tsx` | Unit test | Tab buttons with icons, active state. |
| 6.1.3 | GeneralTab | `src/components/settings/GeneralTab.tsx` | E2E | Projects directory, terminal, working method. |
| 6.1.4 | RalphTab | `src/components/settings/RalphTab.tsx` | E2E | Docker status, sandbox toggle, timeout, runtime. |
| 6.1.5 | GitTab | `src/components/settings/GitTab.tsx` | E2E | Auto-create PR, target branch, branch naming. |
| 6.1.6 | EnterpriseTab | `src/components/settings/EnterpriseTab.tsx` | E2E | Logging toggle, retention, theme picker. |

---

### Epic 6.2: Keyboard Navigation

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 6.2.1 | Global shortcuts hook | `src/lib/keyboard-shortcuts.ts` | Unit test | n=new ticket, /=search, ?=help, Esc=close. |
| 6.2.2 | Sidebar keyboard nav | (in IconSidebar.tsx) | Manual | 1-4 keys navigate views. |
| 6.2.3 | Board keyboard nav | (in KanbanBoard.tsx) | Manual | Arrow keys move focus, Enter opens ticket. |
| 6.2.4 | Shortcuts help modal | `src/components/ui/ShortcutsModal.tsx` | Visual | Lists all keyboard shortcuts. |

---

### Epic 6.3: Responsive Design

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 6.3.1 | Mobile sidebar | (in IconSidebar.tsx) | Visual | Collapsible, hamburger menu on < 768px. |
| 6.3.2 | Responsive board | (in KanbanBoard.tsx) | Visual | Horizontal scroll, touch-friendly. |
| 6.3.3 | Responsive modals | (in Modal.tsx) | Visual | Full-screen on mobile. |

---

### Epic 6.4: Accessibility

| Task ID | Title | Files to Create | Tests | Acceptance Criteria |
|---------|-------|-----------------|-------|---------------------|
| 6.4.1 | ARIA labels | (throughout) | Axe audit | All interactive elements labeled. |
| 6.4.2 | Focus indicators | (in variables.css) | Visual | Visible focus rings, WCAG AA contrast. |
| 6.4.3 | Skip-to-content link | (in __root.tsx) | Manual | Hidden link visible on focus. |
| 6.4.4 | Reduced motion support | (in variables.css) | Manual | `prefers-reduced-motion` disables animations. |

---

### Sprint 6 Testing Checklist

- [ ] All settings persist
- [ ] Tab navigation works
- [ ] Keyboard shortcuts work
- [ ] Mobile layout functional
- [ ] Accessibility audit passes

**Sprint 6 Deliverable:** Settings complete, app polished. Ready for final testing.

---

## Sprint 7: Testing & Performance (20-24 hours)

**Goal:** E2E tests for all flows, performance optimization, visual regression, final polish.

**Demo:** Run full test suite. Lighthouse 90+. Demo all 10 flows.

**Prerequisites:** Sprint 6 complete

---

### Epic 7.1: E2E Tests (10 Flows)

| Task ID | Title | Test File | Acceptance Criteria |
|---------|-------|-----------|---------------------|
| 7.1.1 | Create Ticket flow | `e2e/create-ticket.spec.ts` | Create ticket, verify on board. |
| 7.1.2 | Edit Ticket flow | `e2e/edit-ticket.spec.ts` | Edit fields, verify changes. |
| 7.1.3 | Ticket Detail drill-down | `e2e/ticket-detail.spec.ts` | Navigate to detail, back to board. |
| 7.1.4 | Create Epic flow | `e2e/epic.spec.ts` | Create epic, assign to ticket. |
| 7.1.5 | Create Project flow | `e2e/project.spec.ts` | Create project from panel. |
| 7.1.6 | Edit Project flow | `e2e/project.spec.ts` | Double-click, edit, save. |
| 7.1.7 | Inception flow | `e2e/inception.spec.ts` | Start from scratch, launch AI. |
| 7.1.8 | Launch Actions | `e2e/launch.spec.ts` | Start with Claude button works. |
| 7.1.9 | Settings flow | `e2e/settings.spec.ts` | Change settings, verify persist. |
| 7.1.10 | Projects Panel | `e2e/navigation.spec.ts` | Open panel, select project, filter. |

---

### Epic 7.2: Performance

| Task ID | Title | Files | Acceptance Criteria |
|---------|-------|-------|---------------------|
| 7.2.1 | Memoization audit | (throughout) | React.memo where needed, no unnecessary re-renders. |
| 7.2.2 | Bundle analysis | (vite config) | Main bundle < 200kb. |
| 7.2.3 | Query optimization | `src/lib/hooks.ts` | Proper staleTime, no over-fetching. |
| 7.2.4 | Lazy load routes | (route files) | Dashboard, ticket detail lazy loaded. |

---

### Epic 7.3: Visual Regression

| Task ID | Title | Test File | Acceptance Criteria |
|---------|-------|-----------|---------------------|
| 7.3.1 | Theme screenshots | `e2e/visual/themes.spec.ts` | All 3 themes captured. |
| 7.3.2 | Component screenshots | `e2e/visual/components.spec.ts` | Key components captured. |

---

### Epic 7.4: Final Polish

| Task ID | Title | Files | Acceptance Criteria |
|---------|-------|-------|---------------------|
| 7.4.1 | Loading skeletons | `src/components/ui/Skeleton.tsx` | Skeleton states for async data. |
| 7.4.2 | Error boundaries | `src/components/ui/ErrorBoundary.tsx` | Graceful error handling. |
| 7.4.3 | Empty states | `src/components/ui/EmptyState.tsx` | "No tickets" etc. states. |
| 7.4.4 | Animation polish | (throughout) | Consistent timing, smooth transitions. |

---

### Sprint 7 Testing Checklist

- [ ] All E2E tests pass
- [ ] Lighthouse performance > 90
- [ ] Lighthouse accessibility > 90
- [ ] No visual regressions
- [ ] Compare feature parity with old UI

**Sprint 7 Deliverable:** Production-ready UI. Merge to main.

---

## Merge Checklist

Before merging `feature/ui-v2` to `main`:

- [ ] All E2E tests pass
- [ ] All unit tests pass
- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` succeeds
- [ ] Lighthouse scores > 90
- [ ] Manual testing of all 10 flows
- [ ] Side-by-side comparison complete
- [ ] No regressions in functionality
- [ ] MCP tools work with new UI
- [ ] CLI tool works with new UI
- [ ] Documentation updated

---

## Summary

| Sprint | Goal | Hours | Key Deliverables |
|--------|------|-------|------------------|
| 0 | Setup | 2-3h | Branch, parallel dev config |
| 1 | Foundation | 28-32h | Theme system, component library |
| 2 | Navigation | 26-30h | Sidebar, header, projects panel, dashboard |
| 3 | Kanban Board | 30-34h | Board, cards, drag-and-drop |
| 4 | Ticket Flows | 32-36h | Create/Edit modals, launch actions, activity |
| 5 | Detail Views | 26-30h | Ticket detail, project/epic modals, inception |
| 6 | Polish | 24-28h | Settings, keyboard nav, responsive, a11y |
| 7 | Testing | 20-24h | E2E tests, performance, visual regression |
| **Total** | | **~190-220h** | **Complete UI rebuild** |

---

## File Structure

```
src/
├── components/
│   ├── ui/                     # Sprint 1 (atomic)
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── IconButton.tsx
│   │   ├── Toggle.tsx
│   │   ├── Checkbox.tsx
│   │   ├── Modal.tsx
│   │   ├── SplitButton.tsx
│   │   ├── ColorPicker.tsx
│   │   ├── Toast.tsx
│   │   ├── Skeleton.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ThemeProvider.tsx
│   │   ├── ThemeSwitcher.tsx
│   │   └── ShortcutsModal.tsx
│   ├── navigation/             # Sprint 2
│   │   ├── IconSidebar.tsx
│   │   ├── NavItem.tsx
│   │   ├── Header.tsx
│   │   ├── SearchBar.tsx
│   │   ├── StatusPill.tsx
│   │   ├── NewTicketDropdown.tsx
│   │   ├── ProjectsPanel.tsx
│   │   ├── ProjectItem.tsx
│   │   └── BackNavigation.tsx
│   ├── dashboard/              # Sprint 2
│   │   ├── StatsGrid.tsx
│   │   ├── CurrentFocusCard.tsx
│   │   └── UpNextQueue.tsx
│   ├── board/                  # Sprint 3
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   ├── TicketCard.tsx
│   │   ├── SortableTicketCard.tsx
│   │   ├── GitInfo.tsx
│   │   ├── TicketTags.tsx
│   │   ├── BoardHeader.tsx
│   │   └── DndProvider.tsx
│   ├── tickets/                # Sprint 4-5
│   │   ├── CreateTicketModal.tsx
│   │   ├── EditTicketModal.tsx
│   │   ├── EpicSelect.tsx
│   │   ├── TagInput.tsx
│   │   ├── BlockedToggle.tsx
│   │   ├── SubtaskList.tsx
│   │   ├── LaunchActions.tsx
│   │   ├── ActivitySection.tsx
│   │   ├── Comment.tsx
│   │   ├── CommentAvatar.tsx
│   │   ├── CommentInput.tsx
│   │   ├── TicketDetailHeader.tsx
│   │   ├── TicketDescription.tsx
│   │   ├── SubtasksProgress.tsx
│   │   └── RelatedTickets.tsx
│   ├── projects/               # Sprint 5
│   │   ├── CreateProjectModal.tsx
│   │   ├── EditProjectModal.tsx
│   │   └── WorkingMethodSelect.tsx
│   ├── epics/                  # Sprint 5
│   │   └── CreateEpicModal.tsx
│   ├── inception/              # Sprint 5
│   │   └── InceptionModal.tsx
│   └── settings/               # Sprint 6
│       ├── SettingsModal.tsx
│       ├── TabNav.tsx
│       ├── GeneralTab.tsx
│       ├── RalphTab.tsx
│       ├── GitTab.tsx
│       └── EnterpriseTab.tsx
├── routes/
│   ├── __root.tsx
│   ├── index.tsx               # Board
│   ├── dashboard.tsx
│   └── ticket.$id.tsx
├── lib/
│   ├── theme.ts                # Theme context + hook
│   ├── modal-hooks.ts          # Modal state
│   ├── navigation-hooks.ts     # Panel state
│   ├── filter-hooks.ts         # Board filters
│   ├── keyboard-shortcuts.ts   # Global shortcuts
│   ├── toast.tsx               # Toast context
│   ├── hooks.ts                # TanStack Query (keep existing)
│   └── constants.ts            # Update for new design
├── styles/
│   ├── styles.css              # Main styles
│   └── variables.css           # CSS variables
└── api/                        # UNCHANGED
    ├── tickets.ts
    ├── projects.ts
    ├── epics.ts
    ├── settings.ts
    ├── terminal.ts
    ├── ralph.ts
    └── search.ts
```
