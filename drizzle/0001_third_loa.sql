CREATE TABLE `settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`terminal_emulator` text,
	`ralph_sandbox` integer DEFAULT false,
	`auto_create_pr` integer DEFAULT true,
	`pr_target_branch` text DEFAULT 'dev',
	`default_projects_directory` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ticket_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`content` text NOT NULL,
	`author` text NOT NULL,
	`type` text DEFAULT 'comment' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_comments_ticket` ON `ticket_comments` (`ticket_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `working_method` text DEFAULT 'auto';