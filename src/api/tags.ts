import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "../lib/db";

export interface TagFilters {
  projectId?: string;
  epicId?: string;
}

// Get unique tags with optional project/epic filter
export const getTags = createServerFn({ method: "GET" })
  .inputValidator((filters: TagFilters) => filters)
  .handler(async ({ data: filters }) => {
    let sql = `
      SELECT DISTINCT json_each.value as tag
      FROM tickets, json_each(tickets.tags)
      WHERE tickets.tags IS NOT NULL
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
