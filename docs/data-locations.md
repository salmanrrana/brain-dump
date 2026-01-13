# Data Locations

Brain Dumpy follows the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir-spec/latest/) for predictable, organized data storage across Linux, macOS, and Windows.

## Directory Structure

```
~/.local/share/brain-dump/       # XDG_DATA_HOME
  brain-dump.db                  # Main SQLite database
  brain-dump.db-wal              # Write-ahead log (WAL mode)
  brain-dump.db-shm              # Shared memory file
  attachments/                    # File attachments

~/.local/state/brain-dump/       # XDG_STATE_HOME
  backups/                        # Automatic and manual backups
    brain-dump-YYYY-MM-DD.db     # Daily backup files
    pre-restore-*.db              # Pre-restore safety backups
    .last-backup                  # Backup tracking marker
  logs/                           # Application logs
    brain-dump.log               # Main log file
    mcp-server.log                # MCP server log
    error.log                     # Errors only
  brain-dump.lock                # Process lock file
  current-ticket.json             # CLI ticket tracking
  migration.log                   # Migration history
```

## Path Reference

### Linux Paths

| Data Type | Default Path | Environment Override |
|-----------|--------------|---------------------|
| Database | `~/.local/share/brain-dump/brain-dump.db` | `XDG_DATA_HOME` |
| Attachments | `~/.local/share/brain-dump/attachments/` | `XDG_DATA_HOME` |
| Backups | `~/.local/state/brain-dump/backups/` | `XDG_STATE_HOME` |
| Logs | `~/.local/state/brain-dump/logs/` | `XDG_STATE_HOME` |
| Lock file | `~/.local/state/brain-dump/brain-dump.lock` | `XDG_STATE_HOME` |

### macOS Paths

| Type | Path |
|------|------|
| Data | ~/Library/Application Support/brain-dump/ |
| State | ~/Library/Application Support/brain-dump/ |
| Config | ~/Library/Application Support/brain-dump/ |
| Cache | ~/Library/Caches/brain-dump/ |

### Windows Paths

| Type | Path |
|------|------|
| Data | %APPDATA%\brain-dump\ |
| State | %LOCALAPPDATA%\brain-dump\ |
| Config | %APPDATA%\brain-dump\ |
| Cache | %LOCALAPPDATA%\brain-dump\ |

## Environment Variables

You can override the default directories by setting XDG environment variables:

```bash
# Override data directory (database, attachments)
export XDG_DATA_HOME=/custom/path/share

# Override state directory (backups, logs, lock)
export XDG_STATE_HOME=/custom/path/state
```

With these overrides, Brain Dumpy would use:
- `/custom/path/share/brain-dump/brain-dump.db`
- `/custom/path/state/brain-dump/backups/`

## Legacy Directory (~/.brain-dump)

Prior to version 2.0, Brain Dumpy stored all data in `~/.brain-dump/`. This location is now deprecated but fully supported for migration.

### Automatic Migration

On first launch after upgrading:
1. Brain Dumpy checks if `~/.brain-dump/` exists
2. If XDG location is empty, data is copied (not moved)
3. A `.migrated` marker is created in the legacy directory
4. Migration is logged to `~/.local/state/brain-dump/migration.log`

### Migration Safety

- **Data is copied, never deleted** - Your legacy data remains intact
- **Pre-migration backup** - A backup is created before copying
- **Integrity verification** - Database is verified after copy
- **One-time operation** - Migration only runs once per installation

### Manual Migration

If automatic migration fails or you prefer manual control:

```bash
# 1. Create new directories
mkdir -p ~/.local/share/brain-dump
mkdir -p ~/.local/state/brain-dump/backups

# 2. Copy database
cp ~/.brain-dump/brain-dump.db ~/.local/share/brain-dump/brain-dump.db
cp ~/.brain-dump/brain-dump.db-wal ~/.local/share/brain-dump/brain-dump.db-wal 2>/dev/null
cp ~/.brain-dump/brain-dump.db-shm ~/.local/share/brain-dump/brain-dump.db-shm 2>/dev/null

# 3. Copy attachments
cp -r ~/.brain-dump/attachments ~/.local/share/brain-dump/

# 4. Mark migration complete
echo '{"migratedAt": "'$(date -Iseconds)'"}' > ~/.brain-dump/.migrated
```

## File Descriptions

### Database Files

| File | Purpose |
|------|---------|
| `brain-dump.db` | Main SQLite database with all projects, epics, tickets |
| `brain-dump.db-wal` | Write-ahead log for concurrent access (SQLite WAL mode) |
| `brain-dump.db-shm` | Shared memory index for WAL mode |

### State Files

| File | Purpose |
|------|---------|
| `brain-dump.lock` | Prevents concurrent database corruption, contains PID info |
| `current-ticket.json` | Tracks which ticket the CLI is currently working on |
| `.last-backup` | Timestamp of last automatic backup (prevents duplicate daily backups) |

### Log Files

| File | Purpose |
|------|---------|
| `brain-dump.log` | Main application log with all operations |
| `mcp-server.log` | MCP server-specific operations and tool calls |
| `error.log` | Errors only, for quick debugging |

Logs are automatically rotated when they exceed 10MB. The last 5 rotated files are kept.

## Permissions

All directories are created with `0700` permissions (owner read/write/execute only) for security.

## See Also

- [Backup & Restore](backup-restore.md) - Backup system details
- [Troubleshooting](troubleshooting.md) - Common issues and recovery
