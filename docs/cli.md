# CLI Reference

Brain Dump includes a command-line tool for managing tickets from the terminal. This is especially useful for Claude Code hooks and automation.

## Quick Reference

| Command                           | Description                   |
| --------------------------------- | ----------------------------- |
| `brain-dump current`              | Show current ticket           |
| `brain-dump done`                 | Move current ticket to review |
| `brain-dump complete`             | Move current ticket to done   |
| `brain-dump status <id> <status>` | Set specific ticket status    |
| `brain-dump clear`                | Clear current ticket state    |
| `brain-dump backup`               | Create database backup        |
| `brain-dump backup --list`        | List available backups        |
| `brain-dump restore <file>`       | Restore from backup           |
| `brain-dump restore --latest`     | Restore most recent backup    |
| `brain-dump check`                | Quick integrity check         |
| `brain-dump check --full`         | Full database health check    |
| `brain-dump help`                 | Show help message             |

---

## Commands

### brain-dump current

Show information about the ticket you're currently working on.

```bash
$ brain-dump current
Current Ticket:
  ID: abc-1234-5678
  Title: Add user authentication
  Status: in_progress
  Priority: high
  Project: /home/user/my-app
  Started: 1/16/2024, 10:30:00 AM
```

If no ticket is active:

```bash
$ brain-dump current
No ticket is currently being worked on.
Use 'Start Work' in Brain Dump to begin working on a ticket.
```

### brain-dump done

Move the current ticket to the **Review** column and clear the current ticket state.

```bash
$ brain-dump done
✓ Ticket "Add user authentication" moved to REVIEW
✓ Current ticket cleared. Ready for your review!
```

### brain-dump complete

Move the current ticket directly to **Done** (skipping review).

```bash
$ brain-dump complete
✓ Ticket "Add user authentication" moved to DONE
✓ Ticket marked as Done!
```

### brain-dump status

Set the status of a specific ticket by ID.

```bash
brain-dump status <ticket-id> <status>
```

**Valid statuses:** `backlog`, `ready`, `in_progress`, `review`, `ai_review`, `human_review`, `done`

**Example:**

```bash
$ brain-dump status abc-1234-5678 review
✓ Ticket "Add user authentication" moved to REVIEW
```

### brain-dump clear

Clear the current ticket state without changing ticket status.

```bash
$ brain-dump clear
✓ Current ticket state cleared.
```

---

## Backup Commands

### brain-dump backup

Create an immediate backup of the database.

```bash
$ brain-dump backup
Creating backup...
✓ Backup created: /home/user/.local/state/brain-dump/backups/brain-dump-2024-01-16T10-30-00.db
```

### brain-dump backup --list

List all available backups.

```bash
$ brain-dump backup --list

Available Backups (5):

  Date        Size      Filename
  --------------------------------------------------
  2024-01-16     1.2 MB  brain-dump-2024-01-16T10-30-00.db
  2024-01-15     1.1 MB  brain-dump-2024-01-15T14-22-00.db
  2024-01-14     1.0 MB  brain-dump-2024-01-14T09-15-00.db

Backup directory: /home/user/.local/state/brain-dump/backups
```

### brain-dump restore

Restore the database from a backup file.

```bash
# Restore from specific backup
brain-dump restore brain-dump-2024-01-15T14-22-00.db

# Restore from most recent backup
brain-dump restore --latest
```

**Example:**

```bash
$ brain-dump restore --latest

Verifying backup: brain-dump-2024-01-16T10-30-00.db...
✓ Backup integrity verified.

Restore Summary:
  ----------------------------------------
  Current DB: 3 projects, 5 epics, 42 tickets
  Backup:     3 projects, 5 epics, 38 tickets
  ----------------------------------------

⚠️  WARNING: This will replace your current database!
  A pre-restore backup will be created automatically.

Proceed with restore? (y/N): y

Restoring...
✓ Database restored successfully from backup.
  Pre-restore backup saved to: /home/user/.local/state/brain-dump/backups/pre-restore-2024-01-16T10-35-00.db

⚠️  Please restart Brain Dump to use the restored database.
```

---

## Health Check Commands

### brain-dump check

Run a quick integrity check on the database.

```bash
$ brain-dump check
Running quick integrity check...
✓ Database integrity OK (15ms)
```

### brain-dump check --full

Run a comprehensive health check with detailed diagnostics.

```bash
$ brain-dump check --full
Running full database health check...

Integrity Check:
  Status: OK
  Message: Database integrity check passed

Foreign Key Check:
  Status: OK
  Message: No foreign key violations

WAL Check:
  Status: OK
  Message: WAL mode is healthy
    - Mode: wal
    - WAL file: 45.2 KB

Table Check:
  Status: OK
  Message: All required tables present

--------------------------------------------------
Overall Status: ✓ OK
Duration: 23ms
```

---

## Claude Code Integration

The CLI is designed to work with Claude Code hooks. Add to your `~/.claude.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "command": "brain-dump done",
        "trigger": "when the task is complete"
      }
    ]
  }
}
```

This automatically moves tickets to review when Claude finishes work.

---

## Exit Codes

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 0    | Success                                        |
| 1    | Error (ticket not found, database error, etc.) |

---

## Environment

The CLI uses XDG-compliant paths:

| OS    | Database                                    | State (backups, logs)        |
| ----- | ------------------------------------------- | ---------------------------- |
| Linux | `~/.local/share/brain-dump/`                | `~/.local/state/brain-dump/` |
| macOS | `~/Library/Application Support/brain-dump/` | Same                         |

The CLI shares the database with the Brain Dump web UI and MCP server.
