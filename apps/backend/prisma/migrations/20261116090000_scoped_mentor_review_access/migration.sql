-- A review grant is bound to the accepted mentor policy and the assignment's pinned
-- revision. It adds no project-wide resource permissions and retains old reviews.
ALTER TABLE reviewer_assignments ADD COLUMN mentor_access_id uuid;
ALTER TABLE reviewer_assignments ADD CONSTRAINT reviewer_assignments_mentor_access_id_fkey
  FOREIGN KEY (mentor_access_id) REFERENCES mentor_access(id) ON DELETE SET NULL;
CREATE INDEX reviewer_assignments_mentor_access_id_idx ON reviewer_assignments(mentor_access_id);
