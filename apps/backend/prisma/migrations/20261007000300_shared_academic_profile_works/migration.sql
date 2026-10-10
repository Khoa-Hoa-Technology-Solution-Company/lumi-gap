-- Extend the existing featured-work collection; preserve existing paper references.
ALTER TABLE academic_featured_works
  ADD COLUMN kind varchar(32) NOT NULL DEFAULT 'PAPER',
  ADD COLUMN project_id uuid,
  ADD COLUMN submission_id uuid,
  ADD COLUMN report_id uuid,
  ADD COLUMN gap_id uuid;
ALTER TABLE academic_featured_works ADD CONSTRAINT academic_featured_work_target_check
  CHECK (num_nonnulls(paper_id, project_id, submission_id, report_id, gap_id) <= 1);
