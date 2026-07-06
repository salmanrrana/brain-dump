CREATE TABLE `verification_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`demo_script_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_run_at` text NOT NULL,
	`last_error` text,
	`leased_by` text,
	`lease_expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`demo_script_id`) REFERENCES `demo_scripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_jobs_ticket_id_unique` ON `verification_jobs` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_verification_jobs_status_next` ON `verification_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_verification_jobs_lease` ON `verification_jobs` (`status`,`lease_expires_at`);--> statement-breakpoint
CREATE INDEX `idx_verification_jobs_demo` ON `verification_jobs` (`demo_script_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `reviewer_provider` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `reviewer_model` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `epic_auto_pr` integer DEFAULT true;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_reviewer_provider` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_reviewer_model` text;