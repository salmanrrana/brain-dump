CREATE TABLE `verification_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`round` integer NOT NULL,
	`status` text NOT NULL,
	`certified` integer DEFAULT false NOT NULL,
	`manifest` text NOT NULL,
	`git_sha` text,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_verification_runs_ticket` ON `verification_runs` (`ticket_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_verification_runs_round` ON `verification_runs` (`ticket_id`,`round`);