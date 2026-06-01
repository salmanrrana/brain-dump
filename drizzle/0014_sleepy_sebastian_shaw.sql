CREATE INDEX `idx_tickets_project_position` ON `tickets` (`project_id`,`position`);--> statement-breakpoint
CREATE INDEX `idx_tickets_completed_at` ON `tickets` (`completed_at`);