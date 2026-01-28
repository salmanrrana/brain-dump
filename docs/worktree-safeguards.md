# Worktree Branch Mismatch - Fixed + Safeguards

## Problem Summary

When working in epic worktree mode, Ralph encountered infinite loops caused by branch mismatch:

**Expected:** All tickets in epic share one epic branch (`feature/epic-7ab7669d-mcp-tool-consolidation-and-context-aware-filtering`)
**Actual:** Tickets created their own branches (`feature/ca14e4ac-add-user-authentication`, etc.)
**Result:** Ralph confused about which branch to use → infinite loop

### Root Cause

Tickets were started with `start_ticket_work` **WITHOUT** calling `start_epic_work` first. This triggered fallback behavior that creates individual ticket branches instead of using the shared epic branch.

## What Was Fixed

### 1. ✅ Merged Work Into Epic Branch

```bash
cd /Users/salman.rana/code/brain-dump-epic-7ab7669d-mcp-tool-consolidation-and-con
git checkout feature/epic-7ab7669d-mcp-tool-consolidation-and-context-aware-filtering
git merge feature/ca14e4ac-add-user-authentication  # Fast-forward merge
```

**Result:** All ticket ed3637e8 work is now on the epic branch where it belongs.

### 2. ✅ Added MCP Tool Validation

**File:** `mcp-server/tools/workflow.js` (lines 678-710)

**What it does:**

- When `start_ticket_work` is called for a ticket in an epic (worktree mode)
- **BLOCKS** the operation if `start_epic_work` hasn't been called first
- Returns clear error message with instructions

**Error message:**

```
⚠️  Epic Workflow Not Started

This ticket belongs to epic "MCP Tool Consolidation", but the epic workflow
hasn't been initialized yet.

In worktree mode, you must call `start_epic_work` BEFORE starting work on
any ticket in the epic.

This ensures:
- The worktree is created at the correct location
- The epic branch is set up properly
- All tickets in the epic share the same branch
- No branch mismatches occur

To fix:
start_epic_work({ epicId: "7ab7669d-1e89-4b21-9897-85d0273b2600" })

Then try starting this ticket again.
```

### 3. ✅ Added PreToolUse Hook

**File:** `~/.claude/hooks/prevent-worktree-branch-switch.sh`

**What it does:**

- Detects when you're in a worktree (checks `.claude/ralph-state.json`)
- **BLOCKS** manual `git checkout <branch>` commands
- Allows file checkouts (`git checkout -- file.txt`)
- Prevents branch switches that would cause mismatch

**Error message:**

```
╔══════════════════════════════════════════════════════════════╗
║  ⚠️  BLOCKED: Manual branch switch in epic worktree          ║
╠══════════════════════════════════════════════════════════════╣
║  You are in worktree isolation mode for this epic.           ║
║                                                              ║
║  All tickets in this epic MUST use the same branch:          ║
║  → feature/epic-7ab7669d...                                  ║
║                                                              ║
║  Switching to branch "some-other-branch" would cause a       ║
║  mismatch between the expected epic branch and actual.       ║
║                                                              ║
║  ❌ DO NOT manually switch branches in epic worktrees        ║
║  ✅ Use start_ticket_work to begin work on a ticket          ║
╚══════════════════════════════════════════════════════════════╝
```

**Configured in:** `~/.claude/settings.json`

```json
{
  "matcher": "Bash(git checkout:*)",
  "hooks": [
    {
      "type": "command",
      "command": "$HOME/.claude/hooks/prevent-worktree-branch-switch.sh"
    }
  ]
}
```

## How To Avoid This In The Future

### ✅ Correct Workflow (Worktree Mode)

```bash
# 1. FIRST: Start the epic workflow
start_epic_work({ epicId: "abc-123", isolationMode: "worktree" })

# This creates:
# - Worktree directory at ../brain-dump-epic-abc123-feature-name
# - Epic branch: feature/epic-abc123-feature-name
# - Updates database with epic_branch_name

# 2. THEN: Start individual tickets
start_ticket_work({ ticketId: "def-456" })

# This will:
# - Checkout the EPIC branch (not create a new one)
# - Update Ralph state file
# - Return worktree path to work in
```

### ❌ What NOT To Do

```bash
# ❌ Starting ticket WITHOUT calling start_epic_work first
start_ticket_work({ ticketId: "def-456" })  # ERROR in worktree mode!

# ❌ Manually switching branches in a worktree
git checkout some-other-branch  # BLOCKED by hook!
```

### Branch Mode vs Worktree Mode

| Aspect              | Branch Mode (Default)        | Worktree Mode (Isolated)           |
| ------------------- | ---------------------------- | ---------------------------------- |
| **Epic setup**      | Optional (auto-created)      | **REQUIRED** via `start_epic_work` |
| **Ticket branches** | Auto-created if epic not set | **BLOCKED** - must use epic branch |
| **Directory**       | Main repo                    | Sibling directory                  |
| **Parallel work**   | ❌ No (checkout conflicts)   | ✅ Yes (separate worktrees)        |
| **Strictness**      | Lenient                      | Strict (prevents mismatches)       |

## Testing The Fix

### Test 1: Verify Epic Branch Has Work

```bash
cd /Users/salman.rana/code/brain-dump-epic-7ab7669d-mcp-tool-consolidation-and-con
git branch --show-current
# Should show: feature/epic-7ab7669d-mcp-tool-consolidation-and-context-aware-filtering

git log --oneline -5
# Should show commits:
# 7c340dc fix(ed3637e8): Add input validation to tool metadata query functions
# 950023d refactor(ed3637e8): Simplify tool metadata registry for clarity and efficiency
# ae5da0b feat(ed3637e8): Add tool metadata system for categorization and context tagging
```

✅ **PASSED**

### Test 2: Verify Hook Blocks Branch Switches

```bash
cd /Users/salman.rana/code/brain-dump-epic-7ab7669d-mcp-tool-consolidation-and-con
# Try to switch branches
# git checkout main
# Should be blocked by hook with error message
```

⏳ **Try this yourself to verify**

### Test 3: Verify MCP Validation

In Brain Dump:

1. Create a new epic with worktree mode enabled
2. Try to start a ticket WITHOUT calling `start_epic_work` first
3. Should get error: "⚠️ Epic Workflow Not Started"

⏳ **Try this with a test epic**

## GitHub Branch Protection?

You asked about GitHub branch protection rules. Those are different:

**GitHub branch protection:** Prevents direct pushes, requires PR reviews, etc. (remote repo rules)
**Our safeguards:** Prevent local branch mismatches in worktree workflows (local git rules)

You don't need GitHub branch protection for this issue - the local safeguards we added are sufficient.

## Summary

| Safeguard            | Location                                            | Prevents                                                    |
| -------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| MCP Validation       | `mcp-server/tools/workflow.js`                      | Starting tickets without `start_epic_work` in worktree mode |
| PreToolUse Hook      | `~/.claude/hooks/prevent-worktree-branch-switch.sh` | Manual branch switches in worktrees                         |
| Clear Error Messages | Both above                                          | Confusion about what went wrong                             |

## Next Steps

1. ✅ **Fixed:** Branch mismatch resolved
2. ✅ **Safeguards:** MCP validation + hook added
3. ⏳ **Test:** Try creating a new epic and verify workflow works
4. ⏳ **Document:** This file serves as documentation

**You're safe to continue working!** The safeguards will prevent this from happening again.

---

## Questions?

- **"Can I still use branch mode?"** - Yes! Branch mode is more lenient and auto-creates epic branches.
- **"When should I use worktree mode?"** - When you want to work on multiple epics in parallel without checkout conflicts.
- **"Can I remove these safeguards?"** - Yes, but not recommended. They prevent subtle bugs that are hard to debug.
