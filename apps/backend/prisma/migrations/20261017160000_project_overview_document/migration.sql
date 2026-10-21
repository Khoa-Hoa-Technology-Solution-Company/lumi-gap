-- Optional team overview text, independent of the detailed research plan.
ALTER TABLE projects
  ADD COLUMN overview_goals TEXT NOT NULL DEFAULT '',
  ADD COLUMN overview_context TEXT NOT NULL DEFAULT '',
  ADD COLUMN overview_progress TEXT NOT NULL DEFAULT '';

ALTER TABLE projects
  ADD CONSTRAINT projects_overview_goals_length CHECK (char_length(overview_goals) <= 10000),
  ADD CONSTRAINT projects_overview_context_length CHECK (char_length(overview_context) <= 10000),
  ADD CONSTRAINT projects_overview_progress_length CHECK (char_length(overview_progress) <= 10000);
