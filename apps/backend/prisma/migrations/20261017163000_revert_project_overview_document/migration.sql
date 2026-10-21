-- Revert the canceled overview document feature while preserving migration history.
ALTER TABLE projects
  DROP COLUMN overview_goals,
  DROP COLUMN overview_context,
  DROP COLUMN overview_progress;
