# Troubleshooting

Common issues and solutions for Brain Dumpy.

## Database Issues

### "Database is locked" Error

**Symptoms**: Operations fail with "SQLITE_BUSY" or "database is locked" errors.

**Causes**:
- Multiple processes accessing the database simultaneously
- Previous process didn't shut down cleanly

**Solutions**:

1. Check for running processes:
   ```bash
   cat ~/.local/state/brain-dumpy/brain-dumpy.lock
   ```

2. If the lock is stale (process not running), remove it:
   ```bash
   rm ~/.local/state/brain-dumpy/brain-dumpy.lock
   ```

3. Force WAL checkpoint:
   ```bash
   sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db "PRAGMA wal_checkpoint(TRUNCATE);"
   ```

### Database Corruption

**Symptoms**: Operations fail with "database disk image is malformed" or integrity check fails.

**Diagnosis**:
```bash
# Quick check
pnpm brain-dump check

# Full diagnostic
pnpm brain-dump check --full
```

**Recovery**:

1. Restore from backup:
   ```bash
   pnpm brain-dump restore --latest
   ```

2. If no backup available, try SQLite recovery:
   ```bash
   # Export what's readable
   sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db ".dump" > dump.sql

   # Create new database
   mv ~/.local/share/brain-dumpy/brain-dumpy.db brain-dumpy.db.corrupt
   sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db < dump.sql
   ```

### Foreign Key Violations

**Symptoms**: `brain-dump check --full` reports foreign key violations.

**Cause**: References to deleted projects, epics, or tickets.

**Solution**:
```bash
# Show violations
sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db "PRAGMA foreign_key_check;"

# Fix by removing orphaned records (example for tickets with missing projects)
sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db "
  DELETE FROM tickets
  WHERE project_id NOT IN (SELECT id FROM projects);
"
```

### WAL File Too Large

**Symptoms**: `brain-dumpy.db-wal` file is very large (>100MB).

**Cause**: WAL wasn't checkpointed, possibly due to unclean shutdown.

**Solution**:
```bash
# Force checkpoint
sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

## Migration Issues

### Automatic Migration Failed

**Symptoms**: Data not appearing after upgrade, still using `~/.brain-dump/`.

**Diagnosis**:
```bash
# Check if legacy data exists
ls -la ~/.brain-dump/

# Check if XDG location has data
ls -la ~/.local/share/brain-dumpy/

# Check migration log
cat ~/.local/state/brain-dumpy/migration.log
```

**Solutions**:

1. Remove migration marker and restart:
   ```bash
   rm ~/.brain-dump/.migrated
   # Restart Brain Dumpy
   ```

2. Manual migration:
   ```bash
   mkdir -p ~/.local/share/brain-dumpy
   cp ~/.brain-dump/brain-dump.db ~/.local/share/brain-dumpy/brain-dumpy.db
   cp -r ~/.brain-dump/attachments ~/.local/share/brain-dumpy/
   ```

### Both Locations Have Data

**Symptoms**: Warning about both legacy and XDG locations having data.

**Cause**: Database was created in both locations (possibly from different installations).

**Solution**:
1. Decide which database to keep
2. Back up both:
   ```bash
   cp ~/.brain-dump/brain-dump.db ~/brain-dump-legacy.db
   cp ~/.local/share/brain-dumpy/brain-dumpy.db ~/brain-dump-xdg.db
   ```
3. Remove the one you don't want to keep

## MCP Server Issues

### MCP Server Not Connecting

**Symptoms**: Claude Code can't find Brain Dumpy tools.

**Solutions**:

1. Verify configuration in `~/.claude.json`:
   ```json
   {
     "mcpServers": {
       "brain-dumpy": {
         "command": "node",
         "args": ["/path/to/brain-dumpy/mcp-server/index.js"]
       }
     }
   }
   ```

2. Test the server directly:
   ```bash
   node /path/to/brain-dumpy/mcp-server/index.js
   # Should output JSON-RPC on stderr
   ```

3. Check for Node.js errors:
   ```bash
   node /path/to/brain-dumpy/mcp-server/index.js 2>&1 | head -20
   ```

### MCP Server Database Errors

**Symptoms**: MCP tools fail with database errors.

**Solutions**:

1. Check MCP server logs:
   ```bash
   cat ~/.local/state/brain-dumpy/logs/mcp-server.log
   ```

2. Verify database path:
   ```bash
   ls -la ~/.local/share/brain-dumpy/brain-dumpy.db
   ```

3. Test database connectivity:
   ```bash
   sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db "SELECT COUNT(*) FROM projects;"
   ```

## CLI Issues

### "Current ticket not set" Error

**Symptoms**: CLI commands fail with no current ticket.

**Cause**: No ticket is being tracked.

**Solution**:
```bash
# Check current ticket
pnpm brain-dump current

# Set a ticket manually
echo '{"ticketId":"abc-123"}' > ~/.local/state/brain-dumpy/current-ticket.json

# Or clear and start fresh
pnpm brain-dump clear
```

### CLI Not Finding Database

**Symptoms**: CLI reports "database not found" or creates new empty database.

**Solutions**:

1. Check if database exists:
   ```bash
   ls -la ~/.local/share/brain-dumpy/brain-dumpy.db
   ```

2. Verify XDG environment:
   ```bash
   echo $XDG_DATA_HOME
   echo $XDG_STATE_HOME
   ```

## Application Issues

### Web UI Not Loading Data

**Symptoms**: Browser shows empty kanban board despite having data.

**Solutions**:

1. Check browser console for errors (F12 > Console)

2. Verify Vite dev server is running:
   ```bash
   pnpm dev
   ```

3. Check for database connection:
   ```bash
   curl http://localhost:4242/api/projects 2>/dev/null | head -c 200
   ```

### Attachments Not Showing

**Symptoms**: Uploaded files don't appear in tickets.

**Solutions**:

1. Check attachments directory exists:
   ```bash
   ls -la ~/.local/share/brain-dumpy/attachments/
   ```

2. Verify permissions:
   ```bash
   chmod -R 700 ~/.local/share/brain-dumpy/attachments/
   ```

## Performance Issues

### Slow Queries

**Symptoms**: Operations take several seconds.

**Solutions**:

1. Check database size:
   ```bash
   du -h ~/.local/share/brain-dumpy/brain-dumpy.db
   ```

2. Rebuild search index:
   ```bash
   sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db "
     INSERT INTO tickets_fts(tickets_fts) VALUES('rebuild');
   "
   ```

3. Vacuum database:
   ```bash
   sqlite3 ~/.local/share/brain-dumpy/brain-dumpy.db "VACUUM;"
   ```

### High Memory Usage

**Symptoms**: Node.js process using excessive memory.

**Solutions**:

1. Restart the application

2. Check for memory leaks in logs:
   ```bash
   grep -i "memory" ~/.local/state/brain-dumpy/logs/*.log
   ```

## Log Locations

For debugging any issue, check these logs:

| Log | Location | Content |
|-----|----------|---------|
| Main | `~/.local/state/brain-dumpy/logs/brain-dumpy.log` | All operations |
| MCP | `~/.local/state/brain-dumpy/logs/mcp-server.log` | MCP tool calls |
| Errors | `~/.local/state/brain-dumpy/logs/error.log` | Errors only |
| Migration | `~/.local/state/brain-dumpy/migration.log` | Migration history |

### Enabling Debug Logs

Set the log level for more verbose output:

```bash
export LOG_LEVEL=debug
pnpm dev
```

## Getting Help

If you're still stuck:

1. Check existing issues: https://github.com/salmanrrana/brain-dump/issues
2. Create a new issue with:
   - Error message (full text)
   - Output of `pnpm brain-dump check --full`
   - Relevant log entries
   - Steps to reproduce

## See Also

- [Data Locations](data-locations.md) - File locations reference
- [Backup & Restore](backup-restore.md) - Recovery procedures
