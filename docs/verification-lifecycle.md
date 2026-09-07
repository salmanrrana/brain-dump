# Verification Lifecycle Interface

Brain Dump verification has one durable settlement seam: `settleVerificationLifecycle` in `core/verification/lifecycle.ts`. This verification lifecycle keeps adapters thin and auditable.

Adapters must not write verification run rows, evidence attachments, verification report comments, verification job settlement, PRD completion state, or ticket status transitions directly. CLI commands, queue workers, MCP tools, and server functions run verification through `verifyTicket` or read verification state through read-only queue/run APIs.

## Invariants

- Certified pass writes the run, attaches evidence, posts one `verification_report`, marks the ticket `done`, syncs PRD state, settles the verification job as `succeeded`, and runs epic completion hooks.
- Assertion failure writes the run and evidence, files verification findings, resets failed demo steps, returns the ticket to `in_progress`, keeps PRD `passes=false`, and settles the job as `failed`.
- Three consecutive assertion failures on the same step stop automatic execution, return the ticket to blocked `in_progress`, and settle the job as `blocked`.
- Exhausted `infra_error` and repeated/unsafe `uncertified` outcomes write the audit trail, return the ticket to blocked `in_progress` with a visible reason, and settle the job as `blocked`. Retryable infrastructure failures remain in `ai_verification` only while an automatic retry is scheduled.
- Startup reconciliation recreates a missing runner job when an `ai_verification` ticket still has a demo. Terminal or malformed handoffs leave `ai_verification` and become blocked `in_progress` tickets for human action.
- Worker lease settlement goes through the lifecycle using the trusted `verificationJobLease`; manual/debug runs settle the current ticket job through the same path.
- A running worker heartbeats its owned lease. The long-lived app supervisor only launches a recovery drain for queued work that is ready or a running lease that has expired.
- Before executing a demo, the runner checks the project HEAD against the ticket branch revision and the reviewed-through commit (when recorded). Reviewed revisions require a clean worktree as well. A mismatch is an infrastructure error; the runner never switches the user's checkout. The existing before/after worktree seal also catches changes during execution.
- Readiness requests and API response bodies have cancellation deadlines. A stalled server cannot retain a verification lease indefinitely just by accepting a connection.
- Self-booted apps receive private HOME, USERPROFILE, APPDATA, LOCALAPPDATA, and XDG directories under the run's `app-data/` directory. Brain Dump starts with a fresh database there; it does not reuse or copy daily-driver data. Other apps must configure their verification-only storage using `BRAIN_DUMP_VERIFY_DATA_DIR`. Dotenv files in the project/boot directory cause a fail-closed boot error (example/sample/template files are excluded).
- These directories are data isolation, not an OS security sandbox: arbitrary project code can still access absolute paths or external services. Boot only trusted, stateless fixtures or explicitly configured test services. An explicit `--base-url` is caller-owned and does not acquire this isolation; never point mutating demos at a live app.
- Command assertions evaluate complete captured output. Evidence storage remains capped and redacted independently of assertion evaluation.
- A fresh demo supersedes the scoped PRD's prior `verificationFailures` prompt payload; durable historical runs, findings, comments, and attachments are retained.
- `generate-demo` rejects `coverageRationale` outright: a rationale can never certify, so the contradiction surfaces in `ai_review` instead of ambushing the agent after a green run. Commands outside the default demo allowlist become executable by declaring exact argv templates in the project's `.brain-dump/verify.json` `commands` array (or `package.json` `brainDump.verify.commands`); declared templates skip only the binary allowlist, never the structural spawn-safety checks.
- A verification failure that returns a ticket to `in_progress` must hand the repair to a consumer. Enqueueing an epic continuation first settles any `running` continuation row whose target ticket is already `done` (an orphaned lease must not veto newer repairs), and when an active autonomous launch exists but no continuation could be installed for the failed ticket, a visible "no autonomous resumer scheduled" comment is posted instead of stalling silently.

## Allowed Crossings

- `cli/commands/verify.ts` may call `verifyTicket`, `runNextVerificationJob`, and read-only status/history functions.
- `core/verification/worker.ts` may claim jobs and call `verifyTicket`; it may not apply pass/fail status transitions itself.
- UI/API/MCP surfaces may read verification runs, evidence, and job state. They must not expose write/pass/fail capabilities to implementing agents.
