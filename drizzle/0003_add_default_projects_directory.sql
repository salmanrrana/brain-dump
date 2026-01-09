-- Add default projects directory to settings
ALTER TABLE `settings` ADD COLUMN `default_projects_directory` text;
