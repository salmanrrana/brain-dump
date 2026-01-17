# Enterprise Conversation Logging

Brain Dump includes enterprise-grade conversation logging for compliance auditing. This feature captures AI conversation sessions and messages with tamper detection, secret detection, retention policies, and export capabilities.

## Local-First: Your Data Stays on Your Machine

**Brain Dump is 100% local-first.** All conversation logs are stored in a SQLite database on your local filesystem. Nothing is sent to the cloud, no external servers, no telemetry.

| What     | Where                                                            |
| -------- | ---------------------------------------------------------------- |
| Database | `~/Library/Application Support/brain-dump/brain-dump.db` (macOS) |
| Backups  | `~/Library/Application Support/brain-dump/backups/`              |
| Logs     | Local SQLite tables only                                         |

**Why does this exist?** Enterprise compliance requirements (SOC2, GDPR, ISO 27001) often mandate audit trails for AI-assisted development. This feature lets you check that box while keeping everything on your own hardware. When auditors ask "do you log AI interactions?", you can say yes - and show them the local database.

## Compliance Coverage

This feature helps satisfy:

- **SOC2** - Audit trail of AI interactions with integrity verification
- **GDPR** - Data subject access requests (export) and right to erasure (archive)
- **ISO 27001** - Information security management with access logging

All without sending a single byte off your machine.

## What Data is Captured

### Conversation Sessions

Each AI conversation creates a session record containing:

| Field                 | Description                                                           |
| --------------------- | --------------------------------------------------------------------- |
| `id`                  | Unique session identifier (UUID)                                      |
| `project_id`          | Link to Brain Dump project                                            |
| `ticket_id`           | Link to ticket being worked on                                        |
| `user_id`             | User identifier (for future multi-user support)                       |
| `environment`         | Detection source: `claude-code`, `vscode`, `opencode`, `unknown`      |
| `session_metadata`    | JSON object with additional context                                   |
| `data_classification` | Sensitivity level: `public`, `internal`, `confidential`, `restricted` |
| `legal_hold`          | Boolean flag preventing deletion                                      |
| `started_at`          | Session start timestamp                                               |
| `ended_at`            | Session end timestamp (null if active)                                |

### Conversation Messages

Each message within a session captures:

| Field                        | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `id`                         | Unique message identifier (UUID)                      |
| `session_id`                 | Parent session reference                              |
| `role`                       | Message author: `user`, `assistant`, `system`, `tool` |
| `content`                    | Full message text                                     |
| `content_hash`               | HMAC-SHA256 hash for tamper detection                 |
| `tool_calls`                 | JSON array of tool invocations                        |
| `token_count`                | Token usage for the message                           |
| `model_id`                   | Model identifier (e.g., `claude-opus-4-5-20251101`)   |
| `sequence_number`            | Order within session                                  |
| `contains_potential_secrets` | Boolean flag if secrets detected                      |
| `created_at`                 | Message timestamp                                     |

### Audit Log Access

All access to conversation logs is tracked:

| Field         | Description                                            |
| ------------- | ------------------------------------------------------ |
| `id`          | Access record identifier                               |
| `accessor_id` | Who accessed the data                                  |
| `target_type` | Resource type: `session`, `message`, `export`          |
| `target_id`   | Specific resource ID                                   |
| `action`      | Action taken: `read`, `export`, `delete`, `legal_hold` |
| `result`      | Outcome: `success`, `denied`, `error`                  |
| `accessed_at` | Access timestamp                                       |

## MCP Tools

Six MCP tools are available for conversation logging:

### start_conversation_session

Creates a new conversation session for compliance logging.

```
Parameters:
- projectId (optional): Link to project
- ticketId (optional): Link to ticket
- userId (optional): User identifier
- metadata (optional): JSON context object
- dataClassification (optional): public | internal | confidential | restricted
```

### log_conversation_message

Records a message with tamper detection and secret scanning.

```
Parameters:
- sessionId (required): Session to log to
- role (required): user | assistant | system | tool
- content (required): Full message text
- toolCalls (optional): Array of tool call objects
- tokenCount (optional): Token usage
- modelId (optional): Model identifier
```

### end_conversation_session

Marks a session as complete, preventing further message logging.

```
Parameters:
- sessionId (required): Session to end
```

### list_conversation_sessions

Queries sessions with flexible filtering.

```
Parameters:
- projectId (optional): Filter by project
- ticketId (optional): Filter by ticket
- environment (optional): Filter by environment
- startDate (optional): Sessions after date (ISO)
- endDate (optional): Sessions before date (ISO)
- includeActive (optional): Include open sessions (default: true)
- limit (optional): Max results (default: 50, max: 200)
```

### export_compliance_logs

Generates JSON export for auditors with integrity verification.

```
Parameters:
- sessionId (optional): Export specific session
- projectId (optional): Export all project sessions
- startDate (required): Start of date range (ISO)
- endDate (required): End of date range (ISO)
- includeContent (optional): Include message text (default: true)
- verifyIntegrity (optional): Verify HMAC hashes (default: true)
```

### archive_old_sessions

Implements retention policy by deleting old sessions.

```
Parameters:
- retentionDays (optional): Days to retain (default: from settings or 90)
- confirm (optional): Actually delete vs dry-run (default: false)
```

**Safety Features:**

- Dry-run by default (shows what would be deleted)
- Sessions with `legal_hold=true` are NEVER deleted
- All deletions are logged to audit trail

## Retention Policies

### Default Retention

- Default retention period: **90 days**
- Configurable via Settings UI: 7-365 days
- Sessions older than retention period can be archived

### Legal Hold

Sessions under legal hold are protected:

```sql
-- Sessions with legal hold are never deleted
UPDATE conversation_sessions
SET legal_hold = 1
WHERE id = 'session-id';
```

### Archiving

Use the `archive_old_sessions` MCP tool:

1. **Dry-run first** (default): See what would be deleted
2. **Confirm to delete**: Set `confirm: true` to actually delete
3. **Audit logged**: All deletions recorded in `audit_log_access`

## Security Features

### HMAC Tamper Detection

Every message is hashed using HMAC-SHA256:

- Key derived from: `hostname + sessionId`
- Hash stored in `content_hash` field
- Export tool can verify all hashes match content

### Secret Detection

Automatic scanning for 20+ credential patterns:

- OpenAI, Anthropic, AWS, GitHub API keys
- Slack tokens, private keys
- Database connection strings
- Generic password assignments

When detected:

- `contains_potential_secrets` flag set to `true`
- Actual secrets are **NOT stored or logged**
- Only the detection flag is recorded

### Data Classification

Four levels available:

| Level          | Description                       |
| -------------- | --------------------------------- |
| `public`       | Non-sensitive, publicly shareable |
| `internal`     | Internal use only (default)       |
| `confidential` | Sensitive business data           |
| `restricted`   | Highly sensitive, limited access  |

## GDPR Compliance

### Data Subject Access Request (DSAR)

Export all data for a user:

```sql
-- Find all sessions for a user
SELECT * FROM conversation_sessions
WHERE user_id = 'user-id';

-- Export via MCP tool
export_compliance_logs({
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  includeContent: true,
  verifyIntegrity: true
})
```

### Right to Erasure

Archive sessions for a user (respecting legal hold):

```sql
-- Check for legal holds first
SELECT id, legal_hold FROM conversation_sessions
WHERE user_id = 'user-id' AND legal_hold = 1;

-- Archive non-held sessions
-- Use archive_old_sessions MCP tool or:
DELETE FROM conversation_sessions
WHERE user_id = 'user-id' AND legal_hold = 0;
```

## Database Queries for Auditors

### Direct SQL Access

Use DBeaver, SQLite CLI, or similar tools to query:

```bash
# Database location
# macOS: ~/Library/Application Support/brain-dump/brain-dump.db
# Linux: ~/.local/share/brain-dump/brain-dump.db
# Windows: %APPDATA%\brain-dump\brain-dump.db
```

### Common Queries

```sql
-- All sessions in date range
SELECT * FROM conversation_sessions
WHERE started_at BETWEEN '2024-01-01' AND '2024-12-31';

-- Message count by role
SELECT role, COUNT(*) as count
FROM conversation_messages
GROUP BY role;

-- Sessions with potential secrets
SELECT s.id, s.started_at, s.project_id, s.ticket_id
FROM conversation_sessions s
JOIN conversation_messages m ON m.session_id = s.id
WHERE m.contains_potential_secrets = 1
GROUP BY s.id;

-- Session duration statistics
SELECT
  id,
  started_at,
  ended_at,
  (julianday(ended_at) - julianday(started_at)) * 24 * 60 as duration_minutes
FROM conversation_sessions
WHERE ended_at IS NOT NULL;

-- Messages per session
SELECT
  session_id,
  COUNT(*) as message_count,
  SUM(token_count) as total_tokens
FROM conversation_messages
GROUP BY session_id;

-- Audit log for exports
SELECT * FROM audit_log_access
WHERE action = 'export'
ORDER BY accessed_at DESC;

-- Sessions under legal hold
SELECT * FROM conversation_sessions
WHERE legal_hold = 1;
```

### Integrity Verification

Verify message integrity manually:

```javascript
// HMAC key derivation (JavaScript)
const crypto = require("crypto");
const os = require("os");

function computeContentHash(sessionId, content) {
  const keyMaterial = os.hostname() + sessionId;
  const hmac = crypto.createHmac("sha256", keyMaterial);
  hmac.update(content);
  return hmac.digest("hex");
}

// Compare with stored content_hash
```

## Settings

### UI Configuration

Access via Settings modal:

- **Enable Conversation Logging**: Toggle on/off (default: on)
- **Retention Period**: 7-365 days (default: 90)

### Database Settings

Settings are stored in the `settings` table:

```sql
-- View current settings
SELECT
  conversation_logging_enabled,
  conversation_retention_days
FROM settings
LIMIT 1;

-- Update retention period
UPDATE settings
SET conversation_retention_days = 180;
```

## Automatic Session Management

### Workflow Integration

Sessions are automatically created and ended by workflow tools:

1. **start_ticket_work**: Creates a conversation session linked to ticket
2. **complete_ticket_work**: Ends all active sessions for the ticket

This ensures all ticket work is logged without manual intervention.

### Environment Detection

The system auto-detects the development environment:

| Environment   | Detection Method                              |
| ------------- | --------------------------------------------- |
| `claude-code` | `CLAUDE_CODE` env var or Claude Code context  |
| `vscode`      | VS Code MCP extension context                 |
| `opencode`    | OpenCode context                              |
| `unknown`     | Fallback when environment can't be determined |

## Troubleshooting

### Sessions Not Being Created

1. Check if logging is enabled in Settings
2. Verify MCP server is running
3. Check database permissions

### Export Verification Failures

1. Ensure content hasn't been modified outside the system
2. Verify hostname hasn't changed (affects HMAC key)
3. Check for database corruption with integrity check

### High Disk Usage

1. Review retention settings (shorter retention = less storage)
2. Run archive_old_sessions to clean up old data
3. Consider excluding large tool outputs from logging

## Best Practices

1. **Set appropriate retention** - Balance compliance needs with storage
2. **Use legal hold** - Protect sessions involved in disputes
3. **Regular exports** - Periodically export for off-site backup
4. **Monitor secrets** - Review sessions flagged for potential secrets
5. **Audit access** - Regularly review audit_log_access table
