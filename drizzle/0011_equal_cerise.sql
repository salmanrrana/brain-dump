CREATE TABLE IF NOT EXISTS `cost_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`model_name` text NOT NULL,
	`input_cost_per_mtok` real NOT NULL,
	`output_cost_per_mtok` real NOT NULL,
	`cache_read_cost_per_mtok` real,
	`cache_create_cost_per_mtok` real,
	`is_default` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cost_models_provider` ON `cost_models` (`provider`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_cost_models_model` ON `cost_models` (`provider`,`model_name`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `epic_review_run_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_review_run_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`summary` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`epic_review_run_id`) REFERENCES `epic_review_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_epic_review_run_tickets_run` ON `epic_review_run_tickets` (`epic_review_run_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_epic_review_run_tickets_ticket` ON `epic_review_run_tickets` (`ticket_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_epic_review_run_tickets_position` ON `epic_review_run_tickets` (`epic_review_run_id`,`position`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `epic_review_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text NOT NULL,
	`steering_prompt` text,
	`launch_mode` text NOT NULL,
	`provider` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`summary` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_epic_review_runs_epic` ON `epic_review_runs` (`epic_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_epic_review_runs_status` ON `epic_review_runs` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_epic_review_runs_created` ON `epic_review_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `token_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`telemetry_session_id` text,
	`ticket_id` text,
	`model` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cache_read_tokens` integer,
	`cache_creation_tokens` integer,
	`cost_usd` real,
	`source` text NOT NULL,
	`recorded_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`telemetry_session_id`) REFERENCES `telemetry_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_token_usage_session` ON `token_usage` (`telemetry_session_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_token_usage_ticket` ON `token_usage` (`ticket_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_token_usage_recorded` ON `token_usage` (`recorded_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_token_usage_ticket_recorded` ON `token_usage` (`ticket_id`,`recorded_at`);--> statement-breakpoint
ALTER TABLE `demo_scripts` ADD `epic_review_run_id` text REFERENCES `epic_review_runs`(`id`) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `review_findings` ADD `epic_review_run_id` text REFERENCES `epic_review_runs`(`id`) ON DELETE set null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_demo_scripts_run` ON `demo_scripts` (`epic_review_run_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_review_findings_run` ON `review_findings` (`epic_review_run_id`);