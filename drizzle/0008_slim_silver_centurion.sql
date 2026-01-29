CREATE TABLE `demo_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`steps` text NOT NULL,
	`generated_at` text DEFAULT (datetime('now')) NOT NULL,
	`completed_at` text,
	`feedback` text,
	`passed` integer,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_scripts_ticket_id_unique` ON `demo_scripts` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_demo_scripts_ticket` ON `demo_scripts` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_demo_scripts_generated` ON `demo_scripts` (`generated_at`);--> statement-breakpoint
CREATE TABLE `epic_workflow_state` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text NOT NULL,
	`tickets_total` integer DEFAULT 0,
	`tickets_done` integer DEFAULT 0,
	`current_ticket_id` text,
	`learnings` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `epic_workflow_state_epic_id_unique` ON `epic_workflow_state` (`epic_id`);--> statement-breakpoint
CREATE INDEX `idx_epic_workflow_state_epic` ON `epic_workflow_state` (`epic_id`);--> statement-breakpoint
CREATE INDEX `idx_epic_workflow_state_current_ticket` ON `epic_workflow_state` (`current_ticket_id`);--> statement-breakpoint
CREATE TABLE `review_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`iteration` integer NOT NULL,
	`agent` text NOT NULL,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`file_path` text,
	`line_number` integer,
	`suggested_fix` text,
	`status` text DEFAULT 'open' NOT NULL,
	`fixed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_review_findings_ticket` ON `review_findings` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_review_findings_status` ON `review_findings` (`status`);--> statement-breakpoint
CREATE INDEX `idx_review_findings_severity` ON `review_findings` (`severity`);--> statement-breakpoint
CREATE INDEX `idx_review_findings_agent` ON `review_findings` (`agent`);--> statement-breakpoint
CREATE INDEX `idx_review_findings_iteration` ON `review_findings` (`ticket_id`,`iteration`);--> statement-breakpoint
CREATE TABLE `ticket_workflow_state` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`current_phase` text DEFAULT 'implementation' NOT NULL,
	`review_iteration` integer DEFAULT 0,
	`findings_count` integer DEFAULT 0,
	`findings_fixed` integer DEFAULT 0,
	`demo_generated` integer DEFAULT false,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_workflow_state_ticket_id_unique` ON `ticket_workflow_state` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_workflow_state_ticket` ON `ticket_workflow_state` (`ticket_id`);--> statement-breakpoint
CREATE INDEX `idx_ticket_workflow_state_phase` ON `ticket_workflow_state` (`current_phase`);