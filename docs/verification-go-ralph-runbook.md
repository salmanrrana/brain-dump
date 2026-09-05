# Testing the quality workflow with a Go project

This exercise uses FREADY: a Go application at the repository root and a React/Vite frontend in `web/`. The feature is a Purchasing Power worksheet with a stateless Go calculation API. Its three tickets cover boot discovery, the API, and the responsive page. This tests a real mixed-stack project; it does not certify every language or provider.

## What the agent needs

- The target repository and desired feature, plus permission to create a disposable checkout and private test data.
- Go matching `go.mod` (FREADY declares 1.25.5), a C compiler for SQLite, Make, Bash, Node, pnpm, Python, curl and jq.
- Installed project dependencies and the Playwright Chromium binary/system dependencies. Discover scripts from the target's docs/config; FREADY has no root JavaScript package.
- An installed, authenticated Pi CLI with the requested model available. This run uses `openai-codex/gpt-6-astra`. Keep provider authentication separate from the app's private HOME.
- A supported terminal for a visible Ralph launch. The Linux exercise uses `xterm` with a working display.

No financial API keys, accounts, external financial feeds or production database are needed for this feature. Use the project's existing synthetic macro fixtures.

## Isolation and startup

Use separate Brain Dump and FREADY checkouts. Point the Brain Dump CLI wrapper and app server at the same private database by setting private HOME, XDG data/state/config/cache directories. Do not use a preconfigured MCP connection that points to a daily-driver database. Set `PI_CODING_AGENT_DIR` explicitly when Pi authentication lives outside that private HOME; never copy or print the credentials.

Install dependencies inside the checkouts. Remove copied dotenv files rather than allowing a framework to load real credentials. The verification worker also provides private HOME/platform/XDG storage and `BRAIN_DUMP_VERIFY_DATA_DIR` to the booted app. This is storage separation, not an operating-system security sandbox: project code must still use fixtures and test services.

FREADY's project contract lives in `.brain-dump/verify.json`:

```json
{
  "start": [
    "./scripts/start-macro-verification.sh",
    "--prebuilt",
    "--scenario",
    "healthy",
    "--frontend-host",
    "{host}",
    "--frontend-port",
    "{port}"
  ],
  "commands": [
    ["make", "build"],
    ["make", "test"],
    ["make", "vet"],
    ["make", "test-purchasing-power"],
    ["pnpm", "--dir", "web", "test"],
    ["pnpm", "--dir", "web", "exec", "tsc", "--noEmit"],
    ["pnpm", "--dir", "web", "run", "build"],
    ["./scripts/test-macro-verification-launcher.sh"]
  ]
}
```

This is an illustrative subset: preserve existing declared commands. Build the actual Go binary **before demo handoff**. The worker boots the app before executing command steps, and a cold Go compile can exceed the boot deadline. A declared `make build` step alone does not prepare an earlier boot. The launcher starts both services, uses available ports and a same-origin API proxy, confirms readiness, reports early exits, and cleans up both child processes.

## Prompt and ticket shape

Give Ralph a feature brief with explicit repository structure, feature behavior, native validation commands, test-only data requirements, and the independent verification handoff. Split the work into ordered tickets:

1. Discover and declare portable boot and validation commands. Prove the real Go service and existing React page start without real keys.
2. Implement a stateless `GET /api/purchasing-power?amount=&annualRate=&years=` API. Test arithmetic, bounds, malformed/duplicate parameters, zero and negative rates, and method rejection through the actual HTTP middleware.
3. Build the page using the actual API. Verify labeled inputs, explicit Calculate, distinct future cost/cash buying power, validation/loading/error/retry, annual detail, desktop/mobile navigation, and screenshots.

For a deterministic check, $1,000 at 10% for two years displays $1,210.00 future cost and $826.45 buying power. Use numeric tolerance in Go tests; use exact typed JSON assertions only for values that are exactly represented by the response. See [API assertions](verification-json-assertions.md) and [responsive browser evidence](verification-browser-evidence.md).

Launch the registered epic through the isolated CLI:

```sh
brain-dump workflow launch-epic --epic EPIC_ID \
  --provider pi --model openai-codex/gpt-6-astra \
  --terminal xterm --max-iterations 12
```

## What to observe

Each ticket must go through implementation → test report → commit/link → AI review → executable demo → independent verification. Only the runner moves a certified ticket to `done`. Watch the live board, ticket comments/session progress, verification history and `plans/prd.json`; a completed implementation session alone is not a completed ticket.

A failed check must preserve evidence, reopen implementation, retain `passes: false`, and trigger a repair/review/demo pass. Check that the next successful run refers to the clean reviewed commit and has valid evidence integrity. Inspect screenshots visually as well as checking that the PNG files exist. Keep the failed run too.

For the board, exercise an external CLI status update without refreshing, a failed background request while a draft is open, and recovery without lost edits or hidden cached columns. Provider detection must settle even when a CLI shim loops or ignores SIGTERM. Test the actual model picker.

## Repeatable Brain Dump checks

```sh
pnpm check
pnpm test:ui
BRAIN_DUMP_UQW_KEEP_ARTIFACTS=1 pnpm test:verification-cli
```

Run `pnpm build` in the disposable Brain Dump checkout for route/client/server changes. `e2e/hydration.spec.ts` checks board/list hydration and redundant fetches against a development server; the normal Playwright configuration creates isolated app data. The CLI integration test exercises real Git, HTTP, browser assertions, failure/repair, screenshot dimensions and signed verification evidence.

The agent should start the services, read runtime output, send HTTP requests, inspect screenshots and summarize the results. The user does not need to collect logs.
