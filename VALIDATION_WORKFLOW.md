# MCP SDK Compliance Validation Workflow

## Git Branch Strategy

```
main (production)
  ↑
  └── PR #91: feature/epic-8bacfe2b-mcp-tool-consolidation-and-con
      (MCP Server Fixes & Database Migrations)
        ↑
        └── feature/validate-pr91-integration (VALIDATION BRANCH)
            ↑
            ├── Phase 1: Foundation (6 tickets)
            │   ├── Add output schemas to projects/epics
            │   ├── Add output schemas to tickets/comments
            │   ├── Add output schemas to workflow/session
            │   ├── Add title field to all tools
            │   ├── Implement annotations for all tools
            │   └── Add structuredContent to all handlers
            │
            ├── Phase 2: Migration (4 tickets)
            │   ├── Migrate server.tool() → server.registerTool()
            │   ├── Add metadata to tool registrations
            │   ├── Update tool descriptions
            │   └── Test with Claude Code integration
            │
            └── Phase 3: Advanced Features (3 tickets - OPTIONAL)
                ├── Implement Resources
                ├── Implement Prompts
                └── Implement Sampling
```

## Workflow Overview

### Step 1: Branch Off PR #91

All work starts from `feature/epic-8bacfe2b-mcp-tool-consolidation-and-con` (PR #91)

```bash
# Start with PR #91
git checkout feature/epic-8bacfe2b-mcp-tool-consolidation-and-con

# Create validation branch
git checkout -b feature/validate-pr91-integration
```

### Step 2: Work on Each Ticket

For each ticket (Phase 1, 2, or 3):

```bash
# Always work in validation branch
git checkout feature/validate-pr91-integration

# Create feature branch for your ticket
git checkout -b feature/implement-ticket-name

# Do your work...
# Commit changes
git commit -m "feat(mcp): [description]"

# Push and create PR into validation branch
git push -u origin feature/implement-ticket-name

# Create PR: feature/implement-ticket-name → feature/validate-pr91-integration
gh pr create --base feature/validate-pr91-integration
```

### Step 3: Validation & Testing

After completing ALL tickets in a phase:

```bash
git checkout feature/validate-pr91-integration

# Run full validation suite
pnpm type-check    # TypeScript compilation
pnpm lint          # Code style
pnpm test          # All 2300+ tests
pnpm build         # Full build
pnpm dev           # Start dev server

# Test MCP server
# Start Claude Code and verify tools load correctly
```

### Step 4: Merge Back to PR #91

Once validation branch is stable and tested:

```bash
git checkout feature/epic-8bacfe2b-mcp-tool-consolidation-and-con

# Merge validation branch
git merge feature/validate-pr91-integration

# OR create PR: feature/validate-pr91-integration → PR #91
gh pr create --base feature/epic-8bacfe2b-mcp-tool-consolidation-and-con \
  --title "test: Validate all MCP compliance changes" \
  --body "Validation complete for Phase 1, 2, and 3 tickets"
```

### Step 5: Merge PR #91 to Main

Once validation PR is merged and approved:

```bash
git checkout main
git pull origin main

# Merge PR #91
git merge feature/epic-8bacfe2b-mcp-tool-consolidation-and-con
```

---

## 📋 Phase Breakdown

### Phase 1: Foundation (CRITICAL - 6 tickets)

**Effort**: ~2-3 hours per category
**Priority**: HIGH
**Status**: Ready to start

| Ticket ID | Title                                  | Dependencies                    |
| --------- | -------------------------------------- | ------------------------------- |
| e3ef1645  | Add output schemas to projects/epics   | None                            |
| 1bc591dd  | Add output schemas to tickets/comments | None                            |
| 028cb1d1  | Add output schemas to workflow/session | None                            |
| 22a1bfa6  | Add title field to all tools           | None - can start with Phase 1.1 |
| 03d5121f  | Implement annotations for all tools    | None - can start with Phase 1.1 |
| 47a78146  | Add structuredContent to all handlers  | Requires Phase 1.1-1.3 complete |

**Work in Phase 1.1-1.3 can happen in parallel**

---

### Phase 2: Migration (MEDIUM - 4 tickets)

**Effort**: ~4-6 hours total
**Priority**: HIGH
**Dependencies**: Phase 1 must be complete first

| Ticket ID | Title                                         | Dependencies         |
| --------- | --------------------------------------------- | -------------------- |
| 6073d639  | Migrate server.tool() → server.registerTool() | Phase 1 complete     |
| 9eb39f97  | Add metadata to tool registrations            | 6073d639 complete    |
| 56348ae4  | Update tool descriptions                      | 9eb39f97 complete    |
| 5678f2ed  | Test with Claude Code integration             | All Phase 2 complete |

**Linear workflow - each ticket depends on previous**

---

### Phase 3: Advanced Features (OPTIONAL - 3 tickets)

**Effort**: 2-3 days per feature
**Priority**: LOW
**Dependencies**: Phase 1 and 2 should be complete

| Ticket ID | Title               | Dependencies     |
| --------- | ------------------- | ---------------- |
| 00b49512  | Implement Resources | Phase 2 complete |
| d640464b  | Implement Prompts   | Phase 2 complete |
| e57970f5  | Implement Sampling  | Phase 2 complete |

**Can be worked on in parallel, or deferred for later**

---

## ✅ Validation Checklist

### Before Merging validation → PR #91

- [ ] All Phase 1 tickets merged into validation branch
- [ ] All Phase 2 tickets merged into validation branch (optional: Phase 3)
- [ ] `pnpm type-check` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (2300+ tests)
- [ ] `pnpm build` succeeds
- [ ] Dev server starts: `pnpm dev`
- [ ] MCP tools load correctly
- [ ] Ticket creation/update workflows tested end-to-end
- [ ] No regressions in existing functionality

### Before Merging PR #91 → main

- [ ] Validation PR merged and approved
- [ ] All CI checks pass on PR #91
- [ ] Code review approved
- [ ] Database migrations tested on fresh install

---

## 🚀 Quick Reference

**Current Branches**:

- `feature/epic-8bacfe2b-mcp-tool-consolidation-and-con` → PR #91 (fixes + migrations)
- `feature/validate-pr91-integration` → Validation branch (all Phase 1-3 work)

**Ticket IDs**:

- **Phase 1** (6): e3ef1645, 1bc591dd, 028cb1d1, 22a1bfa6, 03d5121f, 47a78146
- **Phase 2** (4): 6073d639, 9eb39f97, 56348ae4, 5678f2ed
- **Phase 3** (3): 00b49512, d640464b, e57970f5

**Epic ID**: 734c5369-31fd-45e1-95d8-993ae8a7e950

---

## 📌 Key Rules

1. **Every ticket knows its branch**: BRANCH ASSIGNMENT at top of every ticket description
2. **All work flows through validation branch**: feature/validate-pr91-integration
3. **Validation before merge**: Full test suite before any merge
4. **Parallel work allowed**: Phase 1 tickets can be worked in parallel
5. **Linear dependencies**: Phase 1 → Phase 2 → Phase 3

---

## 🎯 Success Criteria

✅ All 13 tickets completed and merged to validation branch
✅ All tests pass (2300+)
✅ All validation checks complete
✅ Code review approved
✅ Merge validation → PR #91
✅ Merge PR #91 → main
✅ Zero regressions in production
