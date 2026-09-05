# Ralph elapsed-time audit — September 5, 2026

The available history contains 866 distinct Ralph sessions and 211 verification
runs. This audit read 15 current, backup and isolated-exercise SQLite databases
with `mode=ro`, deduplicating by ID and preferring current records. It covers
February 13 through September 5, 2026, including the Go/Pi and WorkoutDeck/Claude
exercises. Existing tickets and databases were not modified.

## Findings from the complete available history

| Observation                                           | Evidence                                                                                                                                   | Implication                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Work continues after a known failure                  | 46 verification runs spent another 1,058.259 seconds combined after the first failed step; median 16.19s, p90 46.63s                       | Stop ordered demos on the first failure; retain evidence and explicitly mark later steps not run                           |
| Some failures cascade for minutes                     | A WorkoutDeck/OpenCode run lasted 152.727s, with 149.459s after an API failure; a FREADY/Claude run spent another 87.702s after failure    | A failed prerequisite should not trigger dependent browser waits or mutations                                              |
| Repeated handoff failures consume whole repair rounds | Six inspected tickets needed 5–7 runs; causes included boot exits, changed runtime files, guessed selectors, and exact passing-test counts | Repair the specific cause, use stable assertions and clean disposable runtime storage                                      |
| Session wall time is much larger than verifier time   | 853 completed sessions within 0–24h: median 10m11s, p90 37m26s                                                                             | Verification speed alone does not establish fast feature delivery                                                          |
| Closeout consumes substantial recorded time           | Phase intervals totaled about 110h reviewing, 90h committing, 86h testing, and 77h implementing                                            | Keep repairs scoped; reuse context and batch independent checks rather than repeatedly reviewing/testing the whole feature |
| Provider metadata is incomplete                       | Only 328 of those 853 sessions could be matched unambiguously to nearby telemetry by ticket and start time                                 | Do not rank providers from this sample or treat unmatched sessions as a particular model                                   |

There are 864 completed session records, two unfinished records, and eleven
completed records with negative or over-24h durations excluded from latency
percentiles. SQLite timestamps without offsets are treated as UTC. Phase times
are recorded wall-clock intervals, not CPU/model time; abandoned work, human
pauses, delayed state updates and overlapping sessions can inflate them.

Verification outcomes were 99 passed, 58 failed, 34 infrastructure errors and
20 uncertified. This includes deliberate fault injection, historical versions
and manual reruns: it is not a production success-rate estimate. Failure text
classified 18 runs with runtime changes, four source mismatches, one other dirty
source failure, sixteen timeouts, five coverage issues, and one missing automation
spec; remaining nonpasses require the detailed evidence rather than a guessed
single cause.

## Changes made from this audit

1. **Stop an ordered demo at the first failed step.** Later steps retain explicit
   skipped verdicts with the failed prerequisite's number. A repaired run must
   execute every step before it can certify. No gate is converted to a pass.
2. **Stop dependent UI work immediately.** Failed navigation/actions no longer
   incur additional assertion waits or screenshot-framing waits. Preserve the
   failure screenshot. Stop checking assertions after the first failed assertion. Capture browser
   request errors during that check to preserve connectivity repair guidance;
   optional background request failures do not fail otherwise successful checks.
3. **Do not replay executed steps after an exception.** Previously the boot retry
   loop enclosed the whole demo, so a later request timeout could repeat prior
   commands and POSTs. Preserve completed evidence and the actual failing step,
   record its duration, and settle the execution error as non-retryable. It remains
   blocked for explicit repair, since a timed-out mutation may have taken effect.
   Startup failures before execution retain the existing bounded retry behavior.
4. **Cancel a losing readiness wait.** When the boot process exits early, abort its
   pending readiness request and polling timer. The worker should not remain alive
   until the original readiness deadline after already reporting failure.
5. **Avoid brittle generated checks.** Shared provider instructions now discourage
   exact passing-test counts and incidental UI counts; use exit status, stable
   results and explicit seeded acceptance data.

## Measurements and proof

| Same-path probe                                    | Before                                        | After                                                     |
| -------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------- |
| Failed first API step followed by a 500ms mutation | 609ms; later mutation ran once                | 149ms in the focused batch; later mutation never ran      |
| Successful POST followed by stalled request        | Earlier POST executed twice                   | Earlier POST executed once; evidence and timeout retained |
| Node server immediately exits; readiness budget 3s | Run settled at 116ms; process idle at 3,107ms | Run settled at 115ms; process idle at 124ms               |

These are controlled probes, not an end-to-end model speed claim. The historical
1,058 seconds after first failures is identifiable avoidable work, not a measured
replay of every old run under the new code.

The fast regression command is:

```sh
pnpm exec vitest run --project node core/__tests__/verification-performance.test.ts
```

The surrounding verification suite also checks clean-source guards, blocking,
review findings, redaction, evidence integrity and successful repair. A mocked
browser seam proves that a failed action still produces a screenshot without
executing dependent assertions; the real CLI integration exercises browser
failure → repair → certification.

## Remaining opportunities and operating limits

- The WorkoutDeck Claude trace contained 443 tool calls, including 212 shell
  calls containing workflow work and 63 containing validation. Observed tool
  response intervals totaled about 8.8 minutes, while recorded session windows
  totaled 61.7 minutes. Those are different measurements with incomplete overlap:
  the remainder cannot all be attributed to model inference. It includes agent
  deliberation, orchestration and pauses.
- Reuse the review-context response and keep phase updates meaningful. Batch
  independent reads/checks into one turn where practical; avoid repeated help,
  findings and ticket fetches when the result has not changed. Do not suppress
  required review findings or status updates to make counts look better.
- Keep one required full final check on a frozen patch, plus focused checks for
  repairs. Review the current repair scope instead of reopening unchanged code.
  The previous exercise's repeated parent reviews materially extended delivery;
  this audit does not excuse that cost or count it as successful automation.
- Preserve explicit execution deadlines, but do not blindly shorten them based
  on stale state timestamps. The older unfinished sessions are not proof that
  a provider process is still running. Better start/end provenance is needed
  before adaptive per-provider budgets would be reliable.
- A successful fresh small epic on each provider is still needed to establish a
  sustainable end-to-end delivery target. No extra feature was launched merely
  to manufacture a faster headline during this audit.

Raw indexes, read-only audit script, repeated-run traces, timing probes and test
logs are archived beside the earlier exercises in
`brain-dump-verification-runs/2026-09-05-ralph-performance-audit/` outside this repo.
