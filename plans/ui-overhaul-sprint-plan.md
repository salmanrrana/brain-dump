# Brain Dump UI/UX Overhaul - Sprint Plan

**Version:** 2.0 (Reviewed)
**Total Estimated Hours:** ~261 hours
**Sprints:** 9
**User Flows Covered:** 10

---

## Overview

This sprint plan transforms Brain Dump from its current slate-based dark theme to the "Neon Productivity" design system with three selectable themes (Ember, Mint, Solar), a redesigned navigation architecture, and 10 complete user flows.

### Design Source Files
- `plans/mockups/creative-review.md` - User flows and component specs
- `plans/mockups/stakeholder-review.md` - Stakeholder requirements
- `plans/mockups/combined-navigation-demo.html` - Full app mockup with CSS variables
- `plans/mockups/settings-neon-productivity.html` - Settings modal design
- `plans/mockups/ticket-launch-actions.html` - Launch actions design

### Architecture Principles
- **Test-Driven**: Every epic includes integration tests (Kent C. Dodds philosophy)
- **Atomic Commits**: Each task is independently committable
- **Progressive Enhancement**: Each sprint delivers demoable software
- **Backward Compatible**: Existing functionality preserved

---

## Sprint 1: Theme Foundation and CSS Variables

**Goal**: Establish the CSS variable system and theme infrastructure. At the end of this sprint, the app renders with the default Ember theme using CSS variables.

**Demo**: Open app, inspect element to verify CSS variables are applied. Manually edit `data-theme` attribute to see colors change.

**Prerequisites**: None (first sprint)

---

### Epic 1.1: CSS Variable Foundation

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 1.1.1 | Create theme CSS variable definitions | Create `src/lib/theme.css` | Visual inspection | None | CSS file defines all 3 themes (Ember, Mint, Solar) with `:root` and `[data-theme]` selectors. Variables: `--bg-primary` (#0a0a0a), `--bg-secondary` (#111111), `--bg-tertiary` (#1a1a1a), `--bg-card` (#1f1f1f), `--border-color` (#2a2a2a), `--text-primary` (#fafafa), `--text-secondary` (#a1a1aa), `--text-muted` (#71717a), `--accent-primary`, `--accent-ai`, `--accent-glow`, `--success` (#4ade80), `--warning` (#facc15), `--error` (#f87171) |
| 1.1.2 | Import theme CSS into main styles | Modify `src/styles.css` | Visual inspection | 1.1.1 | `src/styles.css` imports `theme.css`. Body uses `var(--bg-primary)` for background |
| 1.1.3 | Add data-theme attribute to root HTML | Modify `src/routes/__root.tsx` | Visual inspection | 1.1.2 | HTML element has `data-theme="ember"` attribute by default |
| 1.1.4 | Create TypeScript theme type definitions | Create `src/lib/theme.ts` | `src/lib/theme.test.ts` | None | Exports `Theme` type (`"ember" \| "mint" \| "solar"`), `THEMES` array, `ThemeConfig` interface, `getThemeColors()` utility. Tests verify type safety and color values |
| 1.1.5 | Add migration for existing installations | Modify `src/lib/theme.ts` | `src/lib/theme.test.ts` | 1.1.4 | Function `getDefaultTheme()` returns "ember" if no theme set. Tests verify backward compatibility |

---

### Epic 1.2: Component Migration - Core Layout

**Note**: Epic 1.1 MUST complete before starting this epic.

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 1.2.1 | Migrate AppLayout backgrounds to CSS variables | Modify `src/components/AppLayout.tsx` | Visual inspection | 1.1.3 | Replace `bg-slate-950`, `bg-slate-900`, `bg-slate-800` with `bg-[var(--bg-primary)]`, `bg-[var(--bg-secondary)]`, `bg-[var(--bg-tertiary)]` |
| 1.2.2 | Migrate AppLayout borders and text colors | Modify `src/components/AppLayout.tsx` | Visual inspection | 1.2.1 | Replace `border-slate-800`, `text-gray-100`, `text-slate-400`, `text-slate-500` with CSS variable equivalents |
| 1.2.3 | Migrate AppLayout accent colors | Modify `src/components/AppLayout.tsx` | Visual inspection | 1.2.2 | Replace `bg-cyan-600`, `text-cyan-400`, `hover:bg-cyan-500` with `bg-[var(--accent-primary)]` and related |
| 1.2.4 | Migrate index.tsx kanban board colors | Modify `src/routes/index.tsx` | Visual inspection | 1.1.3 | All hardcoded colors in KanbanBoard, BoardColumn, TicketCard use CSS variables |

---

### Epic 1.3: Component Migration - Modals

**Note**: Epic 1.2 MUST complete before starting this epic.

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 1.3.1 | Migrate TicketModal to CSS variables | Modify `src/components/TicketModal.tsx` | Visual inspection | 1.2.4 | All backgrounds, borders, text colors, and accents use CSS variables |
| 1.3.2 | Migrate SettingsModal to CSS variables | Modify `src/components/SettingsModal.tsx` | Visual inspection | 1.2.4 | All colors use CSS variables |
| 1.3.3 | Migrate NewTicketModal to CSS variables | Modify `src/components/NewTicketModal.tsx` | Visual inspection | 1.2.4 | All colors use CSS variables |
| 1.3.4 | Migrate ProjectModal and EpicModal | Modify `src/components/ProjectModal.tsx`, `src/components/EpicModal.tsx` | Visual inspection | 1.2.4 | All colors use CSS variables |
| 1.3.5 | Migrate DeleteConfirmationModal and dialogs | Modify `src/components/DeleteConfirmationModal.tsx`, `src/components/DeleteProjectModal.tsx`, `src/components/ContainerLogsModal.tsx` | Visual inspection | 1.2.4 | All colors use CSS variables |

---

### Epic 1.4: Component Migration - Utilities

**Note**: Epic 1.3 MUST complete before starting this epic.

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 1.4.1 | Migrate Toast component | Modify `src/components/Toast.tsx` | Visual inspection | 1.3.5 | Toast backgrounds and colors use CSS variables |
| 1.4.2 | Migrate ProjectTree component | Modify `src/components/ProjectTree.tsx` | Visual inspection | 1.3.5 | All colors use CSS variables |
| 1.4.3 | Migrate DirectoryPicker component | Modify `src/components/DirectoryPicker.tsx` | Visual inspection | 1.3.5 | All colors use CSS variables |
| 1.4.4 | Update constants.ts status/priority colors | Modify `src/lib/constants.ts` | `src/lib/constants.test.ts` | 1.3.5 | `getStatusColor()`, `getPriorityStyle()`, badge configs updated. Tests verify all color functions return valid CSS variable references |

---

### Epic 1.5: Sprint 1 Integration Testing

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 1.5.1 | Integration test: Theme application | Create `src/lib/__tests__/theme-integration.test.tsx` | Self | 1.4.4 | Test verifies: (1) Default theme is Ember, (2) CSS variables are applied to DOM, (3) All three themes have different accent colors |
| 1.5.2 | Integration test: All components render | Add to `e2e/theme.spec.ts` | Self | 1.5.1 | E2E test opens app, verifies no console errors, screenshots each theme variant |

**Sprint 1 Deliverable**: App renders with Ember theme colors via CSS variables. Manual theme change by editing `data-theme` attribute works. All tests pass.

---

## Sprint 2: Theme Switching and Persistence

**Goal**: Complete theme system with user selection, persistence, and Settings integration.

**Demo**: Open Settings modal, switch between themes, refresh page and verify theme persists.

**Prerequisites**: Sprint 1 complete

---

### Epic 2.1: Theme Context and Persistence

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 2.1.1 | Create ThemeContext provider | Create `src/lib/ThemeContext.tsx` | `src/lib/ThemeContext.test.tsx` | Sprint 1 | Context provides `theme`, `setTheme()`. Tests verify context updates DOM attribute |
| 2.1.2 | Create useTheme hook | Modify `src/lib/hooks.ts` | Add to existing test file | 2.1.1 | `useTheme()` hook returns `{theme, setTheme, themes}`. Tests verify hook returns correct values |
| 2.1.3 | Persist theme to localStorage | Modify `src/lib/ThemeContext.tsx` | `src/lib/ThemeContext.test.tsx` | 2.1.1 | Theme persists across page refreshes. Key: `brain-dump-theme`. Tests verify localStorage read/write |
| 2.1.4 | Create database migration for theme storage | Create migration via `pnpm db:generate` | `pnpm db:migrate` | 2.1.1 | Settings table has `theme` column (varchar, nullable, default "ember") |
| 2.1.5 | Update settings server function | Modify `src/api/settings.ts` | Existing settings tests | 2.1.4 | `getSettings()` and `updateSettings()` handle theme field |
| 2.1.6 | Sync theme with database settings | Modify `src/lib/ThemeContext.tsx` | `src/lib/ThemeContext.test.tsx` | 2.1.5 | Theme setting stored in settings table, synced on load. Tests verify DB sync |

---

### Epic 2.2: Theme Switcher UI

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 2.2.1 | Create ThemeSwitcher component | Create `src/components/ThemeSwitcher.tsx` | `src/components/ThemeSwitcher.test.tsx` | 2.1.2 | Component shows 3 theme options (Ember, Mint, Solar) with color dot previews. Tests verify click changes theme |
| 2.2.2 | Add ThemeSwitcher to Settings modal | Modify `src/components/SettingsModal.tsx` | Manual verification | 2.2.1 | Theme selection appears in Enterprise tab under "Appearance" section |
| 2.2.3 | Add animation to theme transitions | Modify `src/lib/theme.css` | Visual inspection | 2.2.1 | CSS transition on `background-color`, `border-color`, `color` (200ms ease) |

---

### Epic 2.3: Settings Modal Tabs Redesign

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 2.3.1 | Create TabNavigation component | Create `src/components/ui/TabNavigation.tsx` | `src/components/ui/TabNavigation.test.tsx` | Sprint 1 | Reusable tab component with icon support, active state styling. Tests verify tab switching |
| 2.3.2a | Extract existing settings sections | Modify `src/components/SettingsModal.tsx`, Create `src/components/settings/*.tsx` | Manual verification | 2.3.1 | Create `GeneralSettings.tsx`, `RalphSettings.tsx`, `GitSettings.tsx`, `EnterpriseSettings.tsx` components |
| 2.3.2b | Wire up tab navigation | Modify `src/components/SettingsModal.tsx` | Manual verification | 2.3.2a | Tabs navigate between extracted section components |
| 2.3.2c | Test all settings interactions | `src/components/SettingsModal.test.tsx` | Self | 2.3.2b | Tests verify all settings save correctly in tabbed layout |
| 2.3.3 | Create section header component | Create `src/components/ui/SectionHeader.tsx` | Visual inspection | Sprint 1 | Reusable component for section headers with icon |
| 2.3.4 | Migrate Settings content to tab panels | Modify `src/components/SettingsModal.tsx` | Manual verification | 2.3.2c | All existing settings fields organized into 4 tabs: General, Ralph, Git & PRs, Enterprise |

---

### Epic 2.4: Sprint 2 Integration Testing

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 2.4.1 | Integration test: Theme switching | Add to `e2e/theme.spec.ts` | Self | 2.3.4 | E2E test: Open settings, switch theme, verify DOM update, refresh and verify persistence |
| 2.4.2 | Integration test: Settings tabs | Add to `e2e/settings.spec.ts` | Self | 2.4.1 | E2E test: Navigate all tabs, modify settings in each, verify save |

**Sprint 2 Deliverable**: Users can switch between 3 themes. Theme persists to database. Settings modal has tabbed interface. All tests pass.

---

## Sprint 3: Navigation Architecture Overhaul

**Goal**: Implement the new sidebar, header, and Projects panel navigation pattern.

**Demo**: Navigate between Dashboard and Board views. Open Projects panel. Verify active states and smooth transitions.

**Prerequisites**: Sprint 2 complete

---

### Epic 3.1: Icon Sidebar

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 3.1.0 | Select icon set (lucide-react) | Update `package.json` if needed, document in task | N/A | None | Icons selected: LayoutDashboard (Dashboard), Columns (Board), FolderKanban (Projects), Settings (Settings). Document in code comments |
| 3.1.1 | Create IconSidebar component | Create `src/components/IconSidebar.tsx` | `src/components/IconSidebar.test.tsx` | 3.1.0 | 64px wide vertical sidebar with 4 nav items as icons with tooltips. Tests verify rendering |
| 3.1.2 | Add active state with gradient | Modify `src/components/IconSidebar.tsx` | Visual inspection | 3.1.1 | Active nav item has `background: linear-gradient(135deg, var(--accent-primary), var(--accent-ai))` with glow |
| 3.1.3 | Add divider and spacer elements | Modify `src/components/IconSidebar.tsx` | Visual inspection | 3.1.2 | Divider between main nav and settings. Settings icon at bottom |
| 3.1.4 | Integrate IconSidebar into AppLayout | Modify `src/components/AppLayout.tsx` | Manual verification | 3.1.3 | Replace current sidebar with IconSidebar. Grid layout: `64px sidebar + 1fr content` |
| 3.1.5 | Integration test: IconSidebar navigation | `src/components/IconSidebar.test.tsx` | Self | 3.1.4 | Tests verify: navigation works, active states correct, keyboard shortcuts (1-4) |

---

### Epic 3.2: Redesigned Header

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 3.2.1 | Create new Header component | Create `src/components/Header.tsx` | Manual verification | Sprint 1 | Header with logo area, search, view indicator, status pills, icon buttons |
| 3.2.2 | Create LogoIcon component | Create `src/components/ui/LogoIcon.tsx` | Visual inspection | Sprint 1 | Vector logo icon with gradient glow effect. Replaces "brain dump" text |
| 3.2.3 | Style search bar per mockup | Modify `src/components/Header.tsx` | Manual verification | 3.2.1 | Search bar with focus ring using accent color, placeholder styling. Preserves existing search functionality |
| 3.2.4 | Create StatusPill component | Create `src/components/ui/StatusPill.tsx` | `src/components/ui/StatusPill.test.tsx` | Sprint 1 | Reusable status pill with dot indicator, AI active state with pulse animation |
| 3.2.5 | Integrate Header into AppLayout | Modify `src/components/AppLayout.tsx` | Manual verification | 3.2.4 | Replace AppHeader with new Header component |
| 3.2.6 | Test search with new styling | Add to `src/components/Header.test.tsx` | Self | 3.2.5 | Tests verify search dropdown works, sanitization intact, results render correctly |

---

### Epic 3.3: Projects Slide-Out Panel

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 3.3.1 | Create ProjectsPanel component | Create `src/components/ProjectsPanel.tsx` | `src/components/ProjectsPanel.test.tsx` | Sprint 1 | Slide-out panel (320px) with project list, search, stats, AI indicator. Covers sidebar when open (left: 0, z-index: 100) |
| 3.3.2 | Add panel slide animation | Modify `src/components/ProjectsPanel.tsx` | Visual inspection | 3.3.1 | Panel slides in from left with 200ms CSS transition |
| 3.3.3 | Add click-outside to close | Modify `src/components/ProjectsPanel.tsx` | `src/components/ProjectsPanel.test.tsx` | 3.3.2 | Clicking outside panel closes it. Tests verify close behavior |
| 3.3.4 | Create ProjectListItem component | Create `src/components/ProjectListItem.tsx` | Visual inspection | Sprint 1 | Project item with icon, name, path, ticket stats (active/backlog/done), AI working indicator |
| 3.3.5 | Wire up panel state to IconSidebar | Modify `src/components/IconSidebar.tsx`, `src/components/AppLayout.tsx` | Manual verification | 3.3.1 | Projects icon click toggles panel. Panel overlay state managed in AppLayout |
| 3.3.6 | Integration test: ProjectsPanel | `src/components/ProjectsPanel.test.tsx` | Self | 3.3.5 | Tests verify: panel opens/closes, click-outside works, project selection works |

---

### Epic 3.4: Dashboard View

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 3.4.1 | Create Dashboard route | Create `src/routes/dashboard.tsx` | Manual verification | Sprint 1 | New route at `/dashboard` with basic structure |
| 3.4.2 | Create StatCard component | Create `src/components/dashboard/StatCard.tsx` | Visual inspection | Sprint 1 | Card with label, value, optional highlight (AI active) state |
| 3.4.3 | Create StatsGrid component | Create `src/components/dashboard/StatsGrid.tsx` | Manual verification | 3.4.2 | 4-column grid showing total tickets, in progress, AI active, done counts |
| 3.4.4 | Create CurrentFocus component | Create `src/components/dashboard/CurrentFocus.tsx` | Manual verification | Sprint 1 | Shows current ticket being worked on with AI status, click navigates to detail |
| 3.4.5 | Create UpNextQueue component | Create `src/components/dashboard/UpNextQueue.tsx` | Manual verification | Sprint 1 | Shows next 5 tickets in ready/backlog status |
| 3.4.6 | Wire up navigation to Dashboard | Modify `src/components/IconSidebar.tsx` | Manual verification | 3.4.1 | Dashboard icon navigates to `/dashboard` route |
| 3.4.7 | Update queryKeys for Dashboard data | Modify `src/lib/hooks.ts` | Existing hook tests | 3.4.5 | Add `queryKeys.dashboard`, ensure proper cache invalidation |
| 3.4.8 | Add error boundary to Dashboard | Modify `src/routes/dashboard.tsx` | Manual verification | 3.4.6 | Dashboard wrapped in error boundary with fallback UI |

---

### Epic 3.5: Sprint 3 Integration Testing

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 3.5.1 | Integration test: Navigation flow | Create `e2e/navigation.spec.ts` | Self | 3.4.8 | E2E test: Navigate Dashboard → Board → Projects panel → Settings. Verify all transitions |
| 3.5.2 | Integration test: Dashboard stats | Add to `e2e/navigation.spec.ts` | Self | 3.5.1 | E2E test: Verify dashboard stats match actual ticket counts |

**Sprint 3 Deliverable**: New navigation architecture complete. Icon sidebar, header, Projects panel, Dashboard view all functional. All tests pass.

---

## Sprint 4: Ticket Flows - Create and Edit

**Goal**: Implement the Create Ticket and Edit Ticket modals with new design.

**Demo**: Create a new ticket with tags and attachments. Edit an existing ticket, view activity, use launch actions.

**Prerequisites**: Sprint 3 complete

---

### Epic 4.1: Create Ticket Modal Redesign

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 4.1.1 | Redesign NewTicketModal layout | Modify `src/components/NewTicketModal.tsx` | Visual inspection | Sprint 1 | Modal matches mockup styling: header with gradient icon, 2-column form layout |
| 4.1.2 | Create FormField component | Create `src/components/ui/FormField.tsx` | `src/components/ui/FormField.test.tsx` | Sprint 1 | Reusable form field with label, input, hint text, error state. Tests verify error display |
| 4.1.3 | Create SelectField component | Create `src/components/ui/SelectField.tsx` | Visual inspection | Sprint 1 | Styled select with chevron icon, focus ring |
| 4.1.4 | Create TagInput component | Create `src/components/ui/TagInput.tsx` | `src/components/ui/TagInput.test.tsx` | Sprint 1 | Pill input with add/remove, autocomplete from existing tags. Tests verify add/remove/autocomplete |
| 4.1.5 | Create AttachmentDropZone component | Create `src/components/ui/AttachmentDropZone.tsx` | `src/components/ui/AttachmentDropZone.test.tsx` | Sprint 1 | Drag-and-drop zone matching mockup styling. Tests verify file handling |
| 4.1.6 | Integrate new UI components into NewTicketModal | Modify `src/components/NewTicketModal.tsx` | Manual verification | 4.1.5 | All form fields use new UI components |
| 4.1.7 | Integration test: Create ticket flow | `e2e/ticket-create.spec.ts` | Self | 4.1.6 | E2E test: Create ticket with all fields, verify in board |

---

### Epic 4.2: Edit Ticket Modal Redesign

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 4.2.1 | Redesign TicketModal header | Modify `src/components/TicketModal.tsx` | Visual inspection | Sprint 1 | Header matches mockup: gradient icon, close button styling |
| 4.2.2 | Reorganize form sections | Modify `src/components/TicketModal.tsx` | Manual verification | 4.1.6 | Use new FormField, SelectField components. Sections match mockup order |
| 4.2.3 | Add Launch Actions section | Modify `src/components/TicketModal.tsx` | Manual verification | Sprint 1 | "Start Work With" section in modal body per mockup |
| 4.2.4 | Redesign Activity/Comments section | Modify `src/components/TicketModal.tsx` | Visual inspection | Sprint 1 | Comment types with colored borders (Progress=teal, Work Summary=purple, Test Report=green), avatars, badges |
| 4.2.5 | Add "View Details" button | Modify `src/components/TicketModal.tsx` | Manual verification | None | Footer button to navigate to Ticket Detail view |
| 4.2.6 | Integration test: Edit ticket flow | `e2e/ticket-edit.spec.ts` | Self | 4.2.5 | E2E test: Edit ticket, verify changes saved, activity section renders |

---

### Epic 4.3: Split Button Launch Actions

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 4.3.1 | Create SplitButton component | Create `src/components/ui/SplitButton.tsx` | `src/components/ui/SplitButton.test.tsx` | Sprint 1 | Reusable split button with main action and dropdown toggle. Tests verify click handlers |
| 4.3.2 | Create LaunchMenu dropdown | Create `src/components/LaunchMenu.tsx` | Manual verification | 4.3.1 | Dropdown with Claude Code (recommended), Ralph (Native), Ralph (Docker), OpenCode options |
| 4.3.3 | Style LaunchOption items | Modify `src/components/LaunchMenu.tsx` | Visual inspection | 4.3.2 | Each option has icon, name, description, feature badges (Interactive, Autonomous, Sandboxed) |
| 4.3.4 | Replace footer buttons with SplitButton | Modify `src/components/TicketModal.tsx` | Manual verification | 4.3.3 | "Start with Claude" split button replaces existing launch buttons |
| 4.3.5 | Verify MCP start_ticket_work integration | Manual testing with MCP | N/A | 4.3.4 | All launch options correctly call MCP `start_ticket_work` tool |

**Sprint 4 Deliverable**: Create and Edit Ticket modals redesigned. Split button launch actions work. All tests pass.

---

## Sprint 5: Ticket Detail Drill-Down View

**Goal**: Implement the Ticket Detail as a drill-down view, not a top-level navigation item.

**Demo**: Click ticket card on board to open detail view. View full activity timeline, acceptance criteria, related tickets. Navigate back to board.

**Prerequisites**: Sprint 4 complete

---

### Epic 5.1: Ticket Detail Route

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 5.1.1 | Create ticket detail route | Create `src/routes/ticket.$ticketId.tsx` | Manual verification | None | Route at `/ticket/:ticketId` renders ticket detail |
| 5.1.2 | Create back navigation component | Create `src/components/ui/BackNavigation.tsx` | Visual inspection | Sprint 1 | "← Back to Board" styled link per mockup, uses router history |
| 5.1.3 | Create TicketDetailView component | Create `src/components/TicketDetailView.tsx` | Manual verification | Sprint 1 | Full-page view with ticket info, acceptance criteria, subtasks, activity timeline |
| 5.1.4 | Add Edit button to open modal | Modify `src/components/TicketDetailView.tsx` | Manual verification | 5.1.3 | "Edit" button opens TicketModal |
| 5.1.5 | Add error boundary to TicketDetailView | Modify `src/routes/ticket.$ticketId.tsx` | Manual verification | 5.1.3 | Route wrapped in error boundary with "Ticket not found" fallback |

---

### Epic 5.2: Ticket Detail Content

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 5.2.1 | Create AcceptanceCriteria component | Create `src/components/ticket-detail/AcceptanceCriteria.tsx` | Manual verification | Sprint 1 | Checklist with checkmarks, parsed from description markdown |
| 5.2.2 | Create SubtasksProgress component | Create `src/components/ticket-detail/SubtasksProgress.tsx` | `src/components/ticket-detail/SubtasksProgress.test.tsx` | Sprint 1 | Progress bar with percentage, subtask list. "No subtasks • Completed in one session" notice when empty. Tests verify both states |
| 5.2.3 | Create FullActivityTimeline component | Create `src/components/ticket-detail/FullActivityTimeline.tsx` | Manual verification | Sprint 1 | Scrollable activity feed with all comment types, no height limit |
| 5.2.4 | Create RelatedTickets panel | Create `src/components/ticket-detail/RelatedTickets.tsx` | Manual verification | Sprint 1 | Right panel showing other tickets in same epic |
| 5.2.5 | Wire up navigation from board/modal | Modify `src/routes/index.tsx`, `src/components/TicketModal.tsx` | Manual verification | 5.1.1 | Clicking ticket card navigates to detail. "View Details" in modal navigates to detail |
| 5.2.6 | Integration test: Ticket detail view | `e2e/ticket-detail.spec.ts` | Self | 5.2.5 | E2E test: Navigate to detail, verify all sections render, back navigation works |

---

### Epic 5.3: Code Snippet Display

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 5.3.1 | Create CodeBlock component | Create `src/components/ui/CodeBlock.tsx` | Visual inspection | Sprint 1 | Syntax-highlighted code display with copy button, supports common languages |
| 5.3.2 | Create FileChanges component | Create `src/components/ticket-detail/FileChanges.tsx` | Manual verification | 5.3.1 | Collapsible file changes block for work summary comments |
| 5.3.3 | Create TestResults component | Create `src/components/ticket-detail/TestResults.tsx` | Manual verification | Sprint 1 | Test report display with pass/fail counts, indicators |

**Sprint 5 Deliverable**: Ticket Detail drill-down view complete with full activity timeline, code snippets, related tickets. All tests pass.

---

## Sprint 6: Project and Epic Flows

**Goal**: Implement Create/Edit Project and Create Epic flows.

**Demo**: Create new project from Projects panel. Edit project settings. Create epic from ticket modal. Run Inception flow.

**Prerequisites**: Sprint 5 complete

---

### Epic 6.1: Create Project Modal

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 6.1.1 | Redesign ProjectModal for new styling | Modify `src/components/ProjectModal.tsx` | Visual inspection | Sprint 1 | Modal matches mockup styling |
| 6.1.2 | Add browse button for path selection | Modify `src/components/ProjectModal.tsx` | Manual verification | 6.1.1 | Path field has browse button that opens DirectoryPicker |
| 6.1.3 | Add color dropdown | Modify `src/components/ProjectModal.tsx` | Manual verification | 6.1.1 | Color selection dropdown with preset options |

---

### Epic 6.2: Edit Project Modal

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 6.2.1 | Add Preview checkbox | Modify `src/components/ProjectModal.tsx` | Manual verification | 6.1.1 | Preview toggle in edit mode |
| 6.2.2 | Add Working Method dropdown | Modify `src/components/ProjectModal.tsx` | Manual verification | 6.1.1 | Claude Code/OpenCode/VS Code/Cursor options |
| 6.2.3 | Style delete button as danger zone | Modify `src/components/ProjectModal.tsx` | Visual inspection | 6.1.1 | Red-styled delete button with confirmation |
| 6.2.4 | Wire up double-click to edit | Modify `src/components/ProjectsPanel.tsx` | Manual verification | 6.2.3 | Double-clicking project in panel opens edit modal |

---

### Epic 6.3: Create Epic Modal

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 6.3.1 | Redesign EpicModal for new styling | Modify `src/components/EpicModal.tsx` | Visual inspection | Sprint 1 | Modal matches mockup styling |
| 6.3.2 | Add color dropdown | Modify `src/components/EpicModal.tsx` | Manual verification | 6.3.1 | Color selection dropdown |
| 6.3.3 | Add "Create New" to epic dropdown | Modify `src/components/NewTicketModal.tsx`, `src/components/TicketModal.tsx` | Manual verification | 6.3.1 | Epic dropdown has "Create New" option that opens EpicModal |

---

### Epic 6.4: Inception Flow (Start from Scratch)

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 6.4.1 | Create InceptionModal component | Create `src/components/InceptionModal.tsx` | Manual verification | Sprint 1 | Hero section with rocket icon, AI explanation, launch options |
| 6.4.2 | Add "Skip AI" link | Modify `src/components/InceptionModal.tsx` | Manual verification | 6.4.1 | Link opens ProjectModal directly |
| 6.4.3 | Wire up New Ticket dropdown | Modify `src/components/AppLayout.tsx` | Manual verification | 6.4.1 | "Start from Scratch" option opens InceptionModal |
| 6.4.4 | Integration test: Inception flow | `e2e/inception.spec.ts` | Self | 6.4.3 | E2E test: Open inception, select options, verify project creation |
| 6.4.5 | Verify MCP launch_project_inception | Manual testing with MCP | N/A | 6.4.3 | Inception correctly triggers MCP tools for AI project creation |

**Sprint 6 Deliverable**: All project and epic flows complete. Inception flow works. All tests pass.

---

## Sprint 7: Component Library Polish

**Goal**: Complete the reusable component library with consistent styling.

**Demo**: Show component consistency across all modals and views. Demonstrate button variants, form states, card styles.

**Prerequisites**: Sprint 6 complete

---

### Epic 7.1: Button Components

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 7.1.1 | Create Button component with variants | Create `src/components/ui/Button.tsx` | `src/components/ui/Button.test.tsx` | Sprint 1 | Primary (gradient), secondary, danger, ghost variants. Tests verify all variants render |
| 7.1.2 | Create IconButton component | Create `src/components/ui/IconButton.tsx` | Visual inspection | Sprint 1 | Square icon-only button with hover state |
| 7.1.3 | Migrate existing buttons | Modify all component files | Manual verification | 7.1.2 | Replace inline button styles with Button/IconButton components |

---

### Epic 7.2: Form Components

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 7.2.1 | Create Input component | Create `src/components/ui/Input.tsx` | Visual inspection | Sprint 1 | Styled text input with focus ring using accent color |
| 7.2.2 | Create Textarea component | Create `src/components/ui/Textarea.tsx` | Visual inspection | Sprint 1 | Styled textarea with resize handle, focus ring |
| 7.2.3 | Create Toggle component | Create `src/components/ui/Toggle.tsx` | `src/components/ui/Toggle.test.tsx` | Sprint 1 | Switch toggle with gradient when on. Tests verify toggle state |
| 7.2.4 | Create Checkbox component | Create `src/components/ui/Checkbox.tsx` | Visual inspection | Sprint 1 | Styled checkbox with accent color checkmark |

---

### Epic 7.3: Card Components

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 7.3.1 | Create Card component | Create `src/components/ui/Card.tsx` | Visual inspection | Sprint 1 | Base card with bg-card, border, optional glow state |
| 7.3.2 | Create TicketCardNew component | Create `src/components/TicketCardNew.tsx` | `src/components/TicketCardNew.test.tsx` | 7.3.1 | Redesigned ticket card: priority left border, AI glow, git badges. Tests verify priority styling |
| 7.3.3 | Replace old TicketCard | Modify `src/routes/index.tsx` | Manual verification | 7.3.2 | Board uses TicketCardNew |

---

### Epic 7.4: Modal Components

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 7.4.1 | Create Modal wrapper component | Create `src/components/ui/Modal.tsx` | Visual inspection | Sprint 1 | Reusable modal with backdrop, header, content, footer slots |
| 7.4.2 | Create ModalHeader component | Create `src/components/ui/ModalHeader.tsx` | Visual inspection | 7.4.1 | Gradient icon, title, close button per mockup |
| 7.4.3a | Migrate TicketModal and NewTicketModal | Modify `src/components/TicketModal.tsx`, `src/components/NewTicketModal.tsx` | Manual verification | 7.4.2 | Use Modal wrapper component |
| 7.4.3b | Migrate ProjectModal, EpicModal, Delete modals | Modify `src/components/ProjectModal.tsx`, `src/components/EpicModal.tsx`, `src/components/DeleteConfirmationModal.tsx` | Manual verification | 7.4.2 | Use Modal wrapper component |
| 7.4.3c | Migrate SettingsModal and shortcuts | Modify `src/components/SettingsModal.tsx` | Manual verification | 7.4.2 | Use Modal wrapper component |
| 7.4.4 | Integration test: All modals | `e2e/modals.spec.ts` | Self | 7.4.3c | E2E test: Open each modal type, verify styling consistent |

---

### Epic 7.5: Component Documentation

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 7.5.1 | Create component usage guide | Create `docs/components.md` | N/A | 7.4.4 | Document all UI components with usage examples, props, variants |

**Sprint 7 Deliverable**: Component library complete. All UI elements consistently styled. Documentation available. All tests pass.

---

## Sprint 8: Responsive Design and Keyboard Navigation

**Goal**: Make the app responsive and fully keyboard accessible.

**Demo**: Resize browser to mobile size. Navigate entire app with keyboard only. Test with screen reader.

**Prerequisites**: Sprint 7 complete

---

### Epic 8.1: Responsive Layout

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 8.1.1a | Define responsive breakpoint constants | Modify `src/lib/constants.ts` | Verify in tests | None | Export `BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 }` |
| 8.1.1b | Apply breakpoints to Tailwind config | Modify `tailwind.config.ts` | Visual inspection | 8.1.1a | Breakpoints match constants |
| 8.1.2 | Make kanban board scrollable | Modify `src/routes/index.tsx` | Visual inspection | 8.1.1b | 7 columns scroll horizontally on < 1024px screens |
| 8.1.3 | Make modals responsive | Modify modal components | Visual inspection | 8.1.1b | Modals full-width on mobile, adjusted heights |
| 8.1.4 | Add mobile navigation | Create `src/components/MobileNav.tsx` | Visual inspection | Sprint 1 | Bottom navigation bar on < 768px screens |

---

### Epic 8.2: Keyboard Navigation

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 8.2.1 | Add shortcuts to IconSidebar | Modify `src/components/IconSidebar.tsx` | Manual verification | None | 1=Dashboard, 2=Board, 3=Projects, 4=Settings. ?=show shortcuts |
| 8.2.2 | Add arrow navigation in kanban | Modify `src/routes/index.tsx` | Manual verification | None | Arrow keys move between tickets, Enter opens ticket |
| 8.2.3 | Add Tab navigation in modals | Modify modal components | Manual verification | None | Tab cycles through form fields. Shift+Tab reverses. Escape closes |
| 8.2.4 | Add shortcuts to launch actions | Modify `src/components/LaunchMenu.tsx` | Manual verification | None | C=Claude, R=Ralph Native, D=Docker, O=OpenCode |
| 8.2.5 | Update shortcuts help modal | Modify `src/components/AppLayout.tsx` | Manual verification | 8.2.4 | Shortcuts modal shows all new shortcuts organized by context |
| 8.2.6 | Create shortcuts reference card | Update `docs/components.md` | N/A | 8.2.5 | Document all keyboard shortcuts in one section |

---

### Epic 8.3: Accessibility

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 8.3.1 | Add ARIA labels | Modify all interactive components | Manual verification | None | All buttons, inputs, dropdowns have appropriate aria-label or aria-labelledby |
| 8.3.2 | Add role attributes | Modify layout components | Manual verification | None | main, nav, aside, header, dialog have correct roles |
| 8.3.3 | Ensure focus visibility | Modify `src/lib/theme.css` | Visual inspection | None | Focus rings visible in all themes, meet WCAG 2.1 AA contrast (3:1) |
| 8.3.4 | Add skip-to-content link | Modify `src/routes/__root.tsx` | Manual verification | None | Hidden skip link visible on focus, jumps to main content |

**Sprint 8 Deliverable**: App fully responsive. Keyboard navigation works. Accessibility improved. All tests pass.

---

## Sprint 9: Performance Optimization and Final Polish

**Goal**: Optimize performance and add final animations.

**Demo**: Show Lighthouse score >90. Demonstrate smooth animations. Run full E2E suite.

**Prerequisites**: Sprint 8 complete

---

### Epic 9.1: Performance

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 9.1.1 | Memoize expensive components | Modify `TicketCard`, `ProjectListItem`, comment components | Profile before/after | None | Components wrapped with `React.memo`. Re-renders reduced by >50% |
| 9.1.2 | Optimize TanStack Query caching | Modify `src/lib/hooks.ts` | Profile before/after | None | Query invalidation is granular. staleTime and gcTime optimized |
| 9.1.3 | Add virtualization to long lists | Modify ticket list, activity timeline | Profile before/after | None | Lists >50 items use react-window. Initial render time <100ms |
| 9.1.4 | Lazy load routes | Modify route files | Bundle size analysis | None | Dashboard and ticket detail routes lazy loaded. Main bundle <200kb |

---

### Epic 9.2: Animations and Transitions

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 9.2.1 | Add panel slide transitions | Modify `src/components/ProjectsPanel.tsx` | Visual inspection | None | Panel slides in/out with 200ms ease transition |
| 9.2.2 | Add modal enter/exit animations | Modify `src/components/ui/Modal.tsx` | Visual inspection | None | Modals fade in/scale up (150ms). Backdrop fades in (200ms) |
| 9.2.3 | Add card hover animations | Modify `src/components/TicketCardNew.tsx` | Visual inspection | None | Cards lift slightly (translateY -2px) on hover with shadow increase |
| 9.2.4 | Add AI active pulse animation | Modify `src/lib/theme.css` | Visual inspection | None | `@keyframes pulse` animation on AI indicator elements |
| 9.2.5 | Test animation performance | Profile on low-end device | N/A | 9.2.4 | Animations run at 60fps, no jank |
| 9.2.6 | Add reduced-motion support | Modify `src/lib/theme.css` | Manual verification | 9.2.5 | `@media (prefers-reduced-motion)` disables animations |

---

### Epic 9.3: Final Integration Testing

| Task ID | Title | Files | Tests | Dependencies | Acceptance Criteria |
|---------|-------|-------|-------|--------------|---------------------|
| 9.3.1 | E2E test all 10 user flows | Add to `e2e/` | Self | All sprints | Each of 10 user flows has passing E2E test. See User Flows Coverage table |
| 9.3.2 | Visual regression testing | `e2e/visual.spec.ts` | Self | 9.3.1 | Screenshot tests for each theme, each major view |
| 9.3.3 | Cross-browser testing | Manual testing | N/A | 9.3.2 | Chrome, Firefox, Safari tested. No major issues |
| 9.3.4 | Performance audit | Lighthouse | N/A | 9.3.3 | Lighthouse score >90 for performance, >90 for accessibility |
| 9.3.5 | Final code review | All changed files | N/A | 9.3.4 | All code reviewed, no outstanding issues |

**Sprint 9 Deliverable**: App optimized, animated, and fully tested. Ready for production.

---

## User Flows Coverage Matrix

| # | Flow | Sprint | Epic | Key Files | E2E Test |
|---|------|--------|------|-----------|----------|
| 1 | Create Ticket | Sprint 4 | 4.1 | `NewTicketModal.tsx` | `ticket-create.spec.ts` |
| 2 | Edit Ticket | Sprint 4 | 4.2, 4.3 | `TicketModal.tsx`, `LaunchMenu.tsx` | `ticket-edit.spec.ts` |
| 3 | Ticket Detail (Drill-Down) | Sprint 5 | 5.1, 5.2 | `ticket.$ticketId.tsx`, `TicketDetailView.tsx` | `ticket-detail.spec.ts` |
| 4 | Create Epic | Sprint 6 | 6.3 | `EpicModal.tsx` | `inception.spec.ts` |
| 5 | Create Project | Sprint 6 | 6.1 | `ProjectModal.tsx` | `inception.spec.ts` |
| 6 | Edit Project | Sprint 6 | 6.2 | `ProjectModal.tsx` | `inception.spec.ts` |
| 7 | Start from Scratch (Inception) | Sprint 6 | 6.4 | `InceptionModal.tsx` | `inception.spec.ts` |
| 8 | Launch Actions | Sprint 4 | 4.3 | `SplitButton.tsx`, `LaunchMenu.tsx` | `ticket-edit.spec.ts` |
| 9 | Settings | Sprint 2 | 2.2, 2.3 | `SettingsModal.tsx`, `ThemeSwitcher.tsx` | `settings.spec.ts` |
| 10 | Projects Panel | Sprint 3 | 3.3 | `ProjectsPanel.tsx`, `ProjectListItem.tsx` | `navigation.spec.ts` |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total Sprints | 9 |
| Total Epics | 39 |
| Total Tasks | 147 |
| Estimated Hours | ~261 |
| E2E Test Files | 9 |
| New Components | 35+ |
| Files Modified | 50+ |

---

## Validation Checklist (Per Task)

Before marking any task complete:

- [ ] Code compiles (`pnpm type-check`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Unit/integration tests pass (`pnpm test`)
- [ ] Visual inspection matches mockup
- [ ] Works in all 3 themes (Ember, Mint, Solar)
- [ ] Keyboard accessible
- [ ] No console errors
- [ ] Committed with message: `feat(<sprint>.<epic>.<task>): <description>`

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Theme migration breaks existing styles | Medium | High | Sprint 1 has extensive testing before proceeding |
| AppLayout.tsx too complex to refactor | Medium | Medium | Split into smaller components in Sprint 3 |
| MCP integration issues | Low | High | Verify MCP tools in Sprints 4, 6 |
| Performance degradation | Medium | Medium | Profile in Sprint 9, memoize early |
| Accessibility compliance | Low | Medium | Sprint 8 dedicated to accessibility |

---

## Appendix: File Index

### New Files (35+)

```
src/lib/
  theme.css
  theme.ts
  ThemeContext.tsx

src/components/ui/
  TabNavigation.tsx
  SectionHeader.tsx
  FormField.tsx
  SelectField.tsx
  TagInput.tsx
  AttachmentDropZone.tsx
  SplitButton.tsx
  BackNavigation.tsx
  CodeBlock.tsx
  StatusPill.tsx
  LogoIcon.tsx
  Button.tsx
  IconButton.tsx
  Input.tsx
  Textarea.tsx
  Toggle.tsx
  Checkbox.tsx
  Card.tsx
  Modal.tsx
  ModalHeader.tsx

src/components/
  IconSidebar.tsx
  Header.tsx
  ProjectsPanel.tsx
  ProjectListItem.tsx
  LaunchMenu.tsx
  TicketCardNew.tsx
  TicketDetailView.tsx
  InceptionModal.tsx
  MobileNav.tsx

src/components/dashboard/
  StatCard.tsx
  StatsGrid.tsx
  CurrentFocus.tsx
  UpNextQueue.tsx

src/components/ticket-detail/
  AcceptanceCriteria.tsx
  SubtasksProgress.tsx
  FullActivityTimeline.tsx
  RelatedTickets.tsx
  FileChanges.tsx
  TestResults.tsx

src/components/settings/
  GeneralSettings.tsx
  RalphSettings.tsx
  GitSettings.tsx
  EnterpriseSettings.tsx

src/routes/
  dashboard.tsx
  ticket.$ticketId.tsx

e2e/
  theme.spec.ts
  settings.spec.ts
  navigation.spec.ts
  ticket-create.spec.ts
  ticket-edit.spec.ts
  ticket-detail.spec.ts
  inception.spec.ts
  modals.spec.ts
  visual.spec.ts

docs/
  components.md
```

### Modified Files (50+)

```
src/styles.css
src/routes/__root.tsx
src/routes/index.tsx
src/components/AppLayout.tsx
src/components/TicketModal.tsx
src/components/NewTicketModal.tsx
src/components/SettingsModal.tsx
src/components/ProjectModal.tsx
src/components/EpicModal.tsx
src/components/Toast.tsx
src/components/ProjectTree.tsx
src/components/DirectoryPicker.tsx
src/components/DeleteConfirmationModal.tsx
src/components/DeleteProjectModal.tsx
src/components/ContainerLogsModal.tsx
src/components/ThemeSwitcher.tsx
src/lib/hooks.ts
src/lib/constants.ts
src/api/settings.ts
tailwind.config.ts
package.json
```
