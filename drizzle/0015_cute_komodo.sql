ALTER TABLE `token_usage` ADD `source_ref` text;--> statement-breakpoint
ALTER TABLE `token_usage` ADD `provider_event_start` text;--> statement-breakpoint
ALTER TABLE `token_usage` ADD `provider_event_end` text;--> statement-breakpoint
CREATE INDEX `idx_token_usage_source_ref` ON `token_usage` (`source_ref`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_token_usage_source_session_model` ON `token_usage` (`telemetry_session_id`,`source_ref`,`model`) WHERE "token_usage"."source_ref" IS NOT NULL AND "token_usage"."telemetry_session_id" IS NOT NULL;