-- Deleting a project must never silently delete its submissions and their peer-review history.
-- The API refuses such deletes (projectDeleteError); RESTRICT is the database-level backstop.
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_project_id_fkey";
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT;
