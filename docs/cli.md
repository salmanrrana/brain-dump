# CLI Reference

Brain Dump includes a command-line tool for database utilities like backup, restore, and health checks.

> **Note:** For ticket management, use Brain Dump's MCP tools instead:
>
> - `start_ticket_work` - Create branch + set status to in_progress
> - `complete_ticket_work` - Move to review + suggest next ticket
> - `update_ticket_status` - Change ticket status directly
> - `add_ticket_comment` - Add work summaries or notes

## Quick Reference

| Command                       | Description                |
| ----------------------------- | -------------------------- |
| `brain-dump backup`           | Create database backup     |
| `brain-dump backup --list`    | List available backups     |
| `brain-dump restore <file>`   | Restore from backup        |
| `brain-dump restore --latest` | Restore most recent backup |
| `brain-dump check`            | Quick integrity check      |
| `brain-dump check --full`     | Full database health check |
| `brain-dump help`             | Show help message          |

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

## Exit Codes

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 0    | Success                                        |
| 1    | Error (database error, backup not found, etc.) |

---

## Environment

The CLI uses XDG-compliant paths:

| OS    | Database                                    | State (backups, logs)        |
| ----- | ------------------------------------------- | ---------------------------- |
| Linux | `~/.local/share/brain-dump/`                | `~/.local/state/brain-dump/` |
| macOS | `~/Library/Application Support/brain-dump/` | Same                         |

The CLI shares the database with the Brain Dump web UI and MCP server.

---

## Why MCP Tools Instead of CLI?

The CLI originally included ticket management commands (`done`, `current`, `status`, etc.), but these have been removed in favor of MCP tools because:

1. **Richer functionality** - MCP tools add work summaries, suggest next tickets, and link commits automatically
2. **Better integration** - MCP tools work directly with Claude/Ralph sessions
3. **Less maintenance** - One source of truth for ticket management logic

The CLI now focuses on what MCP can't do: database backup, restore, and health checks.
