# Backup & Restore

Brain Dumpy includes automatic daily backups and manual backup/restore commands to protect your data.

## Automatic Backups

### Daily Backups

Brain Dumpy automatically creates a backup once per day on first use:

- **Trigger**: First database operation each day (MCP server start, CLI command, or app launch)
- **Location**: `~/.local/state/brain-dumpy/backups/`
- **Filename**: `brain-dumpy-YYYY-MM-DD.db`
- **Retention**: Last 7 days (configurable)

### How It Works

1. On startup, Brain Dumpy checks if a backup was created today
2. If not, it runs `VACUUM INTO` to create a clean, defragmented backup
3. The backup is verified with `PRAGMA integrity_check`
4. Backups older than 7 days are automatically deleted

### Backup Method

Backups use SQLite's `VACUUM INTO` command, which:
- Creates an atomic, consistent snapshot
- Defragments the database for smaller file size
- Works safely even with active connections
- Never corrupts the source database

## Manual Backup Commands

### Create Backup

```bash
# Create immediate backup
pnpm brain-dump backup
# Output: Created backup: brain-dumpy-2026-01-12.db (15.2 MB)
```

Force a backup even if one already exists today by running the command again.

### List Backups

```bash
# Show all available backups
pnpm brain-dump backup --list
```

Output:
```
Available backups:
  brain-dumpy-2026-01-12.db  15.2 MB  (today)
  brain-dumpy-2026-01-11.db  15.1 MB  (1 day ago)
  brain-dumpy-2026-01-10.db  14.9 MB  (2 days ago)
  brain-dumpy-2026-01-09.db  14.8 MB  (3 days ago)
  brain-dumpy-2026-01-08.db  14.7 MB  (4 days ago)

Total: 5 backups using 74.7 MB
Backup location: ~/.local/state/brain-dumpy/backups/
```

## Restore Commands

### Restore from Specific Backup

```bash
# Restore from a specific backup file
pnpm brain-dump restore brain-dumpy-2026-01-10.db
```

### Restore Latest Backup

```bash
# Restore the most recent backup
pnpm brain-dump restore --latest
```

### Restore Process

When you run a restore command:

1. **Confirmation prompt** - Shows current vs backup statistics
   ```
   Current database:
     Projects: 5, Epics: 12, Tickets: 150

   Backup (2026-01-10):
     Projects: 5, Epics: 10, Tickets: 142

   Proceed with restore? (y/N)
   ```

2. **Pre-restore backup** - Current database is saved as `pre-restore-{timestamp}.db`

3. **Integrity check** - Backup is verified before restore

4. **Database replacement** - Backup is copied to the database location

5. **Post-restore check** - Restored database is verified

### After Restoring

After a successful restore:
- Restart Brain Dumpy (the web UI) to use the new database
- MCP server will automatically use the restored database
- CLI commands will use the restored database immediately

## MCP Health Check

The `get_database_health` MCP tool provides backup status:

```json
{
  "status": "healthy",
  "backup": {
    "lastBackup": "2026-01-12",
    "backupCount": 7,
    "backupsDir": "~/.local/state/brain-dumpy/backups"
  }
}
```

Use this in Claude to check backup status:
```
"Check Brain Dumpy database health"
```

## Backup Best Practices

### Before Major Changes

Create a manual backup before:
- Major refactoring or migrations
- Bulk ticket operations
- Upgrading Brain Dumpy

```bash
pnpm brain-dump backup
```

### Offsite Backups

For additional protection, periodically copy backups to another location:

```bash
# Copy all backups to external drive
cp ~/.local/state/brain-dumpy/backups/*.db /mnt/backup/brain-dumpy/

# Or sync to cloud storage
rclone sync ~/.local/state/brain-dumpy/backups/ remote:brain-dumpy-backups/
```

### Verify Backups

Periodically verify backup integrity:

```bash
# Check a backup file
sqlite3 ~/.local/state/brain-dumpy/backups/brain-dumpy-2026-01-12.db "PRAGMA integrity_check;"
# Should output: ok
```

## Troubleshooting Backups

### Backup Not Created

If automatic backups aren't being created:

1. Check disk space: `df -h ~/.local/state`
2. Check permissions: `ls -la ~/.local/state/brain-dumpy/backups/`
3. Check logs: `cat ~/.local/state/brain-dumpy/logs/brain-dumpy.log | grep backup`

### Restore Failed

If restore fails:

1. Check if pre-restore backup was created in `~/.local/state/brain-dumpy/backups/`
2. Verify the backup file isn't corrupted:
   ```bash
   sqlite3 backup-file.db "PRAGMA integrity_check;"
   ```
3. Try manual restore:
   ```bash
   cp backup-file.db ~/.local/share/brain-dumpy/brain-dumpy.db
   ```

### Recovering from Pre-Restore Backup

If a restore went wrong, find the pre-restore backup:

```bash
ls -la ~/.local/state/brain-dumpy/backups/pre-restore-*.db
```

Restore it manually:
```bash
cp ~/.local/state/brain-dumpy/backups/pre-restore-2026-01-12T10-30-00.db \
   ~/.local/share/brain-dumpy/brain-dumpy.db
```

## See Also

- [Data Locations](data-locations.md) - Where files are stored
- [Troubleshooting](troubleshooting.md) - Database corruption recovery
