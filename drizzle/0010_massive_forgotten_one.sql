CREATE TABLE `epic_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`epic_id` text NOT NULL,
	`content` text NOT NULL,
	`author` text,
	`type` text,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`epic_id`) REFERENCES `epics`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_epic_comments_epic` ON `epic_comments` (`epic_id`);--> statement-breakpoint
CREATE INDEX `idx_epic_comments_created` ON `epic_comments` (`created_at`);