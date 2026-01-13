-- Create FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS tickets_fts USING fts5(
  title,
  description,
  tags,
  subtasks,
  content=tickets,
  content_rowid=rowid
);--> statement-breakpoint
-- Clear any existing FTS data before repopulating (for idempotency)
DELETE FROM tickets_fts;--> statement-breakpoint
-- Populate FTS table with existing data
INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
SELECT rowid, title, COALESCE(description, ''), COALESCE(tags, ''), COALESCE(subtasks, '')
FROM tickets;--> statement-breakpoint
-- Triggers to keep FTS in sync with tickets table
CREATE TRIGGER IF NOT EXISTS tickets_ai AFTER INSERT ON tickets BEGIN
  INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
  VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS tickets_ad AFTER DELETE ON tickets BEGIN
  INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
  VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
END;--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS tickets_au AFTER UPDATE ON tickets BEGIN
  INSERT INTO tickets_fts(tickets_fts, rowid, title, description, tags, subtasks)
  VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.description, ''), COALESCE(OLD.tags, ''), COALESCE(OLD.subtasks, ''));
  INSERT INTO tickets_fts(rowid, title, description, tags, subtasks)
  VALUES (NEW.rowid, NEW.title, COALESCE(NEW.description, ''), COALESCE(NEW.tags, ''), COALESCE(NEW.subtasks, ''));
END;
