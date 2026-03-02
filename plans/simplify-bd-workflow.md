# Cross-Provider Workflow Pack Refactor

## Context

Brain Dump installs ~150+ files globally per provider (hooks, agents, commands, skills scattered across `~/.claude/`, `~/.cursor/`, `~/.copilot/`, etc.). This is excessive — typical projects install 0-3 global files. The root cause: Brain Dump conflates "task management app" with "workflow framework." Fix: split into two layers, workflow opt-in.

## Architecture: Two Layers

### 1. `brain-dump-core` (default, minimal)

- MCP server registration (1 config entry per provider)
- MCP prompts baked into server for universal knowledge delivery
- MCP self-telemetry (server instruments its own tool calls internally)
- `autoPr` param on `workflow start-work` (absorbs PR creation hook)
- Database at `~/.local/share/brain-dump/`
- CLI (`pnpm brain-dump`)
- **Zero global workflow assets** (MCP config entry is the only global touch)

### 2. `brain-dump-workflow-pack` (opt-in, one toggle per provider)

- 6 hooks (post-absorption residual)
- 3 review agents (code-reviewer, silent-failure-hunter, code-simplifier)
- 7 commands (/next-task, /review-ticket, /review-epic, /demo, /reconcile-learnings, /review, /extended-review)
- 1 skill (brain-dump-workflow with reference docs)
- Provider adapters for install/uninstall/doctor

### Not in either layer (project-local only)

- TanStack skills (query, mutations, types, forms, errors)
- react-best-practices, web-design-guidelines
- inception, breakdown agents

## Key Decisions Locked

1. Keep agents and skills as separate concepts
2. MCP prompts for universal workflow knowledge delivery (zero files for knowledge tier)
3. Claude Code plugin system for Claude workflow-pack packaging
4. Move hook logic into MCP where feasible BEFORE packaging
5. TanStack and general coding skills stay project-local only
6. Core is default profile for every provider

## Scope Boundaries

**In scope:**

- Installer/profile redesign
- Provider adapters
- Hook reduction via MCP absorption
- Workflow-pack packaging and enable/disable lifecycle
- Legacy cleanup tooling

**Out of scope:**

- Rewriting Brain Dump domain workflows
- Removing review pipeline capabilities
- Forcing all providers to identical UX primitives

## MCP Changes (Phase 1 — Do First)

### Add MCP prompts

- `brain-dump-workflow` — full 5-step workflow guide
- `code-review` — review checklist and instructions
- `silent-failure-review` — silent failure hunting checklist
- `code-simplifier-review` — simplification checklist

### Absorb hooks into MCP

- Add `autoPr` param to `workflow start-work` → absorbs `create-pr-on-ticket-start.sh`
- Add self-telemetry instrumentation → absorbs 6 telemetry hooks
- Move state recording into `session update-state` response → absorbs `record-state-change.sh`
- Move pending-link checks into `workflow start-work` / `sync-links` → absorbs `check-pending-links.sh` + `clear-pending-links.sh`

### Key files

- `mcp-server/index.ts` — prompt registrations, self-telemetry wrapper
- `mcp-server/tools/workflow.ts` + `core/workflow.ts` — `autoPr` param
- `mcp-server/lib/telemetry-self-log.ts` — enhanced self-telemetry

## Remaining Hook Set (Post-Absorption)

| Hook                         | Purpose                                        | Provider-dependent?                   |
| ---------------------------- | ---------------------------------------------- | ------------------------------------- |
| `enforce-state-before-write` | Blocks Write/Edit without correct Ralph state  | All hook-capable providers            |
| `enforce-review-before-push` | Blocks push/PR without completed review        | All hook-capable providers            |
| `link-commit-to-ticket`      | Reminds AI to call sync-links after git commit | All hook-capable providers            |
| `check-for-code-changes`     | Reminds AI to run review on Stop               | All hook-capable providers            |
| `capture-claude-tasks`       | Syncs TodoWrite tasks to Brain Dump DB         | Claude Code only (TodoWrite-specific) |
| `spawn-next-ticket`          | Spawns terminal for next ticket                | Disabled by default, env-gated        |

## Workflow-Pack Asset Layout (Repo)

```
workflow-pack/
├── manifest.json              # See "Ownership Manifest" section below
├── hooks/
│   ├── enforce-state-before-write.sh
│   ├── enforce-review-before-push.sh
│   ├── link-commit-to-ticket.sh
│   ├── check-for-code-changes.sh
│   ├── capture-claude-tasks.sh
│   └── spawn-next-ticket.sh
├── agents/
│   ├── code-reviewer.md
│   ├── silent-failure-hunter.md
│   └── code-simplifier.md
├── commands/
│   ├── next-task.md
│   ├── review-ticket.md
│   ├── review-epic.md
│   ├── demo.md
│   ├── reconcile-learnings.md
│   ├── review.md
│   └── extended-review.md
├── skills/
│   └── brain-dump-workflow/
│       ├── SKILL.md
│       └── reference/
│           ├── review-guide.md
│           ├── git-linking.md
│           ├── troubleshooting.md
│           └── compliance-logging.md
└── providers/
    ├── claude/
    │   ├── adapter.sh
    │   ├── plugin.json
    │   └── hooks.json
    ├── cursor/
    │   ├── adapter.sh
    │   └── hooks.json
    ├── copilot/
    │   ├── adapter.sh
    │   └── hooks.json
    ├── vscode/
    │   └── adapter.sh
    ├── opencode/
    │   ├── adapter.sh
    │   └── plugins/
    └── codex/
        └── adapter.sh
```

## Ownership Manifest and Install Receipts

### Source manifest (`workflow-pack/manifest.json`)

```json
{
  "name": "brain-dump-workflow-pack",
  "version": "1.0.0",
  "owner": "brain-dump",
  "receiptSchemaVersion": 1,
  "assets": {
    "hooks": ["enforce-state-before-write.sh", "..."],
    "agents": ["code-reviewer.md", "..."],
    "commands": ["next-task.md", "..."],
    "skills": ["brain-dump-workflow/"]
  },
  "legacyPaths": {
    "claude": [
      {
        "path": "~/.claude/hooks/enforce-state-before-write.sh",
        "sha256": "...",
        "lastLegacyVersion": "0.x"
      },
      { "path": "~/.claude/hooks/log-tool-start.sh", "sha256": "...", "lastLegacyVersion": "0.x" },
      { "path": "~/.claude/agents/code-reviewer.md", "sha256": "...", "lastLegacyVersion": "0.x" }
    ],
    "cursor": ["..."],
    "copilot": ["..."]
  }
}
```

### Install receipt (written per install)

```json
// ~/.claude/plugins/brain-dump-workflow/.install-receipt.json
{
  "installedAt": "2026-03-02T...",
  "version": "1.0.0",
  "receiptSchemaVersion": 1,
  "provider": "claude",
  "files": [
    { "path": "hooks/enforce-state-before-write.sh", "sha256": "abc123..." },
    { "path": "agents/code-reviewer.md", "sha256": "def456..." }
  ]
}
```

### Ownership marker in installed files

Every installed file includes a machine-readable ownership marker:

- **Shell scripts**: Header comment `# brain-dump-workflow-pack v1.0.0 | DO NOT EDIT — managed by brain-dump`
- **Markdown files**: YAML frontmatter field `owner: brain-dump-workflow-pack@1.0.0`
- **JSON files**: Top-level field `"_owner": "brain-dump-workflow-pack@1.0.0"`

### Cleanup matching (dual verification)

`uninstall-legacy` requires **both** markers to match before deleting:

1. **Ownership marker present** — file header/frontmatter/field contains `brain-dump-workflow-pack`
2. **Checksum matches** — sha256 matches a known Brain Dump asset (from receipt or `legacyPaths`)

| Marker  | Checksum | Action                                                                               |
| ------- | -------- | ------------------------------------------------------------------------------------ |
| Present | Matches  | **Delete** — confirmed Brain Dump asset                                              |
| Present | Mismatch | **Skip with warning** — "File has ownership marker but was modified; skipping"       |
| Absent  | Matches  | **Skip with warning** — "File content matches but has no ownership marker; skipping" |
| Absent  | Mismatch | **Ignore** — not a Brain Dump file                                                   |

This prevents:

- Removing user files that happen to have the same content (no marker → skip)
- Removing user-modified Brain Dump files without consent (mismatch → skip)
- Accidentally targeting non-Brain-Dump files at coincidental paths

### Receipt version compatibility

| Receipt version vs current pack version | Behavior                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same version                            | Normal uninstall — use receipt directly                                                                                                             |
| Receipt older than current              | **Migrate receipt** — read old schema, map to current schema, then uninstall. If migration fails, fall back to `legacyPaths` with dual verification |
| Receipt newer than current (downgrade)  | **Refuse** — print error: "Install receipt is from a newer version (X). Update brain-dump before managing this install."                            |
| No receipt exists (pre-receipt era)     | **Fall back to `legacyPaths`** — use `manifest.json` legacy entries with dual verification (marker + checksum)                                      |

`receiptSchemaVersion` field enables forward-compatible schema evolution. Adapters check this field before parsing.

## `.github/agents/` Compatibility Mirror

`.github/agents/` is NOT immediately removed. Instead:

**Phase 2-4 (one release cycle):**

- `workflow-pack/agents/` is the source of truth
- `.github/agents/` becomes a **generated mirror** — the build/setup process copies from `workflow-pack/agents/` → `.github/agents/`
- A CI drift check validates the mirror matches the source: `diff -r workflow-pack/agents/ .github/agents/`
- If drift is detected, CI fails with "Regenerate .github/agents/ from workflow-pack/agents/"

**Phase 5 (after one release cycle):**

- Remove `.github/agents/` entirely
- Remove the mirror generation step and drift check

## "full" Profile: Per-Provider Behavior

The `full` profile enables everything in `workflow` plus env-gated optional features:

| Feature              | Claude Code                                                       | Cursor                     | Copilot CLI                           | VS Code                       | OpenCode                                                            | Codex                  |
| -------------------- | ----------------------------------------------------------------- | -------------------------- | ------------------------------------- | ----------------------------- | ------------------------------------------------------------------- | ---------------------- |
| spawn-next-ticket    | **Enabled** (sets `AUTO_SPAWN_NEXT_TICKET=1`)                     | **Enabled**                | **Enabled**                           | **Ignored** (no hook support) | **Ignored** (no hook support)                                       | **Ignored** (MCP-only) |
| auto-review chaining | **Enabled** (Stop hook chains `/extended-review` after `/review`) | **Enabled**                | **Ignored** (no Stop hook equivalent) | **Ignored**                   | **Fallback**: MCP `complete-work` response includes review reminder | **Ignored**            |
| capture-claude-tasks | **Enabled** (TodoWrite hook)                                      | **Ignored** (no TodoWrite) | **Ignored**                           | **Ignored**                   | **Ignored**                                                         | **Ignored**            |

**Behavior when a feature is "Ignored":** The adapter simply does not install the hook/config for that feature. No error, no fallback, no placeholder. The feature is documented as provider-specific in `brain-dump doctor --surface`.

**Behavior when a feature has "Fallback":** The adapter installs an alternative mechanism (e.g., MCP response text instead of hook enforcement) that approximates the behavior without native hook support.

## OpenCode Scope: Intentionally Project-Level

OpenCode workflow-pack installs to `.opencode/brain-dump/` (project-level), NOT user-global. This is intentional:

**Rationale:**

- OpenCode's plugin system is project-scoped by design (`.opencode/plugins/`)
- OpenCode has no hook system — enforcement is via MCP preconditions + AGENTS.md prompt guidance
- Project-level means zero cross-project contamination (no early-exit pattern needed)
- Aligns with OpenCode's philosophy of project isolation

**Trade-off accepted:** Users must run `brain-dump setup --provider opencode --with-workflow` in each project that wants the workflow pack. This is the correct trade-off for a provider that emphasizes project isolation.

**All other providers** install to user-global managed namespaces because their hook systems are global by nature.

## Provider Adapter Plan

| Provider    | Mechanism                                       | Install Location                               | Scope             |
| ----------- | ----------------------------------------------- | ---------------------------------------------- | ----------------- |
| Claude Code | Plugin package (local path in `enabledPlugins`) | `~/.claude/plugins/brain-dump-workflow/`       | User-global       |
| Cursor      | Managed folder + symlinks for auto-discovery    | `~/.cursor/brain-dump/` + symlinks             | User-global       |
| Copilot CLI | Managed folder + hooks.json references          | `~/.copilot/brain-dump/`                       | User-global       |
| VS Code     | Managed folder under copilot area               | `~/.copilot/brain-dump/` (shared with Copilot) | User-global       |
| OpenCode    | Managed folder + plugin references              | `.opencode/brain-dump/`                        | **Project-level** |
| Codex       | MCP-only, no workflow pack                      | N/A                                            | N/A               |

**Claude plugin install**: Local path registered in `enabledPlugins` in `~/.claude/settings.json`. The adapter copies `workflow-pack/` contents into the plugin directory structure, writes the install receipt, then adds the path to `enabledPlugins`. One toggle to enable/disable.

## Config Mutation Policy

Each operation specifies exactly which config files are touched and how:

### `setup` (core install)

| Provider    | Config File                                    | Mutation Type                              | What Changes                                                          |
| ----------- | ---------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------- |
| Claude Code | `~/.claude.json`                               | **Additive** — adds key under `mcpServers` | Adds `"brain-dump"` MCP server entry. Never removes existing entries. |
| Cursor      | `~/.cursor/mcp.json`                           | **Additive** — adds key under `mcpServers` | Adds `"brain-dump"` entry. Creates file if absent.                    |
| Copilot CLI | `~/.copilot/mcp-config.json`                   | **Additive**                               | Adds `"brain-dump"` entry. Creates file if absent.                    |
| VS Code     | OS-specific user profile `mcp.json` (see note) | **Additive**                               | Adds `"brain-dump"` entry. Creates file if absent.                    |
| OpenCode    | `~/.config/opencode/opencode.json`             | **Additive**                               | Adds MCP server entry. Creates file if absent.                        |
| Codex       | `~/.codex/config.toml`                         | **Additive**                               | Appends MCP server block. Creates file if absent.                     |

### `workflow-pack enable`

| Provider    | Config File               | Mutation Type                                 | What Changes                                                                                                                |
| ----------- | ------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `~/.claude/settings.json` | **Additive** — adds to `enabledPlugins` array | Adds plugin path string. Never modifies existing `hooks` entries.                                                           |
| Cursor      | `~/.cursor/hooks.json`    | **Additive** — merges hook entries            | Adds hook entries with managed-root prefix paths (e.g., `~/.cursor/brain-dump/hooks/...`). Never modifies existing entries. |
| Copilot CLI | `~/.copilot/hooks.json`   | **Additive**                                  | Same as Cursor.                                                                                                             |
| VS Code     | N/A                       | **No config mutation**                        | Assets placed in managed folder; no config file edited.                                                                     |
| OpenCode    | `.opencode/opencode.json` | **Additive**                                  | Adds plugin references.                                                                                                     |

### `workflow-pack disable`

| Provider    | Config File               | Mutation Type                                                                      | What Changes                                                                                                                                                                               |
| ----------- | ------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code | `~/.claude/settings.json` | **Removal** — removes from `enabledPlugins` array                                  | Removes the Brain Dump plugin path. Never touches other entries.                                                                                                                           |
| Cursor      | `~/.cursor/hooks.json`    | **Removal** — removes hook entries matched by adapter-resolved managed-root prefix | Removes entries whose `command` starts with the absolute managed-root path resolved at runtime by the adapter (e.g., `/home/user/.cursor/brain-dump/hooks/`). Never touches other entries. |
| Copilot CLI | `~/.copilot/hooks.json`   | **Removal**                                                                        | Same as Cursor.                                                                                                                                                                            |
| VS Code     | N/A                       | **No config mutation**                                                             | Managed folder deleted.                                                                                                                                                                    |
| OpenCode    | `.opencode/opencode.json` | **Removal**                                                                        | Removes Brain Dump plugin references.                                                                                                                                                      |

### `uninstall-legacy`

| Provider      | Config File               | Mutation Type                                                     | What Changes                                                                                                                                                |
| ------------- | ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code   | `~/.claude/settings.json` | **Removal** — removes Brain Dump hook entries from `hooks` object | Removes hook entries matched by managed-root prefix (`brain-dump-workflow/hooks/`) or exact paths from `legacyPaths`. Never touches non-Brain-Dump entries. |
| All providers | Various                   | **Removal** — files only                                          | Removes files per dual-verification (ownership marker + checksum). Never edits config files beyond removing Brain Dump-specific entries.                    |

**VS Code path note**: The VS Code user profile path is OS-specific. The adapter resolves it at runtime:

- Linux: `~/.config/Code/User/mcp.json`
- macOS: `~/Library/Application Support/Code/User/mcp.json`
- Windows: `%APPDATA%\Code\User\mcp.json`

Paths in this document are illustrative (Linux). Adapters use runtime OS detection for actual paths.

### Hook entry identification (strict matching)

When adding/removing hook entries from config files, we do NOT use substring matching on `"brain-dump"`. Instead, hook entries are identified by a **canonical prefix** in the command path:

```json
{
  "type": "command",
  "command": "$HOME/.claude/plugins/brain-dump-workflow/hooks/enforce-state-before-write.sh"
}
```

The identifier is the managed-root path prefix: `brain-dump-workflow/hooks/` (for plugin installs) or the install receipt's recorded paths. Matching rules:

1. **For plugin-based providers (Claude Code)**: Match on `enabledPlugins` entry — one string to find, no ambiguity
2. **For hooks.json-based providers (Cursor, Copilot)**: Match hook entries whose `command` field starts with the adapter-resolved absolute managed-root path (resolved at runtime, e.g., `/home/user/.cursor/brain-dump/hooks/`). This is a prefix match on the full managed namespace, not a substring match on "brain-dump". The managed-root is also recorded in the install receipt for consistent matching across operations.
3. **For legacy cleanup**: Match against exact paths from `legacyPaths` in manifest, never substring

This prevents false positives against unrelated hooks/plugins that might coincidentally contain "brain-dump" in their path.

**Key rule**: Config mutations are always scoped to Brain Dump-identifiable entries via managed-root prefix or exact path matching. We never read-modify-write the entire config — we parse, find Brain Dump entries by known identifiers, and add/remove only those.

## CLI Interface

### Install profiles

```bash
# Core only (default)
brain-dump setup --provider claude

# With workflow
brain-dump setup --provider claude --with-workflow

# Full (workflow + all provider-applicable optionals)
brain-dump setup --provider claude --profile full

# Granular
brain-dump setup --provider claude --with-workflow --without-hooks

# Interactive
brain-dump setup
```

### Profile definitions

- **core**: MCP registration only. Zero global workflow assets.
- **workflow**: core + workflow-pack (hooks, agents, commands, skill — per provider capability)
- **full**: workflow + all env-gated optionals applicable to the provider (see per-provider table above)

### Management

```bash
brain-dump workflow-pack enable --provider claude
brain-dump workflow-pack disable --provider claude
brain-dump workflow-pack uninstall-legacy --provider claude [--confirm]
brain-dump doctor --surface
```

## Idempotency Criteria

Every CLI operation must be safe to re-run without side effects:

### `setup` / `enable` (re-run when already installed)

| Check                                                      | Behavior                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| MCP entry already exists in config                         | **No-op** — skip with message "MCP server already registered"               |
| Plugin path already in `enabledPlugins`                    | **No-op** — skip with message "Workflow pack already enabled"               |
| Managed folder already exists with current-version receipt | **No-op** — skip with message "Workflow pack up to date"                    |
| Managed folder exists with older-version receipt           | **Upgrade** — overwrite files, update receipt, print "Upgraded from X to Y" |
| Hook entries already present in hooks.json                 | **No-op** — skip (matched by managed-root prefix or exact receipt path)     |
| Symlinks already point to correct targets                  | **No-op** — skip                                                            |

**Guarantee**: Running `brain-dump setup --provider claude --with-workflow` twice in a row produces identical filesystem state and identical config content. No duplicate entries, no file corruption.

### `disable` / `uninstall-legacy` (re-run when already removed)

| Check                                  | Behavior                                           |
| -------------------------------------- | -------------------------------------------------- |
| Plugin path not in `enabledPlugins`    | **No-op** — print "Workflow pack not enabled"      |
| Managed folder doesn't exist           | **No-op** — print "No workflow pack installed"     |
| Hook entries not present in hooks.json | **No-op** — skip                                   |
| Legacy files already cleaned           | **No-op** — print "No legacy files found"          |
| No install receipt exists              | **Fall back to `legacyPaths`** — still safe to run |

**Guarantee**: Running `brain-dump workflow-pack disable --provider claude` when already disabled exits cleanly with exit code 0. Running `uninstall-legacy --confirm` when no legacy files exist prints "Nothing to clean up" and exits 0.

### Implementation notes

- All config writes use atomic patterns: read → parse → check → modify → write-to-temp → rename
- File operations use `mv` (atomic rename) not write-in-place to prevent partial writes on crash
- Receipt writes are the last step after all files are placed (crash before receipt = next run detects and retries)

### Exit codes

| Code | Meaning               | When                                                                                                                                                                                                                           |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | Success or no-op      | Operation completed, or already in desired state                                                                                                                                                                               |
| `1`  | Usage/parse error     | Invalid flags, unknown provider, malformed args                                                                                                                                                                                |
| `2`  | Permission error      | Cannot write to config file, managed folder, or managed namespace                                                                                                                                                              |
| `3`  | Receipt version error | Receipt newer than current pack version (downgrade refused)                                                                                                                                                                    |
| `4`  | Partial cleanup       | At least one file passed ownership verification (marker + checksum) and was deleted, but at least one other file was skipped due to checksum mismatch (user-modified). Files that simply don't exist are not counted as skips. |

Automation can rely on: `0` = safe to continue (all matched or nothing to do), non-zero = needs attention. `4` specifically means "some files were cleaned but others need manual review" — the user-modified files are listed in stderr with their paths.

## Phased Rollout

### Phase 0: Save Plan

- Copy this plan verbatim to `plans/simplify-bd-workflow.md` in the project repo

### Phase 1: MCP Hook Absorption

- Add MCP prompts to server
- Add `autoPr` to workflow start-work
- Add MCP self-telemetry instrumentation
- Absorb state recording, pending-link logic into MCP
- **Result**: Hook count drops from ~27 to 6

### Phase 2: Create Workflow Pack

- Create `workflow-pack/` directory structure with manifest + install receipt schema
- Move remaining hooks, agents, commands, skills into it
- Create provider adapter shells
- Set up `.github/agents/` as generated mirror with drift check
- **Result**: Single source of truth for all workflow assets

### Phase 3: Profile-Based Install + Adapters

- Implement `brain-dump setup` with `--provider` and `--profile`
- Implement provider adapters (Claude plugin, Cursor symlinks, etc.)
- Implement `brain-dump workflow-pack enable/disable`
- Install receipt written on every install (checksums + paths)
- Keep old `scripts/setup-*.sh` functional but deprecated
- **Result**: New users get clean install

### Phase 4: Legacy Cleanup

- Implement `brain-dump workflow-pack uninstall-legacy`
  - Uses install receipt checksums when available
  - Falls back to `manifest.json` `legacyPaths` with expected checksums for pre-receipt installs
  - Skips files with checksum mismatch (user-modified) with warning
- Implement `brain-dump doctor --surface`
- Dry-run by default, `--confirm` to delete
- **Result**: Existing users can migrate safely

### Phase 5: Remove Legacy Paths

- Remove `scripts/setup-claude-code.sh` and other legacy setup scripts
- Remove `.github/agents/` mirror + drift check
- Remove TanStack skills from any global install path
- Update CLAUDE.md and documentation
- **Result**: Clean codebase

## Acceptance Criteria

1. Default install writes zero global workflow assets (MCP config entry is the only global touch)
2. Claude workflow assets are plugin-scoped, not scattered in `~/.claude/*`
3. MCP prompt endpoints available and used as canonical workflow guidance
4. Telemetry no longer depends on global per-tool-call hook scripts
5. `doctor --surface` and `uninstall-legacy` are available and reliable
6. `uninstall-legacy` never removes non-Brain-Dump files (ownership manifest + checksum verification)
7. Non-Brain-Dump projects with workflow-pack enabled have bounded overhead (hooks early-exit)
8. End-to-end Ralph workflow (start-work → implement → review → demo) works with workflow-pack enabled
9. `.github/agents/` stays as generated mirror for one release cycle before removal

## Assumptions

1. "Zero global workflow assets" means zero hooks/agents/skills/commands files; MCP config entry is explicitly allowed
2. Provider capability differences are expected; adapters handle translation
3. OpenCode is intentionally project-scoped; all others are user-global
4. Codex remains MCP-first; workflow-pack experimental unless native support improves
5. Legacy scripts stay functional for one release cycle before removal
6. `.github/agents/` mirror maintained for one release cycle for backwards compatibility

## Key Files to Modify

- `mcp-server/index.ts` — prompt registrations, self-telemetry wrapper
- `mcp-server/tools/workflow.ts` + `core/workflow.ts` — `autoPr` param
- `mcp-server/lib/telemetry-self-log.ts` — enhanced self-telemetry
- `cli/` — `setup`, `workflow-pack`, `doctor --surface` commands
- `workflow-pack/` — new directory (source of truth)
- `workflow-pack/manifest.json` — ownership manifest with checksums
- `workflow-pack/providers/claude/adapter.sh` — plugin installation + receipt writing
- `workflow-pack/providers/claude/plugin.json` — plugin manifest

## Verification

- `brain-dump setup --provider claude` → only MCP registered, `doctor --surface` shows 0 workflow files
- `brain-dump setup --provider claude --with-workflow` → plugin installed, receipt written
- `brain-dump workflow-pack enable --provider claude` → all hooks/agents/commands active
- `brain-dump workflow-pack disable --provider claude` → plugin removed, zero overhead
- `brain-dump workflow-pack uninstall-legacy --provider claude` → detects old files, verifies checksums, safe cleanup
- `brain-dump setup --provider opencode --with-workflow` → installs to `.opencode/brain-dump/` (project-level)
- `brain-dump setup --provider claude --profile full` → workflow + spawn-next-ticket + auto-review chaining + capture-claude-tasks enabled
- `brain-dump setup --provider codex` → MCP-only, doctor confirms no workflow pack
- `pnpm check` passes throughout
- MCP prompts return workflow/review instructions correctly
- Self-telemetry captures tool calls without external hooks
- `.github/agents/` drift check passes in CI
