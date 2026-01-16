-- Add ralph_timeout column to settings table
-- Default: 3600 seconds (1 hour)
ALTER TABLE `settings` ADD `ralph_timeout` integer DEFAULT 3600;
