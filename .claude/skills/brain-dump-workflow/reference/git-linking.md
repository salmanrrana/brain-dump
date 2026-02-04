# Git Linking

How to link commits and PRs to tickets using the consolidated `workflow` tool.

## Linking a Commit

After committing code, call the **workflow** tool:

```
action: "link-commit"
ticketId: "<ticket-id>"
commitHash: "<full-or-short-hash>"
commitMessage: "optional commit message"
```

If `commitMessage` is omitted, it is auto-fetched from git.

Multiple commits can be linked to a single ticket.

## Linking a PR

After creating a PR with `gh pr create`, call the **workflow** tool:

```
action: "link-pr"
ticketId: "<ticket-id>"
prNumber: 123
prUrl: "https://github.com/org/repo/pull/123"   # optional, auto-generated
prStatus: "open"                                  # draft | open | merged | closed
```

When a PR is linked, Brain Dump automatically syncs PR statuses for all tickets
in the project, updating any PRs that have been merged or closed.

## Syncing All Links

To auto-discover and link commits and PRs for the active ticket, call the
**workflow** tool:

```
action: "sync-links"
projectPath: "/path/to/project"   # optional, defaults to cwd
```

This tool:

1. Finds the active ticket from Ralph state or branch name
2. Queries `git log` for commits on the current branch
3. Links any commits not already linked
4. Queries GitHub for PRs on the current branch
5. Links any PR not already linked

Use `sync-links` after making commits, at the start of a session, or before
completing work to ensure all commits and PRs are recorded.

## Hook Integration

The `link-commit-to-ticket.sh` PostToolUse hook runs after every `git commit`
and outputs a reminder to call `workflow` with `action: "sync-links"`.

The `create-pr-on-ticket-start.sh` PostToolUse hook runs after `workflow`
`action: "start-work"` and automatically creates a draft PR, then suggests
calling `workflow` with `action: "link-pr"`.
