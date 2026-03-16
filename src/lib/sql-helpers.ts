import { sql, type SQL } from "drizzle-orm";
import { tickets } from "./schema";

/**
 * Build Drizzle SQL conditions for filtering tickets by tags.
 * Returns one AND condition per tag — ticket must contain ALL specified tags.
 * Uses json_valid() guard to prevent crashes on malformed JSON data.
 */
export function tagFilterConditions(tags: string[]): SQL[] {
  return tags.map(
    (tag) =>
      sql`json_valid(${tickets.tags}) AND EXISTS (
        SELECT 1 FROM json_each(${tickets.tags})
        WHERE json_each.value = ${tag}
      )`
  );
}

// ─── Analytics Result Types ──────────────────────────────────────────────────
// Named types for raw SQL query results, replacing inline anonymous `as` casts.

export interface CompletionTrendRow {
  date: string;
  count: number;
}

export interface VelocityRow {
  this_week: number;
  last_week: number;
  this_month: number;
}

export interface AiUsageRow {
  author: string;
  count: number;
}

export interface RalphMetricsRow {
  total: number;
  completed: number;
  successful: number;
  avg_duration_min: number | null;
}

export interface StateHistoryRow {
  state_history: string;
}

export interface PrMetricsRow {
  total: number;
  merged: number;
  open: number;
  draft: number;
}

export interface CycleTimeStatsRow {
  avg_hours: number | null;
  total_count: number;
  min_hours: number | null;
  max_hours: number | null;
}

export interface CycleTimeHoursRow {
  hours: number;
}

export interface DistributionBucketRow {
  bucket: number;
  count: number;
}

export interface TopProjectRow {
  project_id: string;
  name: string;
  completed: number;
}

export interface CommitsByDayRow {
  commit_date: string;
  count: number;
}
