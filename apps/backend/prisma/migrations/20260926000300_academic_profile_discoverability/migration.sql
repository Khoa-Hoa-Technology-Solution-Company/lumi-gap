ALTER TABLE "academic_profiles"
  ADD COLUMN "show_in_researcher_search" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "allow_collaboration_requests" BOOLEAN NOT NULL DEFAULT TRUE;
