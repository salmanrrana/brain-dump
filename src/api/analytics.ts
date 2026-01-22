import { createServerFn } from "@tanstack/react-start";
import { db, sqlite } from "../lib/db";
import { ralphSessions } from "../lib/schema";
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

    // 4. Ralph session metrics
    const allSessions = db.select().from(ralphSessions).all();
    const completedSessions = allSessions.filter((s) => s.completedAt !== null);
    const successfulSessions = completedSessions.filter((s) => s.outcome === "success");

    const totalSessions = allSessions.length;
    const successRate =
      completedSessions.length > 0
        ? (successfulSessions.length / completedSessions.length) * 100
        : 0;

    // Calculate average duration
    let totalDuration = 0;
    let durationCount = 0;
    const timeByState: Record<string, number[]> = {};

    for (const session of completedSessions) {
      if (session.startedAt && session.completedAt) {
        const start = new Date(session.startedAt).getTime();
        const end = new Date(session.completedAt).getTime();
        // Validate dates are valid
        if (isNaN(start) || isNaN(end) || end < start) {
          continue; // Skip invalid sessions
        }
        const duration = (end - start) / (1000 * 60); // minutes
        if (duration > 0) {
          totalDuration += duration;
          durationCount++;
        }

        // Parse state history to calculate time per state
        if (session.stateHistory) {
          const history = safeJsonParse<StateHistoryEntry[]>(session.stateHistory, []);
          for (let i = 0; i < history.length - 1; i++) {
            const currentEntry = history[i];
            const nextEntry = history[i + 1];
            if (!currentEntry?.timestamp || !nextEntry?.timestamp) {
              continue; // Skip entries without timestamps
            }
            const current = new Date(currentEntry.timestamp).getTime();
            const next = new Date(nextEntry.timestamp).getTime();
            // Validate timestamps and ensure positive duration
            if (isNaN(current) || isNaN(next) || next <= current) {
              continue; // Skip invalid state transitions
            }
            const stateDuration = (next - current) / (1000 * 60); // minutes
            const state = currentEntry.state;
            if (!state) {
              continue; // Skip entries without state
            }
            if (!timeByState[state]) {
              timeByState[state] = [];
            }
            timeByState[state].push(stateDuration);
          }
        }
      }
    }

    const avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    // Calculate average time by state
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

    // 6. Cycle time (completed_at - created_at for done tickets)
    const cycleTimeSql = `
      SELECT 
        (julianday(completed_at) - julianday(created_at)) * 24 as hours
      FROM tickets
      WHERE completed_at IS NOT NULL
        AND created_at IS NOT NULL
      ORDER BY hours ASC
    `;
    const cycleTimeRows = sqlite.prepare(cycleTimeSql).all() as Array<{ hours: number }>;
    const cycleTimes = cycleTimeRows
      .map((r) => Number(r.hours) || 0)
      .filter((h) => h > 0 && isFinite(h));

    let avgCycleTime = 0;
    let medianCycleTime = 0;
    let p95CycleTime = 0;
    const cycleTimeDistribution: Array<{ range: string; count: number }> = [];

    if (cycleTimes.length > 0) {
      avgCycleTime = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
      const sorted = [...cycleTimes].sort((a, b) => a - b);
      medianCycleTime = sorted[Math.floor(sorted.length / 2)] ?? 0;
      const p95Index = Math.floor(sorted.length * 0.95);
      p95CycleTime = sorted[p95Index] ?? sorted[sorted.length - 1] ?? 0;

      // Create distribution buckets for histogram
      const max = Math.max(...cycleTimes);
      const bucketCount = 8;
      const bucketSize = max / bucketCount;

      for (let i = 0; i < bucketCount; i++) {
        const min = i * bucketSize;
        const maxBucket = (i + 1) * bucketSize;
        const count = cycleTimes.filter(
          (h) => h >= min && (i === bucketCount - 1 ? h <= maxBucket : h < maxBucket)
        ).length;

        let rangeLabel: string;
        if (maxBucket < 24) {
          rangeLabel = `${min.toFixed(0)}-${maxBucket.toFixed(0)}h`;
        } else {
          const minDays = Math.floor(min / 24);
          const maxDays = Math.floor(maxBucket / 24);
          rangeLabel = `${minDays}-${maxDays}d`;
        }

        cycleTimeDistribution.push({ range: rangeLabel, count });
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

    // 8. Commits per day (from linked_commits on tickets)
    const commitsSql = `
      SELECT linked_commits
      FROM tickets
      WHERE linked_commits IS NOT NULL AND linked_commits != ''
    `;
    const commitsRows = sqlite.prepare(commitsSql).all() as Array<{
      linked_commits: string | null;
    }>;

    // Parse all commits and extract dates
    const commitDates: string[] = [];
    for (const row of commitsRows) {
      if (!row.linked_commits) continue;
      try {
        const commits = safeJsonParse<Array<{ hash: string; message: string; linkedAt: string }>>(
          row.linked_commits,
          []
        );
        for (const commit of commits) {
          const linkedAt = commit.linkedAt;
          if (linkedAt) {
            // Extract date from ISO timestamp
            const date = linkedAt.split("T")[0];
            if (date) {
              commitDates.push(date);
            }
          }
        }
      } catch {
        // Skip invalid JSON - expected for some tickets with malformed linked_commits
        continue;
      }
    }

    // Count commits per day
    const commitsByDate: Record<string, number> = {};
    for (const date of commitDates) {
      commitsByDate[date] = (commitsByDate[date] || 0) + 1;
    }

    // Fill in last 30 days with commit counts
    const commitsPerDay: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = formatDate(date);
      commitsPerDay.push({
        date: dateStr,
        count: commitsByDate[dateStr] || 0,
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
