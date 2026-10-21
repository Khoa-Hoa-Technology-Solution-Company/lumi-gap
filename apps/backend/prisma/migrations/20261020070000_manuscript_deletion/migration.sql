ALTER TABLE "draft_workspaces" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);
CREATE INDEX "draft_workspaces_active_latex_idx"
  ON "draft_workspaces" ("project_id", "updated_at" DESC, "id")
  WHERE "writing_mode" = 'LATEX' AND "deleted_at" IS NULL;
