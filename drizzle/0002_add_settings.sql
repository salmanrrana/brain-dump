-- Add settings table for app-wide preferences
CREATE TABLE IF NOT EXISTS `settings` (
  `id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
  `terminal_emulator` text,
  `created_at` text DEFAULT (datetime('now')) NOT NULL,
  `updated_at` text DEFAULT (datetime('now')) NOT NULL
);

-- Insert default settings row
INSERT OR IGNORE INTO `settings` (`id`) VALUES ('default');
