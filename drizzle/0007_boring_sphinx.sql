CREATE TABLE `claude_task_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`session_id` text,
	`tasks` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_claude_task_snapshots_ticket` ON `claude_task_snapshots` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_claude_task_snapshots_session` ON `claude_task_snapshots` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_claude_task_snapshots_created` ON `claude_task_snapshots` (`created_at`);--> statement-breakpoint
CREATE TABLE `claude_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`subject` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`active_form` text,
	`position` real NOT NULL,
	`status_history` text,
	`session_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_claude_tasks_ticket` ON `claude_tasks` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_claude_tasks_session` ON `claude_tasks` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_claude_tasks_status` ON `claude_tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_claude_tasks_position` ON `claude_tasks` (`ticket_id`,`position`);
