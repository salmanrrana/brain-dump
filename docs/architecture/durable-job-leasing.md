# Durable Job Leasing

Brain Dump queue workers must claim durable jobs through `core/durable-job-lease.ts` instead of duplicating lease SQL in adapters or feature modules. The helper owns the atomic select/update pattern for queued, retryable, and expired running jobs.

Current leased queues:

- `verification_jobs` uses the shared helper through `core/verification-queue.ts` for claim and settle operations.

Focused epic review runs intentionally remain separate for now. `epic_review_run_tickets` records an ordered set of tickets and per-ticket review summaries, but no autonomous worker leases those rows and the schema has no attempt, lease, retry, or dead-letter columns. If epic review gains worker execution, it should add the durable job columns and route claim/settle through `core/durable-job-lease.ts` rather than copying verification queue SQL.
