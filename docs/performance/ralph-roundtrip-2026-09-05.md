# Ralph command and closeout overhead — September 5, 2026

Follow-up to the [history audit](ralph-history-audit-2026-09-05.md). The WorkoutDeck
trace contained 212 workflow shell calls, including 23 findings reads alongside
nine review-context reads, plus 63 validation calls. This change reduces the cost
of those calls and removes instructions that encourage repeated discovery.

## Changes

- CLI dispatch loads only the selected command. Help, unknown-command recovery,
  and help for a resource load no command handler or database module. A missing
  unrelated provider/command dependency can no longer break ticket reads or help.
- Frequent project, ticket, session, comment, review and workflow commands import
  their core owners directly. Provider launch modules and Drizzle load only for
  actual launch actions; ordinary start/complete-work calls avoid that graph.
- Review context derives completion from the findings already read, rather than
  rereading the ticket and every finding. Standalone check-complete selects only
  severity/status. Every new request still reads current state: no cross-request
  cache, stale gate, omitted finding or weakened certification check is introduced.
- Shared provider instructions reuse review-context fields and session IDs,
  discover boot/validation commands once until their inputs change, batch safe
  independent work, keep repair reviews scoped to affected behavior, and stop
  after a successful demo handoff. Required final validation and check-complete
  remain mandatory. Reused results must never be described as newly run tests.
- Resuming AI review now asks for the full review packet instead of a redundant
  standalone findings fetch that lacks the repair scope and work history.

## Measurements

Seven fresh CLI subprocesses per command after one warm-up, using the same private
fixture/database and `node --import tsx cli/brain-dump.ts`. Values are medians.
This excludes shell-tool/model scheduling and any external `npx` launcher overhead.

| Command                   |    Before |     After | Reduction |
| ------------------------- | --------: | --------: | --------: |
| help                      | 802.80 ms | 150.94 ms |       81% |
| review get-review-context | 814.24 ms | 269.96 ms |       67% |
| review check-complete     | 822.16 ms | 269.70 ms |       67% |
| ticket get                | 948.20 ms | 196.22 ms |       79% |
| session get               | 833.12 ms | 191.04 ms |       77% |

A separate in-process fixture with 2,000 historical findings measured:

| Core call        |   Before |   After |
| ---------------- | -------: | ------: |
| getReviewContext | 12.44 ms | 6.92 ms |
| checkComplete    |  4.88 ms | 0.94 ms |

The large-history fixture stresses repeated row/description loading; a typical
small ticket saves less query time. Historical calls may have been necessary
after intervening edits, so their count is not a guaranteed number of removable
round trips. Prompt changes guide future runs; a lower model/tool-call count and
a new end-to-end feature-delivery target have not been established here.

## Reproduction and regression coverage

`cli/__tests__/startup.test.ts` makes unrelated command modules unavailable through
an ESM loader and checks top-level/resource help plus an actual ticket read.
Before the fix it fails while loading an unrelated command; afterward it passes.
`core/__tests__/review-performance.test.ts` enforces one findings read per review
packet and proves a subsequent repair immediately updates the gate/context.
Both tests first reproduced their respective failures.

The real CLI integration runs Git, status changes, sessions, review gates, a
server, browser steps, deliberate verification failure, repair and certification.
The existing CLI routing and provider launch tests cover command compatibility
and provider/model argument forwarding. The required `pnpm check` remains the
completion gate. Build output is produced only in a disposable checkout.

Scripts, raw timing samples, validation logs and final review are retained outside
this repo in `brain-dump-verification-runs/2026-09-05-ralph-roundtrip/`.
