-- Add Docker runtime settings columns
ALTER TABLE `settings` ADD `docker_runtime` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `docker_socket_path` text;
