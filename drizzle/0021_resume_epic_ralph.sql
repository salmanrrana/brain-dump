CREATE TABLE `autonomous_epic_launches` (
	`epic_id` text PRIMARY KEY NOT NULL,
	`profile_json` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `epic_continuation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text NOT NULL,
	`ticket_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_run_at` text NOT NULL,
	`last_error` text,
	`leased_by` text,
	`lease_expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `epic_continuation_jobs_epic_id_unique` ON `epic_continuation_jobs` (`epic_id`);--> statement-breakpoint
CREATE INDEX `idx_epic_continuation_jobs_ready` ON `epic_continuation_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `idx_epic_continuation_jobs_lease` ON `epic_continuation_jobs` (`status`,`lease_expires_at`);
