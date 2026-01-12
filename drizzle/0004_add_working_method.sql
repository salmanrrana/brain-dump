-- Add working_method column to projects table
-- Values: 'claude-code', 'vscode', 'auto' (default)
ALTER TABLE projects ADD COLUMN working_method TEXT DEFAULT 'auto';
