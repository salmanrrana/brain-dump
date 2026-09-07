ALTER TABLE `verification_jobs` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `verification_jobs` ADD `actor` text;--> statement-breakpoint
ALTER TABLE `verification_jobs` ADD `provider_source` text;--> statement-breakpoint
ALTER TABLE `verification_jobs` ADD `execution_surface` text;--> statement-breakpoint
ALTER TABLE `verification_jobs` ADD `worker_id` text;--> statement-breakpoint
ALTER TABLE `verification_jobs` ADD `code_git_sha` text;--> statement-breakpoint
ALTER TABLE `verification_runs` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `verification_runs` ADD `actor` text;--> statement-breakpoint
ALTER TABLE `verification_runs` ADD `provider_source` text;--> statement-breakpoint
ALTER TABLE `verification_runs` ADD `execution_surface` text;--> statement-breakpoint
ALTER TABLE `verification_runs` ADD `worker_id` text;--> statement-breakpoint
ALTER TABLE `verification_runs` ADD `code_git_sha` text;