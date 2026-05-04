---
name: brain-dump-ticket-selection
description: Pick the next Brain Dump ticket using the CLI. Use when the user asks what to work on next, which ticket is best, or to begin a ticket from the backlog.
---

# Brain Dump Ticket Selection

Use Brain Dump CLI output to recommend the next ticket.

## Workflow

1. Confirm Brain Dump is available:

```bash
brain-dump doctor
```

2. Inspect project status:

```bash
brain-dump status --pretty
brain-dump ticket list --pretty
```

3. If needed, inspect a specific ticket in more detail:

```bash
brain-dump context --ticket <ticket-id> --pretty
```

## Recommendation criteria

Prioritize:

1. Tickets already in `ready`
2. Higher priority tickets
3. Foundational tickets that unblock others
4. Tickets related to current repo changes or current epic focus
5. Smaller tickets if the user wants a quick win

## Response format

When asked “what next?”, provide:

- Top 3 recommendations
- 1 short reason for each
- A clear preferred choice

## Starting the chosen ticket

Once a ticket is selected, run:

```bash
brain-dump workflow start-work --ticket <ticket-id> --pretty
brain-dump context --ticket <ticket-id> --pretty
```

Then proceed with implementation.
