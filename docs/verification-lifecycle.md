# Verification Lifecycle Interface

Brain Dump verification has one durable settlement seam: `settleVerificationLifecycle` in `core/verification-lifecycle.ts`. This verification lifecycle keeps adapters thin and auditable.

Adapters must not write verification run rows, evidence attachments, verification report comments, verification job settlement, PRD completion state, or ticket status transitions directly. CLI commands, queue workers, MCP tools, and server functions run verification through `verifyTicket` or read verification state through read-only queue/run APIs.

## Invariants

- Certified pass writes the run, attaches evidence, posts one `verification_report`, marks the ticket `done`, syncs PRD state, settles the verification job as `succeeded`, and runs epic completion hooks.
- Assertion failure writes the run and evidence, files verification findings, resets failed demo steps, returns the ticket to `in_progress`, keeps PRD `passes=false`, and settles the job as `failed`.
- Three consecutive assertion failures on the same step keep the ticket in `ai_verification`, block it loudly, and settle the job as `blocked`.
- `infra_error` and `uncertified` outcomes write the audit trail, leave the ticket in `ai_verification`, block it with a visible reason, and settle the job as `blocked`.
- Worker lease settlement goes through the lifecycle using the trusted `verificationJobLease`; manual/debug runs settle the current ticket job through the same path.

## Allowed Crossings

- `cli/commands/verify.ts` may call `verifyTicket`, `runNextVerificationJob`, and read-only status/history functions.
- `core/verification-worker.ts` may claim jobs and call `verifyTicket`; it may not apply pass/fail status transitions itself.
- UI/API/MCP surfaces may read verification runs, evidence, and job state. They must not expose write/pass/fail capabilities to implementing agents.
