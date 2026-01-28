ALTER TABLE `projects` ADD `default_isolation_mode` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `worktree_location` text DEFAULT 'sibling';--> statement-breakpoint
ALTER TABLE `projects` ADD `worktree_base_path` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `max_worktrees` integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE `projects` ADD `auto_cleanup_worktrees` integer DEFAULT false;