# Compliance Logging

Enterprise conversation logging for SOC2, GDPR, and ISO 27001 compliance.
All actions use the consolidated `admin` tool.

## Starting a Session

Call the **admin** tool:

```
action: "start-conversation"
projectId: "<project-id>"       # optional
ticketId: "<ticket-id>"         # optional
userId: "<user-id>"             # optional
dataClassification: "internal"  # public | internal | confidential | restricted
metadata: { "key": "value" }   # optional JSON object
```

Returns a session with an ID for subsequent calls.

## Logging Messages

For each message in a conversation, call the **admin** tool:

```
action: "log-message"
sessionId: "<session-id>"
role: "assistant"               # user | assistant | system | tool
content: "Full message text"
toolCalls: [{ "name": "Edit", "parameters": {}, "result": "ok" }]  # optional
tokenCount: 500                 # optional
modelId: "claude-3-opus"        # optional
```

Messages include:

- **Tamper detection**: HMAC-SHA256 content hashing
- **Secret detection**: Automatic scanning for 20+ credential patterns
- **Sequential numbering**: Messages are ordered within the session

## Ending a Session

Call the **admin** tool:

```
action: "end-conversation"
sessionId: "<session-id>"
```

After ending, no more messages can be logged to the session.

## Querying Sessions

Call the **admin** tool:

```
action: "list-conversations"
projectId: "<project-id>"       # optional filter
ticketId: "<ticket-id>"         # optional filter
environment: "claude-code"      # optional: claude-code | vscode | unknown
startDate: "2025-01-01"         # optional ISO date
endDate: "2025-12-31"           # optional ISO date
includeActive: true             # include sessions not yet ended
limit: 50                       # max results (default 50, max 200)
```

## Exporting Logs

For compliance audits, call the **admin** tool:

```
action: "export-logs"
startDate: "2025-01-01"         # required
endDate: "2025-12-31"           # required
sessionId: "<session-id>"       # optional, export one session
projectId: "<project-id>"       # optional, export all for a project
includeContent: true            # include full message text
verifyIntegrity: true           # recompute and verify HMAC hashes
```

Returns structured JSON with:

- `exportMetadata`: timestamp, date range, session count
- `integrityReport`: hash verification results
- `sessions`: full session data with nested messages

All access to export logs is recorded in the audit trail.

## Archiving Old Sessions

Implement data retention policy by calling the **admin** tool:

```
action: "archive-sessions"
retentionDays: 90               # days to retain (default from settings or 90)
confirm: false                  # dry run by default; set true to delete
```

Safety features:

- **Dry run by default**: Shows what would be deleted without deleting
- **Legal hold**: Sessions with `legal_hold=true` are never deleted
- **Audit trail**: All deletions are logged

## Settings

Configure via the Brain Dump Settings UI:

- **Enable Conversation Logging**: Toggle on/off (default: on)
- **Retention Period**: 7-365 days (default: 90)
