# Creative Direction Review - Beyond Kanban

**Feature:** Brain Dump Radical UI Exploration
**Date:** January 2026
**Status:** ✅ Design Complete - Ready for Implementation

---

## The Challenge

> "Stretch your imagination. Think beyond kanban. What if a task manager felt like a video game? Or was as intuitive as an Apple product? What would Jony Ive do?"

---

## Final Design Direction: "Neon Productivity"

After extensive exploration and iteration, we've landed on a design system called **"Neon Productivity"** that combines:
- The focus and calm of Jony Ive's minimalism
- Progressive disclosure from Dieter Rams
- Visual energy and distinctiveness for brand identity
- Three customizable color themes for user preference

### Why "Neon Productivity"?

1. **Distinctive** - Not another generic dark mode dev tool
2. **Energizing** - Gradient accents and glows create visual interest without distraction
3. **Flexible** - Three theme options let users choose their vibe
4. **Professional** - Dark base with restrained accent usage keeps it serious

---

## Color Themes (User Selectable)

### Theme 1: "Ember" (Default)
```css
--accent-primary: #f97316;    /* Orange - warm, energizing */
--accent-ai: #14b8a6;         /* Teal - AI activity indicator */
--accent-glow: rgba(249, 115, 22, 0.4);
```
**Personality:** Warm, inviting, high-energy
**Best for:** Users who want motivation and energy

### Theme 2: "Mint"
```css
--accent-primary: #10b981;    /* Emerald - fresh, calm */
--accent-ai: #f43f5e;         /* Rose - contrasting AI indicator */
--accent-glow: rgba(16, 185, 129, 0.4);
```
**Personality:** Fresh, balanced, natural
**Best for:** Users who prefer calming colors

### Theme 3: "Solar"
```css
--accent-primary: #eab308;    /* Gold - premium, focused */
--accent-ai: #3b82f6;         /* Blue - professional AI indicator */
--accent-glow: rgba(234, 179, 8, 0.4);
```
**Personality:** Premium, focused, professional
**Best for:** Users who want a sophisticated look

### Shared Base Colors (All Themes)
```css
--bg-primary: #0a0a0a;
--bg-secondary: #111111;
--bg-tertiary: #1a1a1a;
--bg-card: #1f1f1f;
--border-color: #2a2a2a;
--text-primary: #fafafa;
--text-secondary: #a1a1aa;
--text-muted: #71717a;
--success: #4ade80;
--warning: #facc15;
--error: #f87171;
```

---

## Navigation Architecture

### Primary Navigation (Sidebar)
| Icon | View | Purpose |
|------|------|---------|
| 📊 | Dashboard | Overview stats, current focus, up next queue |
| 📋 | Board | Kanban columns with all tickets |
| 📁 | Projects | Slide-out panel with project list |
| ⚙️ | Settings | Modal with tabbed settings |

### Removed from Sidebar
| Icon | View | Reason |
|------|------|--------|
| ~~📄~~ | ~~Detail~~ | Now a drill-down view, not top-level navigation |

### Drill-Down Views (Accessed via Click)
| Entry Point | Destination | How to Access |
|-------------|-------------|---------------|
| Ticket card click | Ticket Detail | Click any ticket on Board |
| "View Details" button | Ticket Detail | From Edit Ticket modal footer |
| "Current Focus" card | Ticket Detail | Click on Dashboard's current work section |

---

## User Flows - Complete Inventory

### 1. Create Ticket Flow
```
Board View → "New Ticket ▾" dropdown → "New Ticket" option → Create Ticket Modal
```
**Modal Fields:**
- Title (required)
- Description
- Project (required, dropdown)
- Priority (None/Low/Medium/High)
- Epic (dependent on project selection)
- Tags (pill input with add/remove)
- Attachments (drag-and-drop zone)

### 2. Edit Ticket Flow
```
Board View → Click ticket card → Edit Ticket Modal
```
**Modal Contains:**
- All Create Ticket fields, pre-populated
- Status dropdown (Backlog/In Progress/Review/Done)
- Blocked checkbox
- Subtasks list (add/remove/check)
- **Launch Actions section** (Start Work With)
- **Activity section** with comments
- Delete button (danger zone)

### 3. Ticket Detail Flow (Drill-Down)
```
Board View → Click ticket → Ticket Detail View
    OR
Edit Modal → "View Details" button → Ticket Detail View
```
**Detail View Contains:**
- "← Back to Board" navigation
- "✏️ Edit" button (opens Edit Modal)
- Full ticket info with code snippets
- Acceptance criteria with checkmarks
- Subtasks progress (or "No subtasks" notice)
- Full Activity timeline (no height limit)
- Related tickets in same epic (right panel)

### 4. Create Epic Flow
```
(Via Edit Ticket Modal → Epic dropdown → "Create New") → Create Epic Modal
```
**Modal Fields:**
- Title (required)
- Description
- Color (dropdown)

### 5. Create Project Flow
```
Projects Panel (📁) → "Add Project" button → Create Project Modal
    OR
"New Ticket ▾" → "Start from Scratch" → Skip AI button → Create Project Modal
```
**Modal Fields:**
- Name (required)
- Path (required, with browse button)
- Color (dropdown)

### 6. Edit Project Flow
```
Projects Panel (📁) → Double-click project → Edit Project Modal
```
**Modal Contains:**
- All Create Project fields, pre-populated
- Preview checkbox
- Working Method dropdown (Claude Code/OpenCode/VS Code/Cursor)
- Delete Project button (danger zone)

### 7. Start from Scratch (Inception) Flow
```
Board View → "New Ticket ▾" dropdown → "Start from Scratch" → Inception Modal
```
**Inception Modal:**
- Hero section with 🚀 icon
- "Create a new project with AI" explanation
- Launch options:
  - Start with Claude Code (recommended)
  - Start with OpenCode
- "Skip AI - Create Project Manually" link

### 8. Launch Actions Flow
```
Edit Ticket Modal → "Start Work With" section → Select launch option
    OR
Edit Ticket Modal → Footer "Start with Claude" button
```
**Launch Options (Split Button + Dropdown - Option A):**
| Option | Icon | Description |
|--------|------|-------------|
| Claude Code | 💻 | Interactive session - you guide (Recommended) |
| Ralph (Native) | 🤖 | Autonomous mode, runs locally |
| Ralph (Docker) | 🐳 | Sandboxed environment for safety |
| OpenCode | 🔷 | Open-source AI assistant alternative |

### 9. Settings Flow
```
Sidebar Settings icon (⚙️) → Settings Modal
```
**Tab Structure:**
| Tab | Icon | Contains |
|-----|------|----------|
| General | 📁 | Default projects directory, terminal emulator |
| Ralph | 🤖 | Docker sandbox toggle, Docker status, runtime, timeout |
| Git & PRs | 🔀 | Auto-create PR, target branch, branch naming |
| Enterprise | 🏢 | Conversation logging, retention, theme selection |

### 10. Projects Panel Flow
```
Sidebar Projects icon (📁) → Projects Panel slides out
```
**Panel Features:**
- Search input
- Project list with:
  - Project icon and name
  - File path
  - Ticket stats (active/backlog/done)
  - AI working indicator (if active)
- "Add Project" button
- Click outside to close

---

## Component Specifications

### Activity/Comments Section
**Comment Types:**
| Type | Border Color | Badge | Use Case |
|------|--------------|-------|----------|
| Progress | Teal/AI glow | "Working..." (animated) | Live AI activity |
| Work Summary | Purple (#a855f7) | "Work Summary" | Completed work report |
| Test Report | Green (success) | "Test Report" | Test results |
| User Comment | Border color | None | Human feedback |

**Comment Anatomy:**
- Avatar (36px, gradient background)
- Author name (colored by type)
- Timestamp
- Badge (if applicable)
- Body text with `<code>` support
- File changes block (for Work Summary)
- Test results block (for Test Report)

### Ticket Cards (Kanban)
**Visual Hierarchy:**
1. Left border color = Priority (red/orange/gray)
2. AI active glow = Currently being worked on
3. Title (bold, 14px)
4. Tags (muted, small)
5. Git info (branch badge, PR badge)

### Progress Indicators
**With Subtasks:**
- Progress bar with gradient fill
- Percentage label
- Subtask list with checkboxes

**Without Subtasks:**
- "No subtasks • Completed in one session" notice
- Dashed border, muted text, centered

---

## Design Decisions Log

### Decision 1: Drill-Down vs Top-Level Navigation
**Choice:** Ticket Detail is drill-down only (removed from sidebar)
**Rationale:** Detail view requires context (which ticket?). Views without context belong in sidebar; views with context are drill-downs.

### Decision 2: Split Button for Launch Actions (Option A)
**Choice:** Split button with dropdown menu
**Alternatives Considered:** Full launch panel (Option B)
**Rationale:** Split button is familiar pattern, less modal fatigue, faster for common action

### Decision 3: Three Color Themes
**Choice:** User-selectable themes (Ember/Mint/Solar)
**Rationale:** Different users have different preferences; themes are low-cost to implement with CSS variables

### Decision 4: Real Data in Comments
**Choice:** Show rich, formatted comments with code blocks, file changes, test results
**Rationale:** Comments are valuable context; making them scannable increases utility

### Decision 5: Projects as Slide-Out Panel
**Choice:** Panel slides over sidebar when opened
**Alternatives Considered:** Full-page projects view, dropdown
**Rationale:** Quick access without losing current context; dismissible

---

## Creative Panel Inspiration Applied

### From Jony Ive ("The Breath")
✅ **Applied:** Single ticket focus in Detail view
✅ **Applied:** Gentle animations, nothing jarring
✅ **Applied:** Progress shown as progress bar, not overwhelming
✅ **Applied:** Everything else accessible but hidden by default (drill-down pattern)

### From Dieter Rams ("10 Principles")
✅ **Applied:** Removed non-essential elements from default view
✅ **Applied:** One project at a time in sidebar (collapsible)
✅ **Applied:** Clear answer to "What should I do now?" in Dashboard

### From Susan Kare ("Visual Language")
✅ **Applied:** Consistent iconography (emoji-based for now)
✅ **Applied:** Status colors that are universally understood
🔜 **Future:** Custom logomark exploration

### From Bret Victor ("The Flow")
✅ **Applied:** AI activity shown as visual energy (glows, pulses)
✅ **Applied:** Progress bars show velocity of completion
🔜 **Future:** Consider particle effects for high activity

---

## Implementation Priority

### Phase 1: Core Navigation
- [ ] Sidebar with Dashboard/Board/Projects/Settings
- [ ] Theme switcher (Ember/Mint/Solar)
- [ ] Projects slide-out panel

### Phase 2: Ticket Flows
- [ ] Create Ticket modal
- [ ] Edit Ticket modal with Activity section
- [ ] Ticket Detail drill-down view
- [ ] Launch Actions (Split Button + Dropdown)

### Phase 3: Project & Settings
- [ ] Create/Edit Project modals
- [ ] Settings modal with tabs
- [ ] Inception flow (Start from Scratch)

### Phase 4: Polish
- [ ] Keyboard navigation
- [ ] Animations and transitions
- [ ] Performance optimization

---

## Mockup Files

| File | Description |
|------|-------------|
| `combined-navigation-demo.html` | Full app mockup with all views and modals |
| `settings-neon-productivity.html` | Settings modal detail |
| `ticket-launch-actions.html` | Launch options comparison (Option A selected) |

---

## Next Steps

1. ✅ Mockups complete
2. ⬜ Engineering review of implementation approach
3. ⬜ Create atomic tickets for each component
4. ⬜ Begin Phase 1 implementation
