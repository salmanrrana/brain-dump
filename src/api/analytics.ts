import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "../lib/db";
import { safeJsonParse } from "../lib/utils";
import type { StateHistoryEntry } from "../lib/schema";

export interface DashboardAnalytics {
  // Completion trends
  completionTrend: Array<{ date: string; count: number }>; // Last 30 days
  velocity: {
    thisWeek: number;
    lastWeek: number;
    thisMonth: number;
    trend: "up" | "down" | "stable";
  };

  // AI usage breakdown
  aiUsage: {
    claude: number;
    ralph: number;
    opencode: number;
    user: number;
  };

  // Ralph session metrics
  ralphMetrics: {
    totalSessions: number;
    successRate: number;
    avgDuration: number; // minutes
    avgTimeByState: Record<string, number>; // state -> minutes
  };

  // PR metrics
  prMetrics: {
    total: number;
    merged: number;
    open: number;
    draft: number;
    mergeRate: number;
  };

  // Cycle time
  cycleTime: {
    avg: number; // hours
    median: number;
    p95: number;
    distribution: Array<{ range: string; count: number }>; // For histogram
  };

  // Project activity
  topProjects: Array<{ projectId: string; name: string; completed: number }>;

  // Commit activity
  commitsPerDay: Array<{ date: string; count: number }>; // Last 30 days
}

/**
 * Get comprehensive dashboard analytics including completion trends,
 * AI usage, velocity metrics, Ralph session stats, PR metrics, cycle time,
 * and top projects.
 */
export const getDashboardAnalytics = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardAnalytics> => {
    const now = new Date();

    // Helper to format date as YYYY-MM-DD
    const formatDate = (date: Date): string => {
      const isoString = date.toISOString();
      const datePart = isoString.split("T")[0];
      return datePart ?? isoString.substring(0, 10);
    };

    // 1. Completion trend (last 30 days)
    const completionTrendSql = `
      SELECT 
        date(completed_at) as date,
        COUNT(*) as count
      FROM tickets
      WHERE completed_at IS NOT NULL
        AND completed_at >= datetime('now', '-30 days')
      GROUP BY date(completed_at)
      ORDER BY date ASC
    `;
    const completionTrendRows = sqlite.prepare(completionTrendSql).all() as Array<{
      date: string;
      count: number;
    }>;

    // Fill in missing dates with 0
    const completionTrendMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
      const dateStr = formatDate(date);
      if (dateStr) {
        completionTrendMap.set(dateStr, 0);
      }
    }
    // Update with actual data
    for (const row of completionTrendRows) {
      const date = row.date;
      if (date) {
        completionTrendMap.set(date, Number(row.count) || 0);
      }
    }
    const completionTrend = Array.from(completionTrendMap.entries())
      .map(([date, count]) => ({
        date,
        count: Number(count) || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 2. Velocity metrics
    const velocitySql = `
      SELECT 
        COUNT(CASE WHEN completed_at >= datetime('now', '-7 days') THEN 1 END) as this_week,
        COUNT(CASE WHEN completed_at >= datetime('now', '-14 days') AND completed_at < datetime('now', '-7 days') THEN 1 END) as last_week,
        COUNT(CASE WHEN completed_at >= datetime('now', '-30 days') THEN 1 END) as this_month
      FROM tickets
      WHERE completed_at IS NOT NULL
    `;
    const velocityRow = sqlite.prepare(velocitySql).get() as {
      this_week: number;
      last_week: number;
      this_month: number;
    };

    const thisWeek = Number(velocityRow?.this_week) || 0;
    const lastWeek = Number(velocityRow?.last_week) || 0;
    const thisMonth = Number(velocityRow?.this_month) || 0;

    let trend: "up" | "down" | "stable" = "stable";
    if (lastWeek > 0) {
      const change = ((thisWeek - lastWeek) / lastWeek) * 100;
      if (change > 5) trend = "up";
      else if (change < -5) trend = "down";
    } else if (thisWeek > 0) {
      trend = "up";
    }

    // 3. AI usage breakdown (from comments)
    const aiUsageSql = `
      SELECT 
        author,
        COUNT(*) as count
      FROM ticket_comments
      GROUP BY author
    `;
    const aiUsageRows = sqlite.prepare(aiUsageSql).all() as Array<{
      author: string;
      count: number;
    }>;

    const aiUsage = {
      claude: 0,
      ralph: 0,
      opencode: 0,
      user: 0,
    };
    for (const row of aiUsageRows) {
      const count = Number(row.count) || 0;
      if (row.author === "claude") aiUsage.claude = count;
      else if (row.author === "ralph") aiUsage.ralph = count;
      else if (row.author === "opencode") aiUsage.opencode = count;
      else aiUsage.user += count; // Sum all other authors as "user"
    }

    // 4. Ralph session metrics — use SQL aggregation instead of loading all sessions
    const ralphMetricsSql = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as completed,
        COUNT(CASE WHEN outcome = 'success' THEN 1 END) as successful,
        AVG(
          CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
               AND julianday(completed_at) > julianday(started_at)
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60
          END
        ) as avg_duration_min
      FROM ralph_sessions
    `;
    const ralphRow = sqlite.prepare(ralphMetricsSql).get() as {
      total: number;
      completed: number;
      successful: number;
      avg_duration_min: number | null;
    };

    const totalSessions = Number(ralphRow?.total) || 0;
    const completedCount = Number(ralphRow?.completed) || 0;
    const successRate =
      completedCount > 0 ? (Number(ralphRow?.successful || 0) / completedCount) * 100 : 0;
    const avgDuration = Number(ralphRow?.avg_duration_min) || 0;

    // Time-by-state requires JSON parsing — only load state_history column for completed sessions
    const stateHistoryRows = sqlite
      .prepare(
        `SELECT state_history FROM ralph_sessions
         WHERE completed_at IS NOT NULL AND state_history IS NOT NULL`
      )
      .all() as Array<{ state_history: string }>;

    const timeByState: Record<string, number[]> = {};
    for (const row of stateHistoryRows) {
      const history = safeJsonParse<StateHistoryEntry[]>(row.state_history, []);
      for (let i = 0; i < history.length - 1; i++) {
        const currentEntry = history[i];
        const nextEntry = history[i + 1];
        if (!currentEntry?.timestamp || !nextEntry?.timestamp) continue;
        const current = new Date(currentEntry.timestamp).getTime();
        const next = new Date(nextEntry.timestamp).getTime();
        if (isNaN(current) || isNaN(next) || next <= current) continue;
        const stateDuration = (next - current) / (1000 * 60);
        const state = currentEntry.state;
        if (!state) continue;
        if (!timeByState[state]) timeByState[state] = [];
        timeByState[state].push(stateDuration);
      }
    }

    const avgTimeByState: Record<string, number> = {};
    for (const [state, durations] of Object.entries(timeByState)) {
      avgTimeByState[state] =
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    }

    // 5. PR metrics
    const prMetricsSql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN pr_status = 'merged' THEN 1 END) as merged,
        COUNT(CASE WHEN pr_status = 'open' THEN 1 END) as open,
        COUNT(CASE WHEN pr_status = 'draft' THEN 1 END) as draft
      FROM tickets
      WHERE pr_status IS NOT NULL
    `;
    const prMetricsRow = sqlite.prepare(prMetricsSql).get() as {
      total: number;
      merged: number;
      open: number;
      draft: number;
    };

    const prTotal = Number(prMetricsRow?.total) || 0;
    const prMerged = Number(prMetricsRow?.merged) || 0;
    const prOpen = Number(prMetricsRow?.open) || 0;
    const prDraft = Number(prMetricsRow?.draft) || 0;
    const mergeRate = prTotal > 0 ? (prMerged / prTotal) * 100 : 0;

    // 6. Cycle time — computed via SQL aggregation (no raw-row transfer)
    const cycleTimeStatsSql = `
      SELECT
        AVG(hours) as avg_hours,
        COUNT(*) as total_count,
        MIN(hours) as min_hours,
        MAX(hours) as max_hours
      FROM (
        SELECT (julianday(completed_at) - julianday(created_at)) * 24 as hours
        FROM tickets
        WHERE completed_at IS NOT NULL AND created_at IS NOT NULL
          AND (julianday(completed_at) - julianday(created_at)) * 24 > 0
      )
    `;
    const cycleStats = sqlite.prepare(cycleTimeStatsSql).get() as {
      avg_hours: number | null;
      total_count: number;
      min_hours: number | null;
      max_hours: number | null;
    };

    const totalCycleTimeRows = Number(cycleStats?.total_count) || 0;
    const avgCycleTime = Number(cycleStats?.avg_hours) || 0;
    let medianCycleTime = 0;
    let p95CycleTime = 0;
    const cycleTimeDistribution: Array<{ range: string; count: number }> = [];

    if (totalCycleTimeRows > 0) {
      // Median via LIMIT/OFFSET at the middle position
      const medianOffset = Math.floor(totalCycleTimeRows / 2);
      const medianSql = `
        SELECT hours FROM (
          SELECT (julianday(completed_at) - julianday(created_at)) * 24 as hours
          FROM tickets
          WHERE completed_at IS NOT NULL AND created_at IS NOT NULL
            AND (julianday(completed_at) - julianday(created_at)) * 24 > 0
          ORDER BY hours ASC
        ) LIMIT 1 OFFSET ?
      `;
      const medianRow = sqlite.prepare(medianSql).get(medianOffset) as
        | { hours: number }
        | undefined;
      medianCycleTime = Number(medianRow?.hours) || 0;

      // P95 via LIMIT/OFFSET at the 95th percentile position
      const p95Offset = Math.floor(totalCycleTimeRows * 0.95);
      const p95Row = sqlite.prepare(medianSql).get(p95Offset) as { hours: number } | undefined;
      p95CycleTime = Number(p95Row?.hours) || 0;

      // Distribution buckets via SQL CASE — computed from max value
      const maxHours = Number(cycleStats?.max_hours) || 1;
      const bucketCount = 8;
      const bucketSize = maxHours / bucketCount;

      // Build CASE expression for 8 histogram buckets
      const caseParts: string[] = [];
      for (let i = 0; i < bucketCount; i++) {
        const lo = i * bucketSize;
        const hi = (i + 1) * bucketSize;
        caseParts.push(
          i === bucketCount - 1
            ? `WHEN hours >= ${lo} THEN ${i}`
            : `WHEN hours >= ${lo} AND hours < ${hi} THEN ${i}`
        );
      }

      const distSql = `
        SELECT bucket, COUNT(*) as count FROM (
          SELECT CASE ${caseParts.join(" ")} END as bucket
          FROM (
            SELECT (julianday(completed_at) - julianday(created_at)) * 24 as hours
            FROM tickets
            WHERE completed_at IS NOT NULL AND created_at IS NOT NULL
              AND (julianday(completed_at) - julianday(created_at)) * 24 > 0
          )
        )
        GROUP BY bucket
        ORDER BY bucket ASC
      `;
      const distRows = sqlite.prepare(distSql).all() as Array<{ bucket: number; count: number }>;

      for (let i = 0; i < bucketCount; i++) {
        const lo = i * bucketSize;
        const hi = (i + 1) * bucketSize;
        const row = distRows.find((r) => r.bucket === i);

        let rangeLabel: string;
        if (hi < 24) {
          rangeLabel = `${lo.toFixed(0)}-${hi.toFixed(0)}h`;
        } else {
          rangeLabel = `${Math.floor(lo / 24)}-${Math.floor(hi / 24)}d`;
        }

        cycleTimeDistribution.push({ range: rangeLabel, count: Number(row?.count) || 0 });
      }
    }

    // 7. Top projects (by completed tickets)
    const topProjectsSql = `
      SELECT 
        t.project_id,
        p.name,
        COUNT(*) as completed
      FROM tickets t
      INNER JOIN projects p ON t.project_id = p.id
      WHERE t.status = 'done'
      GROUP BY t.project_id, p.name
      ORDER BY completed DESC
      LIMIT 5
    `;
    const topProjectsRows = sqlite.prepare(topProjectsSql).all() as Array<{
      project_id: string;
      name: string;
      completed: number;
    }>;

    const topProjects = topProjectsRows.map((row) => ({
      projectId: row.project_id,
      name: row.name || "Unknown",
      completed: Number(row.completed) || 0,
    }));

    // 8. Commits per day — use SQL json_each to extract dates without JS parsing
    const commitsPerDaySql = `
      SELECT
        date(json_extract(je.value, '$.linkedAt')) as commit_date,
        COUNT(*) as count
      FROM tickets,
           json_each(tickets.linked_commits) as je
      WHERE tickets.linked_commits IS NOT NULL
        AND json_valid(tickets.linked_commits)
        AND json_extract(je.value, '$.linkedAt') IS NOT NULL
        AND date(json_extract(je.value, '$.linkedAt')) >= date('now', '-30 days')
      GROUP BY commit_date
      ORDER BY commit_date ASC
    `;
    const commitRows = sqlite.prepare(commitsPerDaySql).all() as Array<{
      commit_date: string;
      count: number;
    }>;

    // Build a lookup map from SQL results
    const commitsByDate = new Map<string, number>();
    for (const row of commitRows) {
      if (row.commit_date) {
        commitsByDate.set(row.commit_date, Number(row.count) || 0);
      }
    }

    // Fill in last 30 days with commit counts (0 for missing days)
    const commitsPerDay: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = formatDate(date);
      commitsPerDay.push({
        date: dateStr,
        count: commitsByDate.get(dateStr) || 0,
      });
    }

    return {
      completionTrend,
      velocity: {
        thisWeek,
        lastWeek,
        thisMonth,
        trend,
      },
      aiUsage,
      ralphMetrics: {
        totalSessions,
        successRate,
        avgDuration,
        avgTimeByState,
      },
      prMetrics: {
        total: prTotal,
        merged: prMerged,
        open: prOpen,
        draft: prDraft,
        mergeRate,
      },
      cycleTime: {
        avg: avgCycleTime,
        median: medianCycleTime,
        p95: p95CycleTime,
        distribution: cycleTimeDistribution,
      },
      topProjects,
      commitsPerDay,
    };
  }
);
