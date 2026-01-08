CREATE TABLE `epics` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`project_id` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epics_project` ON `epics` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`path` text NOT NULL,
	`color` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_path_unique` ON `projects` (`path`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text,
	`position` real NOT NULL,
	`project_id` text NOT NULL,
	`epic_id` text,
	`tags` text,
	`subtasks` text,
	`is_blocked` integer DEFAULT false,
	`blocked_reason` text,
	`linked_files` text,
	`attachments` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_tickets_project` ON `tickets` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_epic` ON `tickets` (`epic_id`);--> statement-breakpoint
CREATE INDEX `idx_tickets_status` ON `tickets` (`status`);