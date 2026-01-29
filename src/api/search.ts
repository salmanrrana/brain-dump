import { createServerFn } from "@tanstack/react-start";
import { sqlite } from "../lib/db";

export interface SearchResult {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  projectId: string;
  epicId: string | null;
  tags: string | null;
  snippet: string;
}

export interface SearchFilters {
  query: string;
  projectId?: string;
}

// Search tickets using FTS5
export const searchTickets = createServerFn({ method: "GET" })
  .inputValidator((filters: SearchFilters) => {
    if (!filters.query || filters.query.trim().length === 0) {
      return { query: "", projectId: filters.projectId };
    }
    return filters;
  })
  .handler(async ({ data: filters }) => {
    const { query, projectId } = filters;

    if (!query || query.trim().length === 0) {
      return [];
    }

    // Escape special FTS5 characters and prepare the query
    const searchTerm = query
      .trim()
      .replace(/[*"()]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term}"*`)
      .join(" ");

    if (!searchTerm) {
      return [];
    }

    try {
      let sql = `
        SELECT
          t.id,
          t.title,
          t.description,
          t.status,
          t.priority,
          t.project_id as projectId,
          t.epic_id as epicId,
          t.tags,
          snippet(tickets_fts, 0, '<mark>', '</mark>', '...', 32) as snippet
        FROM tickets_fts
        JOIN tickets t ON tickets_fts.rowid = t.rowid
        WHERE tickets_fts MATCH ?
      `;

      const params: (string | undefined)[] = [searchTerm];

      if (projectId) {
        sql += " AND t.project_id = ?";
        params.push(projectId);
      }

      sql += " ORDER BY rank LIMIT 50";

      const stmt = sqlite.prepare(sql);
      const results = stmt.all(...params) as SearchResult[];

      return results;
    } catch (error) {
      // If FTS5 table doesn't exist yet or query fails, fall back to LIKE search
      console.error("FTS5 search failed, falling back to LIKE:", error);

      let sql = `
        SELECT
          id,
          title,
          description,
          status,
          priority,
          project_id as projectId,
          epic_id as epicId,
          tags,
          title as snippet
        FROM tickets
        WHERE (
          title LIKE ? OR
          description LIKE ? OR
          tags LIKE ? OR
          subtasks LIKE ?
        )
      `;

      const likeQuery = `%${query.trim()}%`;
      const params: string[] = [likeQuery, likeQuery, likeQuery, likeQuery];

      if (projectId) {
        sql += " AND project_id = ?";
        params.push(projectId);
      }

      sql += " LIMIT 50";

      const stmt = sqlite.prepare(sql);
      const results = stmt.all(...params) as SearchResult[];

      return results;
    }
  });
