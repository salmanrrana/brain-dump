import type Database from "better-sqlite3";

interface ChangeRequestRow {
  ticket_id: string;
  content: string;
}

export function getHumanRequestedChangesByTicketId(
  sqlite: Database.Database,
  ticketIds: string[]
): Record<string, string | undefined> {
  if (ticketIds.length === 0) {
    return {};
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = sqlite
    .prepare(
      `SELECT tc.ticket_id, tc.content, tc.created_at
       FROM ticket_comments tc
       JOIN tickets t ON t.id = tc.ticket_id
       WHERE tc.ticket_id IN (${placeholders})
         AND tc.type = 'change_request'
         AND t.status != 'done'
         AND tc.created_at = (
           SELECT MAX(latest.created_at)
           FROM ticket_comments latest
           WHERE latest.ticket_id = tc.ticket_id
             AND latest.type = 'change_request'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM demo_scripts approved_demo
           WHERE approved_demo.ticket_id = tc.ticket_id
             AND approved_demo.passed = 1
             AND approved_demo.completed_at IS NOT NULL
             AND approved_demo.completed_at > tc.created_at
         )`
    )
    .all(...ticketIds) as ChangeRequestRow[];

  return Object.fromEntries(rows.map((row) => [row.ticket_id, row.content]));
}
