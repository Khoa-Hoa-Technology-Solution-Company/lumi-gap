ALTER TABLE submission_revisions ADD COLUMN source_revision_id uuid;
ALTER TABLE submissions ADD COLUMN open_for_review boolean NOT NULL DEFAULT false;
ALTER TABLE submission_revisions ADD CONSTRAINT submission_revision_source_fk
  FOREIGN KEY (source_revision_id) REFERENCES submission_revisions(id) ON DELETE RESTRICT;
ALTER TABLE reviewer_assignments ADD COLUMN artifact_revision_id uuid;
ALTER TABLE reviewer_assignments ADD CONSTRAINT reviewer_assignment_revision_fk
  FOREIGN KEY (artifact_revision_id) REFERENCES submission_revisions(id) ON DELETE RESTRICT;
ALTER TABLE review_requests ADD COLUMN origin varchar(32) NOT NULL DEFAULT 'DIRECT_INVITATION';
ALTER TABLE review_requests ADD CONSTRAINT review_request_origin_check
  CHECK (origin IN ('DIRECT_INVITATION', 'OPEN_OPPORTUNITY', 'EXTERNAL_INVITATION', 'MANAGER_ASSIGNMENT'));
ALTER TABLE human_reviews ADD COLUMN reviewer_academic_role varchar(24);
-- Bind known assignments to evidence already stored; do not infer historical
-- human-review revision IDs from the submission's current version.
UPDATE reviewer_assignments a SET artifact_revision_id = r.artifact_revision_id
FROM review_requests r WHERE a.review_request_id = r.id;
UPDATE reviewer_assignments a SET artifact_revision_id = h.revision_id
FROM (SELECT DISTINCT ON (assignment_id) assignment_id, revision_id
      FROM human_reviews ORDER BY assignment_id, round_number DESC) h
WHERE a.id = h.assignment_id AND a.artifact_revision_id IS NULL;
UPDATE reviewer_assignments a SET artifact_revision_id = s.current_revision_id
FROM submissions s WHERE a.submission_id = s.id AND a.artifact_revision_id IS NULL;
CREATE INDEX human_reviews_revision_status_idx ON human_reviews(revision_id, status);
-- Previously auto-published reviews must follow the research artifact's access.
UPDATE research_contributions SET visibility = 'PRIVATE'
WHERE contribution_type = 'REVIEW' AND source_review_assignment_id IS NOT NULL;
