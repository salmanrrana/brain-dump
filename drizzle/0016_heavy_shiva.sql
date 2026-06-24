ALTER TABLE `projects`
  ADD `position` real DEFAULT 0 NOT NULL;
--> statement-breakpoint

-- Preserve existing insertion order while migrating older DBs by backfilling
-- position with a deterministic sequence ordered by created_at then rowid.
WITH ordered_projects AS (
  SELECT
    id,
    CAST(ROW_NUMBER() OVER (ORDER BY datetime(created_at), rowid) AS REAL) AS position
  FROM `projects`
)
UPDATE `projects`
SET `position` = (
  SELECT `ordered_projects`.`position`
  FROM `ordered_projects`
  WHERE `ordered_projects`.`id` = `projects`.`id`
);
--> statement-breakpoint
CREATE INDEX `idx_projects_position` ON `projects` (`position`);