-- Add AI telemetry tables for capturing full interaction data
-- during ticket work sessions

CREATE TABLE `telemetry_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text,
	`project_id` text,
	`environment` text DEFAULT 'unknown' NOT NULL,
	`branch_name` text,
	`claude_session_id` text,
	`started_at` text DEFAULT (datetime('now')) NOT NULL,
	`ended_at` text,
	`total_prompts` integer DEFAULT 0,
	`total_tool_calls` integer DEFAULT 0,
	`total_duration_ms` integer,
	`total_tokens` integer,
	`outcome` text,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_sessions_ticket` ON `telemetry_sessions` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_sessions_project` ON `telemetry_sessions` (`project_id`);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_sessions_started` ON `telemetry_sessions` (`started_at`);
--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`ticket_id` text,
	`event_type` text NOT NULL,
	`tool_name` text,
	`event_data` text,
	`duration_ms` integer,
	`token_count` integer,
	`is_error` integer DEFAULT false,
	`correlation_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_events_session` ON `telemetry_events` (`session_id`);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_events_ticket` ON `telemetry_events` (`ticket_id`);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_events_type` ON `telemetry_events` (`event_type`);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_events_created` ON `telemetry_events` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_events_correlation` ON `telemetry_events` (`correlation_id`);
