CREATE INDEX `idx_comments_ticket_created` ON `ticket_comments` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tickets_project_status` ON `tickets` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_epic_status` ON `tickets` (`epic_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_project_priority` ON `tickets` (`project_id`,`priority`);