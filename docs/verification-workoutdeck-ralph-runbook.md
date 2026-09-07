# Testing the quality workflow with WorkoutDeck

WorkoutDeck is an iPad workout companion built with Next.js 16, React 19,
Prisma 7 and PostgreSQL. This exercise implements saved interval routines in
three ordered tickets: disposable database startup, persistence API, and timer
UI. It exercises Claude Code with `claude-sonnet-4-6`, complementing the
[Go/Pi exercise](verification-go-ralph-runbook.md).

## Prerequisites and isolation

- Node and pnpm matching the checkout, installed dependencies and a generated
  Prisma client (`pnpm exec prisma generate`). Discover commands from current
  package/config files; WorkoutDeck's old specification describes a different stack.
- Docker, the cached `postgres:17-alpine` image, and permission to create/remove
  only uniquely named test containers. Publish database ports on loopback only.
- Playwright Chromium and its system libraries; an installed, authenticated
  Claude Code CLI and a supported visible terminal (`xterm` for this Linux run).
- Disposable Brain Dump and WorkoutDeck checkouts, plus private HOME and XDG
  data/state/config/cache directories. Preserve original uncommitted work in
  the disposable baseline. Never copy project dotenv files or use a live database.

Point the private Brain Dump CLI, MCP configuration and app observer at the
same private database. Use a private Claude config directory with only the
required authentication reference, workflow hooks and strict private MCP
configuration. Do not use an existing connector pointed at daily-driver data.
The Claude hook uses `brain-dump telemetry parse-transcript`; it no longer
needs a separately copied TypeScript parser or an on-demand package download.

## Project contract

The verification launcher must own its PostgreSQL container, migrations,
synthetic seed and Next.js child process group. Ignore incoming database URLs,
bound Docker and PostgreSQL operations, handle early exits, and remove the
owned resources on shutdown. Test both concurrent startup and a Docker stub
that ignores SIGTERM: a nominal timeout that waits forever on termination
does not satisfy the contract.

Use `.brain-dump/verify.json` to declare the existing start command with
`{host}` and `{port}` placeholders and exact allowed validation arguments.
Prepare dependencies before handoff: worker boot precedes command demo steps.
Native validation for this checkout is `pnpm test`, `pnpm lint`,
`pnpm type-check`, and `pnpm build`. Use separate Next output directories for
development and production builds.

## Feature and handoff

1. Boot the real app and disposable PostgreSQL without supplied credentials.
   Seed only Recovery 45/15 (45 seconds work, 15 rest, four rounds), prove empty
   workout history, and capture the existing timer.
2. Add typed GET/POST/DELETE timer-preset endpoints. Validate names and integer
   ranges, preserve workout-log references, use deterministic ordering, and
   reject unsupported stored routines rather than silently truncating them.
3. Add save/load/delete with inline cancellation, persistence after reload,
   usable error/retry states and protection for active or paused timers.
   Retain built-ins and the existing large timer design. Verify Mobility 35/15
   at 35 work seconds, 15 rest seconds and five rounds, including iPad 1180×820
   and phone 390×844 screenshots.

Launch through the private CLI:

```sh
brain-dump workflow launch-epic --epic EPIC_ID \
  --provider claude-code --model claude-sonnet-4-6 \
  --terminal xterm --max-iterations 12
```

Watch the live board, session state, comments, test reports, review findings,
demo steps, verification history and scoped PRD. Only the independent runner
certifies Done. A failed assertion must preserve evidence and return the ticket
to implementation; a repair must pass review and a new executable demo.
Keep temporary CLI demo JSON outside the repository or intentionally commit it
before review. An untracked handoff file correctly fails the clean-tree guard.

The terminal loop and background repair must share one epic owner. Generated
scripts use the owning checkout's explicit Node/CLI entrypoint, so this guard
does not depend on a global CLI link. The supervisor registers a process group
before allowing it to start, retains exclusion while an orphaned group is alive,
and enforces its own execution deadline. An idle terminal left open after Ralph
stops must hold no ownership. Exercise a competing continuation, supervisor
death, a child that ignores termination, and inherited supervisor environment
variables; none may start a second agent against the checkout.

Use typed [API assertions](verification-json-assertions.md), including `$[0].name`
for a list response, and inspect actual screenshots rather than just file
existence. Record supplemental lifecycle/failure probes separately from sealed
worker evidence. Check Claude authorship and token attribution across ticket
transitions; transcript estimates are not subscription charges. Multiple
content blocks and repeated Stop captures must not double-count usage.

To test production recovery, disable direct worker dispatch only in the
private handoff process while keeping the private production observer enabled.
Confirm that it picks up the queued run, then restore normal dispatch. Build
Brain Dump in the disposable checkout so the daily-driver output stays intact.
Run `pnpm check`, focused tests, `pnpm build` and the real
`pnpm test:verification-cli` integration. Preserve failed and passed evidence,
review output, exact commits and a feature Git bundle outside temporary storage.

This exercise verifies one provider and one additional stack on Linux. It does
not certify every project, provider, deployment environment or operating system.

## Elapsed time and avoiding repeated work

The successful independent runs took 31.170 seconds (startup), 6.395 seconds
(API), and 23.837 seconds (UI). The failed UI run took 95.130 seconds, including
70 seconds waiting on guessed selectors and dependent assertions. These are
verification times, not end-to-end feature delivery times. Implementation,
repair and repeated parent review dominated the overall run.

A reviewed-source mismatch now reports a blocked repair immediately instead of
waiting 30 seconds to repeat the same check against an unchanged checkout.
Transient boot failures retain bounded retries. Launcher runtime messages go
outside the checkout when `plans/progress.txt` is tracked, preventing the
launcher itself from invalidating verification. One epic owner prevents two
agents from spending time on the same repair.

For focused Brain Dump checks, use `pnpm exec vitest run --project node FILE`.
The old documented `pnpm test -- FILE` passes a literal `--` to Vitest and runs
the whole node suite. Run the required full `pnpm check` once on the final
patch; do not repeat broad checks during every local repair. Freeze the scope
before final review and rerun only checks affected by accepted fixes.
