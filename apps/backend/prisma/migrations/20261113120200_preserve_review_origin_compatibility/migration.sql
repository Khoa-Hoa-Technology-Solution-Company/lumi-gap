-- Compatibility guard for installations that already have external or manager requests.
-- Reassert the complete additive origin domain without changing historical rows.
BEGIN;
ALTER TABLE review_requests DROP CONSTRAINT IF EXISTS review_request_origin_check;
ALTER TABLE review_requests ADD CONSTRAINT review_request_origin_check
 CHECK (origin IN ('DIRECT_INVITATION','OPEN_OPPORTUNITY','EXTERNAL_INVITATION','MANAGER_ASSIGNMENT','MENTOR_GUIDANCE'));
COMMIT;
