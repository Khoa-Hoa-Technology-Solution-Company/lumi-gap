-- Add to canonical tasks. IDs, comments, revisions and contribution references survive.
ALTER TABLE projects ADD COLUMN task_board_version integer NOT NULL DEFAULT 1 CHECK(task_board_version > 0);
CREATE TYPE "ProjectTaskPriority" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
ALTER TABLE project_tasks
  ADD COLUMN priority "ProjectTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN parent_task_id uuid,
  ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(checklist)='array' AND jsonb_array_length(checklist)<=50),
  ADD COLUMN completed_by_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT project_tasks_parent_scope_fk FOREIGN KEY(parent_task_id,project_id) REFERENCES project_tasks(id,project_id) ON DELETE RESTRICT,
  ADD CONSTRAINT project_tasks_not_own_parent CHECK(parent_task_id IS DISTINCT FROM id);
WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY project_id,status ORDER BY created_at DESC,id DESC)-1 AS rank FROM project_tasks)
UPDATE project_tasks t SET sort_order=ranked.rank FROM ranked WHERE t.id=ranked.id;
-- Existing deadlines retain their recorded calendar date. Future writes also normalize to UTC midnight.
UPDATE project_tasks SET due_at=date_trunc('day',due_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE due_at IS NOT NULL;
CREATE INDEX project_tasks_board_idx ON project_tasks(project_id,deleted_at,status,sort_order,id);
CREATE INDEX project_tasks_parent_idx ON project_tasks(project_id,parent_task_id,deleted_at);
