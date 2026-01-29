ALTER TABLE `settings` ADD `enable_context_aware_tool_filtering` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_tool_mode` text DEFAULT 'auto';