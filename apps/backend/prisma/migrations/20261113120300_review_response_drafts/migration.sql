BEGIN;
ALTER TABLE review_revision_responses DROP CONSTRAINT review_revision_responses_status_check;
ALTER TABLE review_revision_responses ADD CONSTRAINT review_revision_responses_status_check
 CHECK (status IN ('DRAFT','ADDRESSED','ACCEPTED','REOPENED'));
COMMIT;
