ALTER TABLE `epic_workflow_state` ADD `worktree_path` text;--> statement-breakpoint
ALTER TABLE `epic_workflow_state` ADD `worktree_created_at` text;--> statement-breakpoint
ALTER TABLE `epic_workflow_state` ADD `worktree_status` text;--> statement-breakpoint
CREATE INDEX `idx_epic_workflow_state_worktree_status` ON `epic_workflow_state` (`worktree_status`);