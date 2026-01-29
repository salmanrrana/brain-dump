CREATE TABLE `tool_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_name` text NOT NULL,
	`session_id` text,
	`ticket_id` text,
	`project_id` text,
	`context` text DEFAULT 'unknown',
	`invocations` integer DEFAULT 1 NOT NULL,
	`success_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`total_duration` integer DEFAULT 0,
	`last_used_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_tool_usage_tool_name` ON `tool_usage_events` (`tool_name`);--> statement-breakpoint
CREATE INDEX `idx_tool_usage_session` ON `tool_usage_events` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_usage_ticket` ON `tool_usage_events` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_usage_project` ON `tool_usage_events` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tool_usage_last_used` ON `tool_usage_events` (`last_used_at`);
