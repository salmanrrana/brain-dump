# Architecture Review — 2026-08-23

Deepening opportunities surfaced from commit-history hot spots (verification, review scope, workflow handoffs). Vocabulary: **module**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality**.

> Status: #1 completed — `core/verification/` module with a curated `index.ts` interface; adapters import only from it.

## 1 · Collapse the Verification lifecycle knot

**Strength:** Strong · **Dependency category:** in-process

**Files:** `core/verification.ts` (2,272) · `core/verification-lifecycle.ts` (970) · `core/verification-ops.ts` (939) · `core/verification-worker.ts` (637) · `core/verification-queue.ts` (440) · `core/verification-messages.ts` (15)

**Problem.** Six modules with a verification ↔ lifecycle import cycle and ~86 exports; every adapter (MCP review tool, two API routes) must reach into four or more of them to do one job.

**Solution.** Deepen into one Verification module whose interface is the lifecycle verbs (`enqueue → run → settle → return-for-human → job status`); the six files become its implementation behind a single seam.

**Wins**

- locality: the cycle stops being everyone's problem
- interface shrinks from ~86 exports to ~6 verbs
- tests hit one interface, not six files
- adapters stop importing internals

## 2 · One launch interface instead of eight provider clones

**Strength:** Strong · **Dependency category:** local-substitutable

**Files:** `src/api/terminal.ts` (2,146) · `src/lib/ui-launch-dispatcher.ts` · `TicketModal` / `EditTicketModal` / `EpicModal` / `EpicDetailHeader` ×2 / `AppLayout` / `MobileSidebar` / `ticket.$id.tsx`

**Problem.** Eight `launch*InTerminal` server functions repeat the same skeleton (verify path → install check → resolve terminal → spawn), differing only in provider specifics; the dispatcher's dependencies interface names all eight, and eight components each re-wire them by hand.

**Solution.** One launch module keyed by the provider catalog that already exists in `core/providers.ts`; provider differences become data inside the implementation.

**Wins**

- leverage: one interface, N providers
- new provider = catalog entry, not nine edits
- per-provider test suites become one matrix
- components delete their hand-wired adapters

## 3 · Assemble the Ticket briefing once

**Strength:** Worth exploring · **Dependency category:** in-process

**Files:** `src/api/context.ts` (`getTicketContext`/`getEpicContext`) · `mcp-server/tools/workflow.ts` (`handleStartWork`) · `cli/commands/context.ts`

**Problem.** Each adapter hand-assembles its own ticket briefing from raw rows — description, criteria, comments, attachments, epic — so a change to what a launch context must contain lands in three places.

**Solution.** A core briefing module returns the structured packet once; adapters only render or transport it.

**Wins**

- locality: briefing content changes land once
- two adapters prove the seam is real
- packet tests replace string-matching three outputs

## Top recommendation

**#1 — Collapse the Verification lifecycle knot.** It's the hottest path by commit history, the only candidate with an actual import cycle, and the payoff is exact: one interface of lifecycle verbs where today four adapters wire together six modules' exports by hand.
