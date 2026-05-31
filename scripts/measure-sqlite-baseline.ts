#!/usr/bin/env npx tsx
/**
 * One-off SQLite query timing harness for the performance baseline.
 *
 * This is NOT permanent perf tooling (that lands in the validation-harness ticket).
 * It opens a READ-ONLY connection to the real local Brain Dump database and times
 * the representative hot-path queries so we can publish "before" numbers.
 *
 * Read-only mode is safe to run while `pnpm dev` holds the write lock — SQLite WAL
 * allows concurrent readers, and we never touch the db singleton / file watcher.
 *
 * The query shapes below mirror production:
 *   - getTicketSummaries     src/api/tickets.ts:427
 *   - getEpicDetail          src/api/epics.ts:320
 *   - getDashboardAnalytics  src/api/analytics.ts:428 (status distribution is the
 *                            representative grouping cost; the full analytics core
 *                            imports the db singleton and is excluded here on purpose)
 *
 * Usage:
 *   npx tsx scripts/measure-sqlite-baseline.ts
 *   npx tsx scripts/measure-sqlite-baseline.ts --iterations 500
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { desc, eq, sql } from "drizzle-orm";
import { epics, projects, reviewFindings, tickets } from "../src/lib/schema";
import { getDatabasePath } from "../src/lib/xdg";

const DEFAULT_ITERATIONS = 200;
const WARMUP_ITERATIONS = 20;

interface Timing {
  label: string;
  rows: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const index = Math.min(sortedAsc.length - 1, Math.floor((sortedAsc.length - 1) * p));
  return sortedAsc[index] ?? 0;
}

/** Run `fn` warmup + N times, returning timing stats. `fn` returns the row count it produced. */
function bench(label: string, fn: () => number, iterations: number): Timing {
  for (let i = 0; i < WARMUP_ITERATIONS; i++) fn();

  const samples: number[] = [];
  let rows = 0;
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    rows = fn();
    samples.push(performance.now() - start);
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    label,
    rows,
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    avgMs: sum / samples.length,
    minMs: sorted[0] ?? 0,
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

function parseIterations(): number {
  const flagIndex = process.argv.indexOf("--iterations");
  if (flagIndex === -1) return DEFAULT_ITERATIONS;
  const parsed = Number(process.argv[flagIndex + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_ITERATIONS;
}

function formatTable(timings: Timing[]): string {
  const header =
    "| Query | Rows | p50 (ms) | p95 (ms) | avg (ms) | min (ms) | max (ms) |\n" +
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |";
  const body = timings
    .map(
      (t) =>
        `| ${t.label} | ${t.rows} | ${t.p50Ms.toFixed(3)} | ${t.p95Ms.toFixed(3)} | ${t.avgMs.toFixed(3)} | ${t.minMs.toFixed(3)} | ${t.maxMs.toFixed(3)} |`
    )
    .join("\n");
  return `${header}\n${body}`;
}

function main(): void {
  const iterations = parseIterations();
  const dbPath = getDatabasePath();
  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
  sqlite.pragma("query_only = ON");
  const db = drizzle(sqlite, { schema: { projects, epics, tickets, reviewFindings } });

  // ── Pick representative params: the project + epic with the most tickets ──────
  const projectCounts = db
    .select({ projectId: tickets.projectId, count: sql<number>`COUNT(*)` })
    .from(tickets)
    .groupBy(tickets.projectId)
    .orderBy(desc(sql`COUNT(*)`))
    .all();
  const busiestProjectId = projectCounts[0]?.projectId;

  const epicCounts = db
    .select({ epicId: tickets.epicId, count: sql<number>`COUNT(*)` })
    .from(tickets)
    .where(sql`${tickets.epicId} IS NOT NULL`)
    .groupBy(tickets.epicId)
    .orderBy(desc(sql`COUNT(*)`))
    .all();
  const busiestEpicId = epicCounts[0]?.epicId;

  const totalTickets =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(tickets)
      .get()?.count ?? 0;

  const summaryColumns = {
    id: tickets.id,
    title: tickets.title,
    status: tickets.status,
    priority: tickets.priority,
    position: tickets.position,
    projectId: tickets.projectId,
    epicId: tickets.epicId,
    tags: tickets.tags,
    subtasks: tickets.subtasks,
    isBlocked: tickets.isBlocked,
    blockedReason: tickets.blockedReason,
    createdAt: tickets.createdAt,
    updatedAt: tickets.updatedAt,
    completedAt: tickets.completedAt,
    branchName: tickets.branchName,
    prNumber: tickets.prNumber,
    prUrl: tickets.prUrl,
    prStatus: tickets.prStatus,
  };

  const timings: Timing[] = [];

  // 1. Board: getTicketSummaries filtered to one project (src/api/tickets.ts:427)
  if (busiestProjectId) {
    timings.push(
      bench(
        "getTicketSummaries (board, one project)",
        () =>
          db
            .select(summaryColumns)
            .from(tickets)
            .where(eq(tickets.projectId, busiestProjectId))
            .orderBy(tickets.position)
            .all().length,
        iterations
      )
    );
  } else {
    console.warn(
      "WARNING: no tickets found — skipping 'getTicketSummaries (board, one project)'. Run against a populated DB for the full 4-query baseline."
    );
  }

  // 2. Dashboard: all ticket summaries, unfiltered (dashboard loader fetch)
  timings.push(
    bench(
      "getTicketSummaries (dashboard, all tickets)",
      () => db.select(summaryColumns).from(tickets).orderBy(tickets.position).all().length,
      iterations
    )
  );

  // 3. Dashboard analytics — representative status-distribution grouping
  //    (stands in for getDashboardAnalytics aggregation cost; src/api/analytics.ts:428)
  timings.push(
    bench(
      "dashboard status aggregate (group by status)",
      () =>
        db
          .select({ status: tickets.status, count: sql<number>`COUNT(*)` })
          .from(tickets)
          .groupBy(tickets.status)
          .all().length,
      iterations
    )
  );

  // 4. getEpicDetail composite — epic + project + epic tickets + findings counts
  //    (src/api/epics.ts:320)
  if (busiestEpicId) {
    timings.push(
      bench(
        "getEpicDetail (composite, one epic)",
        () => {
          const epic = db.select().from(epics).where(eq(epics.id, busiestEpicId)).get();
          let rows = epic ? 1 : 0;
          if (epic) {
            rows += db.select().from(projects).where(eq(projects.id, epic.projectId)).all().length;
          }
          rows += db
            .select({
              id: tickets.id,
              title: tickets.title,
              status: tickets.status,
              priority: tickets.priority,
              isBlocked: tickets.isBlocked,
              blockedReason: tickets.blockedReason,
              branchName: tickets.branchName,
              prNumber: tickets.prNumber,
              prUrl: tickets.prUrl,
              prStatus: tickets.prStatus,
            })
            .from(tickets)
            .where(eq(tickets.epicId, busiestEpicId))
            .all().length;
          rows += db
            .select({
              severity: reviewFindings.severity,
              status: reviewFindings.status,
              count: sql<number>`COUNT(*)`,
            })
            .from(reviewFindings)
            .innerJoin(tickets, eq(reviewFindings.ticketId, tickets.id))
            .where(eq(tickets.epicId, busiestEpicId))
            .groupBy(reviewFindings.severity, reviewFindings.status)
            .all().length;
          return rows;
        },
        iterations
      )
    );
  } else {
    console.warn(
      "WARNING: no epic with tickets found — skipping 'getEpicDetail (composite, one epic)'. Run against a populated DB for the full 4-query baseline."
    );
  }

  sqlite.close();

  const report = {
    dbPath,
    iterations,
    warmup: WARMUP_ITERATIONS,
    totalTickets,
    busiestProjectId,
    busiestProjectTickets: projectCounts[0]?.count ?? 0,
    busiestEpicId,
    busiestEpicTickets: epicCounts[0]?.count ?? 0,
    timings,
  };

  console.log(`\nSQLite baseline — ${dbPath}`);
  console.log(
    `Total tickets: ${totalTickets} | busiest project: ${report.busiestProjectTickets} tickets | busiest epic: ${report.busiestEpicTickets} tickets`
  );
  console.log(`Iterations: ${iterations} (after ${WARMUP_ITERATIONS} warmup)\n`);
  console.log(formatTable(timings));
  console.log(`\nJSON:\n${JSON.stringify(report, null, 2)}`);
}

main();
