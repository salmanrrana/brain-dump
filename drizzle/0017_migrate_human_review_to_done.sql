-- Migration: retire human_review from the active workflow.
-- Tickets in human_review had already passed AI review and demo generation under
-- the old manual approval gate. The new flow treats that state as complete.

UPDATE tickets
SET status = 'done',
    completed_at = COALESCE(completed_at, datetime('now')),
    updated_at = datetime('now')
WHERE status = 'human_review';

--> statement-breakpoint

UPDATE ticket_workflow_state
SET current_phase = 'done',
    updated_at = datetime('now')
WHERE ticket_id IN (SELECT id FROM tickets WHERE status = 'done')
  AND current_phase = 'human_review';
