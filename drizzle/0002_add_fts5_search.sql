-- Create FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
  title,
  description,
  tags,
  subtasks,
  content=tickets,
  content_rowid=rowid
);--> statement-breakpoint
-- Only populate FTS table if it's empty (avoid race conditions)
-- This prevents data inconsistency during concurrent operations
INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
SELECT rowid, title, COALESCE(description, ''), COALESCE(tags, ''), COALESCE(subtasks, '')
FROM tickets
WHERE NOT EXISTS (SELECT 1 FROM tickets_fts LIMIT 1);--> statement-breakpoint
-- Triggers to keep FTS in sync with tickets table
-- Simplified to avoid conflicts with FTS5 virtual table constraints
CREATE TRIGGER IF NOT EXISTS tickets_ai AFTER INSERT ON tickets BEGIN
  INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
  VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS tickets_ad AFTER DELETE ON tickets BEGIN
  INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
  VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS tickets_au AFTER UPDATE ON tickets BEGIN
  -- First delete the old entry
  INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
  VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
  -- Then insert the new entry
  INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
  VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
END;
