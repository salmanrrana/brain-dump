import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "../lib/db";

export interface TagFilters {
  projectId?: string;
  epicId?: string;
}

export interface TagMetadata {
  tag: string;
  ticketCount: number;
  statusBreakdown: {
    backlog: number;
    ready: number;
    in_progress: number;
    ai_review: number;
    human_review: number;
    done: number;
  };
  lastUsedAt: string;
}

// Get unique tags with optional project/epic filter
export const getTags = createServerFn({ method: "GET" })
  .inputValidator((filters: TagFilters) => filters)
  .handler(async ({ data: filters }) => {
    let sql = `
      SELECT DISTINCT json_each.value as tag
      FROM tickets, json_each(tickets.tags)
      WHERE tickets.tags IS NOT NULL AND tickets.tags != '' AND tickets.tags != '[]'
    `;

    const params: string[] = [];

    if (filters.projectId) {
      sql += " AND tickets.project_id = ?";
      params.push(filters.projectId);
    }

    if (filters.epicId) {
      sql += " AND tickets.epic_id = ?";
      params.push(filters.epicId);
    }

    sql += " ORDER BY tag";

    const stmt = sqlite.prepare(sql);
    const results = stmt.all(...params) as { tag: string }[];

    return results.map((r) => r.tag);
  });

// Raw row shape from the SQL query
interface TagMetadataRow {
  tag: string;
  ticket_count: number;
  backlog_count: number;
  ready_count: number;
  in_progress_count: number;
  ai_review_count: number;
  human_review_count: number;
  done_count: number;
  last_used_at: string;
}

// Get tags with metadata (counts, status breakdown, last used)
export const getTagsWithMetadata = createServerFn({ method: "GET" })
  .inputValidator((filters: TagFilters) => filters)
  .handler(async ({ data: filters }): Promise<TagMetadata[]> => {
    let sql = `
      SELECT
        json_each.value as tag,
        COUNT(DISTINCT tickets.id) as ticket_count,
        SUM(CASE WHEN tickets.status = 'backlog' THEN 1 ELSE 0 END) as backlog_count,
        SUM(CASE WHEN tickets.status = 'ready' THEN 1 ELSE 0 END) as ready_count,
        SUM(CASE WHEN tickets.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN tickets.status = 'ai_review' THEN 1 ELSE 0 END) as ai_review_count,
        SUM(CASE WHEN tickets.status = 'human_review' THEN 1 ELSE 0 END) as human_review_count,
        SUM(CASE WHEN tickets.status = 'done' THEN 1 ELSE 0 END) as done_count,
        MAX(tickets.updated_at) as last_used_at
      FROM tickets, json_each(tickets.tags)
      WHERE tickets.tags IS NOT NULL AND tickets.tags != '' AND tickets.tags != '[]'
    `;

    const params: string[] = [];

    if (filters.projectId) {
      sql += " AND tickets.project_id = ?";
      params.push(filters.projectId);
    }

    if (filters.epicId) {
      sql += " AND tickets.epic_id = ?";
      params.push(filters.epicId);
    }

    sql += " GROUP BY json_each.value ORDER BY ticket_count DESC, tag ASC";

    const stmt = sqlite.prepare(sql);
    const rows = stmt.all(...params) as TagMetadataRow[];

    return rows.map((row) => ({
      tag: row.tag,
      ticketCount: row.ticket_count,
      statusBreakdown: {
        backlog: row.backlog_count,
        ready: row.ready_count,
        in_progress: row.in_progress_count,
        ai_review: row.ai_review_count,
        human_review: row.human_review_count,
        done: row.done_count,
      },
      lastUsedAt: row.last_used_at,
    }));
  });
