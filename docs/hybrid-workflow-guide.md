# Hybrid Workflow Guide: Branch Mode + Worktree Mode

## Overview

Brain Dump supports working in BOTH the main repo and worktree directories simultaneously. This guide shows how to keep them in sync.

## The Setup

```
/Users/salman.rana/code/brain-dump/
  ├── .git/                    # Shared git database
  ├── main branch              # Production code
  ├── feature branches         # Your quick fixes/features
  └── ...

/Users/salman.rana/code/brain-dump-epic-abc123-big-feature/
  ├── .git -> ../brain-dump/.git    # Points to shared .git
  ├── feature/epic-abc123...        # Epic branch
  └── ...
```

**Key insight:** Both directories share the SAME `.git` repository!

## Workflow Example

### Scenario: Quick fix in main repo while epic in worktree

#### Step 1: Work on quick fix in main repo

```bash
cd /Users/salman.rana/code/brain-dump

# Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/quick-fix-login

# Make changes
# ... edit files ...

# Commit and push
git add .
git commit -m "fix: Quick login bug fix"
git push -u origin feature/quick-fix-login

# Create PR on GitHub
gh pr create --title "Fix login bug" --body "Quick fix for login issue"

# PR gets reviewed and merged to main
```

#### Step 2: Pull those changes into your worktree

```bash
cd /Users/salman.rana/code/brain-dump-epic-abc123-big-feature

# Currently on: feature/epic-abc123-big-feature
git branch --show-current
# => feature/epic-abc123-big-feature

# Fetch latest changes (updates main in shared .git)
git fetch origin

# Merge main into your epic branch
git merge origin/main

# Or rebase if you prefer
git rebase origin/main

# Continue working with latest changes!
```

**That's it!** The worktree now has your quick fix from the main repo.

## Common Operations

### Check what branch you're on in each location

```bash
# Main repo
cd /Users/salman.rana/code/brain-dump
git branch --show-current
# => main (or whatever feature branch)

# Worktree
cd /Users/salman.rana/code/brain-dump-epic-abc123-...
git branch --show-current
# => feature/epic-abc123-big-feature
```

### See all worktrees and their branches

```bash
git worktree list
# /Users/salman.rana/code/brain-dump                    d1fdc99 [main]
# /Users/.../brain-dump-epic-abc123-big-feature         a1b2c3d [feature/epic-abc123-big-feature]
```

### Update main in ALL locations at once

```bash
# From ANY worktree or main repo:
git fetch origin
git checkout main
git pull origin main

# Now main is updated everywhere!
```

### Sync worktree with latest main

```bash
cd /path/to/worktree

# Option 1: Merge (creates merge commit)
git fetch origin
git merge origin/main

# Option 2: Rebase (cleaner history)
git fetch origin
git rebase origin/main

# Option 3: Pull main directly (if on epic branch)
git pull origin main
```

## Best Practices

### ✅ DO

- **Keep main in sync**: Regularly `git pull origin main` in both locations
- **Quick fixes in main repo**: Small PRs, hotfixes, docs → use main repo
- **Large epics in worktrees**: Multi-ticket features → use worktrees
- **Fetch often**: `git fetch origin` updates all worktrees
- **Merge main into epic branches**: Keep epic branches up-to-date

### ❌ DON'T

- **Don't set main repo to bare**: Keep `core.bare = false`
- **Don't manually move worktree directories**: Use `git worktree remove` instead
- **Don't checkout same branch in multiple worktrees**: Git will block this
- **Don't forget to sync**: Epic branches can drift from main

## Advanced: Working on Multiple Things

```bash
# Main repo: on main, doing quick reviews
cd /Users/salman.rana/code/brain-dump
git checkout main
gh pr review 123

# Worktree 1: Epic A (large feature)
cd /Users/salman.rana/code/brain-dump-epic-aaa-auth
git checkout feature/epic-aaa-authentication
# ... Ralph working here ...

# Worktree 2: Epic B (another large feature)
cd /Users/salman.rana/code/brain-dump-epic-bbb-api
git checkout feature/epic-bbb-new-api
# ... You working here ...

# All three see the same git state!
git fetch origin  # Run from ANY location, updates ALL
```

## Troubleshooting

### "Main repo is bare" error

```bash
# Fix it:
cd /Users/salman.rana/code/brain-dump
git config --unset core.bare
git status  # Should work now
```

### "Can't checkout branch, it's already checked out"

```bash
# You're trying to checkout a branch that's active in another worktree
git worktree list  # See which branch is where

# Checkout a different branch, or work in the worktree that has it
```

### "Worktree path already exists"

```bash
# Remove the old worktree first
git worktree remove /path/to/worktree

# Or if directory is gone but git still tracks it:
git worktree prune
```

### "Changes not showing up in worktree"

```bash
# Make sure you fetched:
git fetch origin

# Make sure you merged/rebased:
git merge origin/main
# or
git rebase origin/main
```

## Real-World Example

**Monday:** Quick bug fix in main repo

```bash
cd ~/code/brain-dump
git checkout -b fix/login-redirect
# ... fix bug ...
git push -u origin fix/login-redirect
# PR created, reviewed, merged to main
```

**Tuesday:** Start large epic in worktree

```bash
cd ~/code/brain-dump
start_epic_work({ epicId: "abc-123", isolationMode: "worktree" })
# Worktree created at ~/code/brain-dump-epic-abc123-payments
cd ~/code/brain-dump-epic-abc123-payments
# Work on epic...
```

**Wednesday:** Pull Monday's fix into epic

```bash
cd ~/code/brain-dump-epic-abc123-payments
git fetch origin
git merge origin/main  # Gets Monday's login fix!
# Continue epic work with latest fixes
```

**Thursday:** Another quick fix in main repo

```bash
cd ~/code/brain-dump
git checkout main
git pull origin main
git checkout -b fix/typo-in-docs
# ... fix typo ...
# PR merged
```

**Thursday (later):** Pull that into epic too

```bash
cd ~/code/brain-dump-epic-abc123-payments
git pull origin main  # Gets Thursday's typo fix!
```

## Summary

**You can absolutely:**

- ✅ Work in main repo and push PRs
- ✅ Create worktree directories for epics
- ✅ Pull changes from main into worktrees anytime
- ✅ Have multiple worktrees all syncing with main
- ✅ Switch between locations freely

**The magic:** All worktrees share `.git`, so updates to main are instantly available everywhere. Just `git fetch` and `git merge/rebase` to sync!
