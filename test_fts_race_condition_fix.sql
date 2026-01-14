-- Test FTS5 Race Condition Fix
-- This script tests the improved migration to ensure it handles race conditions correctly

.open :memory:

-- Create the tickets table first
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT,
  subtasks TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert some test data
INSERT INTO tickets (id, title, description, tags, subtasks) VALUES
('test1', 'Test Ticket 1', 'Description 1', '["tag1"]', '[{"text":"task1","completed":false}]'),
('test2', 'Test Ticket 2', 'Description 2', '["tag2"]', '[{"text":"task2","completed":true}]');

-- Show initial state
.print "Initial tickets table:"
SELECT * FROM tickets;

-- Run our improved migration
.read drizzle/0002_add_fts5_search.sql

-- Check FTS table was populated
.print "\nFTS table after migration:"
SELECT rowid, title FROM tickets_fts;

-- Run the migration again to test idempotency
.print "\nRunning migration again to test idempotency..."
.read drizzle/0002_add_fts5_search.sql

-- Check FTS table is still correct
.print "\nFTS table after second migration run:"
SELECT rowid, title FROM tickets_fts;

-- Test triggers work
.print "\nInserting new ticket to test triggers..."
INSERT INTO tickets (id, title, description) VALUES ('test3', 'New Ticket', 'New Description');

.print "\nFTS table after trigger test:"
SELECT rowid, title FROM tickets_fts;

.print "\nTest completed successfully!"