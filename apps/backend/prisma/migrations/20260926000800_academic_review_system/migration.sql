ALTER TABLE "submissions"
  ADD COLUMN "source_report_id" UUID;

CREATE UNIQUE INDEX "submissions_source_report_id_key" ON "submissions"("source_report_id");
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_source_report_id_fkey"
  FOREIGN KEY ("source_report_id") REFERENCES "reports"("id") ON DELETE SET NULL;

ALTER TABLE "submission_revisions"
  ALTER COLUMN "storage_uri" DROP NOT NULL,
  ALTER COLUMN "checksum_sha256" DROP NOT NULL,
  ALTER COLUMN "original_file_name" DROP NOT NULL,
  ALTER COLUMN "size_bytes" SET DEFAULT 0,
  ADD COLUMN "content_snapshot" TEXT,
  ADD COLUMN "content_type" VARCHAR(16) NOT NULL DEFAULT 'PDF';

ALTER TABLE "submission_revisions" ADD CONSTRAINT "submission_revisions_content_type_check"
  CHECK ("content_type" IN ('PDF', 'MARKDOWN'));

ALTER TABLE "review_templates"
  ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "owner_id" UUID,
  ADD COLUMN "project_id" UUID,
  ADD COLUMN "artifact_type" VARCHAR(40),
  ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "active_version_id" UUID;

CREATE TABLE "review_template_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "template_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "review_mode" VARCHAR(32) NOT NULL,
  "description" TEXT,
  "guidelines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  CONSTRAINT "review_template_versions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "review_template_versions" (
  "template_id", "version_number", "review_mode", "description", "guidelines", "status", "created_at", "published_at"
)
SELECT
  "id", GREATEST("version", 1), 'STRUCTURED_REVIEW', "description", ARRAY[]::TEXT[], 'PUBLISHED', "created_at", "created_at"
FROM "review_templates";

UPDATE "review_templates" AS template
SET "active_version_id" = version."id"
FROM "review_template_versions" AS version
WHERE version."template_id" = template."id";

ALTER TABLE "review_criteria"
  ADD COLUMN "version_id" UUID,
  ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "allow_not_applicable" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "review_criteria" AS criterion
SET "version_id" = version."id"
FROM "review_template_versions" AS version
WHERE version."template_id" = criterion."template_id";

ALTER TABLE "review_criteria" ALTER COLUMN "version_id" SET NOT NULL;

DROP INDEX IF EXISTS "review_criteria_template_id_key_key";
CREATE UNIQUE INDEX "review_criteria_version_id_key_key" ON "review_criteria"("version_id", "key");
CREATE INDEX "review_criteria_version_id_order_idx" ON "review_criteria"("version_id", "order");

CREATE TABLE "review_criterion_levels" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "criterion_id" UUID NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "score" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_criterion_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "submission_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "requester_id" UUID NOT NULL,
  "template_version_id" UUID NOT NULL,
  "artifact_revision_id" UUID NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  "message" TEXT,
  "due_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reviewer_assignments"
  ADD COLUMN "review_request_id" UUID;

DROP INDEX IF EXISTS "reviewer_assignments_submission_id_reviewer_id_key";
CREATE UNIQUE INDEX "reviewer_assignments_review_request_id_key" ON "reviewer_assignments"("review_request_id");
CREATE INDEX "reviewer_assignments_submission_id_status_idx" ON "reviewer_assignments"("submission_id", "status");

ALTER TABLE "human_reviews"
  ADD COLUMN "round_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "template_version_id" UUID,
  ADD COLUMN "key_strengths" TEXT,
  ADD COLUMN "key_concerns" TEXT,
  ADD COLUMN "overall_assessment" VARCHAR(24),
  ADD COLUMN "weighted_score" DOUBLE PRECISION;

DROP INDEX IF EXISTS "human_reviews_assignment_id_key";
CREATE UNIQUE INDEX "human_reviews_assignment_id_round_number_key" ON "human_reviews"("assignment_id", "round_number");
CREATE INDEX "human_reviews_template_version_id_idx" ON "human_reviews"("template_version_id");

UPDATE "human_reviews" AS review
SET "template_version_id" = template."active_version_id"
FROM "review_templates" AS template
WHERE review."template_id" = template."id";

ALTER TABLE "review_responses"
  ADD COLUMN "assessment" VARCHAR(32),
  ADD COLUMN "performance_level_id" UUID,
  ADD COLUMN "score" DOUBLE PRECISION,
  ADD COLUMN "not_applicable" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "review_revision_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "review_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "priority" VARCHAR(16) NOT NULL DEFAULT 'MAJOR',
  "description" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_revision_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "review_revision_responses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "revision_item_id" UUID NOT NULL,
  "submission_revision_id" UUID NOT NULL,
  "response_text" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'ADDRESSED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "review_revision_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "review_template_versions_template_id_version_number_key" ON "review_template_versions"("template_id", "version_number");
CREATE INDEX "review_template_versions_template_id_status_version_number_idx" ON "review_template_versions"("template_id", "status", "version_number");
CREATE INDEX "review_templates_source_owner_id_project_id_status_idx" ON "review_templates"("source", "owner_id", "project_id", "status");
CREATE UNIQUE INDEX "review_criterion_levels_criterion_id_position_key" ON "review_criterion_levels"("criterion_id", "position");
CREATE INDEX "review_criterion_levels_criterion_id_idx" ON "review_criterion_levels"("criterion_id");
CREATE INDEX "review_requests_requester_id_status_updated_at_idx" ON "review_requests"("requester_id", "status", "updated_at");
CREATE INDEX "review_requests_project_id_status_created_at_idx" ON "review_requests"("project_id", "status", "created_at");
CREATE INDEX "review_requests_submission_id_status_idx" ON "review_requests"("submission_id", "status");
CREATE INDEX "review_requests_template_version_id_idx" ON "review_requests"("template_version_id");
CREATE UNIQUE INDEX "review_revision_items_review_id_position_key" ON "review_revision_items"("review_id", "position");
CREATE INDEX "review_revision_items_review_id_status_idx" ON "review_revision_items"("review_id", "status");
CREATE UNIQUE INDEX "review_revision_responses_revision_item_id_submission_revision_id_key" ON "review_revision_responses"("revision_item_id", "submission_revision_id");
CREATE INDEX "review_revision_responses_submission_revision_id_idx" ON "review_revision_responses"("submission_revision_id");

ALTER TABLE "review_templates" ADD CONSTRAINT "review_templates_source_check"
  CHECK ("source" IN ('SYSTEM', 'PERSONAL', 'PROJECT'));
ALTER TABLE "review_templates" ADD CONSTRAINT "review_templates_status_check"
  CHECK ("status" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE "review_template_versions" ADD CONSTRAINT "review_template_versions_mode_check"
  CHECK ("review_mode" IN ('GUIDED_FEEDBACK', 'STRUCTURED_REVIEW', 'RUBRIC_ASSESSMENT'));
ALTER TABLE "review_template_versions" ADD CONSTRAINT "review_template_versions_status_check"
  CHECK ("status" IN ('DRAFT', 'PUBLISHED'));
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_status_check"
  CHECK ("status" IN ('REQUESTED', 'ACCEPTED', 'IN_REVIEW', 'SUBMITTED', 'REVISION_REQUESTED', 'RESUBMITTED', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'));
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_overall_assessment_check"
  CHECK ("overall_assessment" IS NULL OR "overall_assessment" IN ('STRONG', 'MINOR_REVISION', 'MAJOR_REVISION', 'NOT_READY'));
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_assessment_check"
  CHECK ("assessment" IS NULL OR "assessment" IN ('MAJOR_ISSUES', 'NEEDS_IMPROVEMENT', 'ADEQUATE', 'STRONG', 'NOT_APPLICABLE'));
ALTER TABLE "review_revision_items" ADD CONSTRAINT "review_revision_items_priority_check"
  CHECK ("priority" IN ('MINOR', 'MAJOR'));
ALTER TABLE "review_revision_items" ADD CONSTRAINT "review_revision_items_status_check"
  CHECK ("status" IN ('OPEN', 'ADDRESSED', 'ACCEPTED', 'REOPENED'));
ALTER TABLE "review_revision_responses" ADD CONSTRAINT "review_revision_responses_status_check"
  CHECK ("status" IN ('ADDRESSED', 'ACCEPTED', 'REOPENED'));

ALTER TABLE "review_templates" ADD CONSTRAINT "review_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "review_templates" ADD CONSTRAINT "review_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "review_template_versions" ADD CONSTRAINT "review_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "review_templates"("id") ON DELETE CASCADE;
ALTER TABLE "review_template_versions" ADD CONSTRAINT "review_template_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "review_templates" ADD CONSTRAINT "review_templates_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "review_template_versions"("id") ON DELETE SET NULL;
ALTER TABLE "review_criteria" ADD CONSTRAINT "review_criteria_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "review_template_versions"("id") ON DELETE CASCADE;
ALTER TABLE "review_criterion_levels" ADD CONSTRAINT "review_criterion_levels_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "review_criteria"("id") ON DELETE CASCADE;
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE;
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "review_template_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_artifact_revision_id_fkey" FOREIGN KEY ("artifact_revision_id") REFERENCES "submission_revisions"("id") ON DELETE RESTRICT;
ALTER TABLE "reviewer_assignments" ADD CONSTRAINT "reviewer_assignments_review_request_id_fkey" FOREIGN KEY ("review_request_id") REFERENCES "review_requests"("id") ON DELETE CASCADE;
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "review_template_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "review_responses" ADD CONSTRAINT "review_responses_performance_level_id_fkey" FOREIGN KEY ("performance_level_id") REFERENCES "review_criterion_levels"("id") ON DELETE SET NULL;
ALTER TABLE "review_revision_items" ADD CONSTRAINT "review_revision_items_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "human_reviews"("id") ON DELETE CASCADE;
ALTER TABLE "review_revision_responses" ADD CONSTRAINT "review_revision_responses_revision_item_id_fkey" FOREIGN KEY ("revision_item_id") REFERENCES "review_revision_items"("id") ON DELETE CASCADE;
ALTER TABLE "review_revision_responses" ADD CONSTRAINT "review_revision_responses_submission_revision_id_fkey" FOREIGN KEY ("submission_revision_id") REFERENCES "submission_revisions"("id") ON DELETE RESTRICT;

INSERT INTO "review_templates" ("id", "name", "description", "submission_type", "source", "artifact_type", "status", "active", "version", "created_at", "updated_at") VALUES
  ('11000000-0000-4000-8000-000000000001', 'Research Proposal Review', 'Structured academic feedback for research proposals.', 'RESEARCH_PROPOSAL', 'SYSTEM', 'RESEARCH_PROPOSAL', 'PUBLISHED', TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('11000000-0000-4000-8000-000000000002', 'Research Gap Review', 'Evidence-focused review of a proposed research gap.', NULL, 'SYSTEM', 'GAP_ANALYSIS', 'PUBLISHED', TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('11000000-0000-4000-8000-000000000003', 'Literature Review', 'Structured assessment of literature-search and synthesis quality.', 'LITERATURE_REVIEW', 'SYSTEM', 'LITERATURE_REVIEW', 'PUBLISHED', TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('11000000-0000-4000-8000-000000000004', 'Manuscript Review', 'Structured academic review for a research manuscript.', 'RESEARCH_PAPER', 'SYSTEM', 'MANUSCRIPT', 'PUBLISHED', TRUE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "review_template_versions" ("id", "template_id", "version_number", "review_mode", "description", "guidelines", "status", "created_at", "published_at") VALUES
  ('12000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 1, 'STRUCTURED_REVIEW', 'Structured academic feedback for research proposals.', ARRAY['Base major concerns on specific evidence.','Explain why an issue affects research quality.','Focus on methodological and evidential validity.','Declare conflicts of interest.','Avoid unsupported personal judgments.'], 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('12000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 1, 'STRUCTURED_REVIEW', 'Evidence-focused review of a proposed research gap.', ARRAY['Treat AI-generated gap suggestions as candidate gaps, not facts.','Check supporting and counter-evidence.','Explain why an issue affects the gap claim.','Declare conflicts of interest.'], 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('12000000-0000-4000-8000-000000000003', '11000000-0000-4000-8000-000000000003', 1, 'STRUCTURED_REVIEW', 'Structured assessment of literature-search and synthesis quality.', ARRAY['Base concerns on traceable sources.','Evaluate coverage, selection and synthesis separately.','Identify likely bias or missing counter-evidence.','Avoid unsupported personal judgments.'], 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('12000000-0000-4000-8000-000000000004', '11000000-0000-4000-8000-000000000004', 1, 'STRUCTURED_REVIEW', 'Structured academic review for a research manuscript.', ARRAY['Base major concerns on specific manuscript evidence.','Focus on validity, contribution and reproducibility.','Separate presentation issues from methodological issues.','Declare conflicts of interest.'], 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "review_templates" SET "active_version_id" = CASE "id"
  WHEN '11000000-0000-4000-8000-000000000001' THEN '12000000-0000-4000-8000-000000000001'::UUID
  WHEN '11000000-0000-4000-8000-000000000002' THEN '12000000-0000-4000-8000-000000000002'::UUID
  WHEN '11000000-0000-4000-8000-000000000003' THEN '12000000-0000-4000-8000-000000000003'::UUID
  WHEN '11000000-0000-4000-8000-000000000004' THEN '12000000-0000-4000-8000-000000000004'::UUID
END
WHERE "id" IN ('11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000004');

INSERT INTO "review_criteria" ("id", "template_id", "version_id", "key", "label", "description", "order", "required", "allow_not_applicable", "created_at", "updated_at") VALUES
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','problem_clarity','Problem Clarity','Is the research problem specific, understandable and appropriately scoped?',0,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','literature_support','Literature Support','Does relevant literature support the proposal framing?',1,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','gap_justification','Research Gap Justification','Does the proposed gap follow from reviewed evidence?',2,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','question_quality','Research Question Quality','Are the questions focused, answerable and aligned?',3,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','methodology_fit','Methodology Fit','Is the proposed method suitable for the research questions?',4,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','evidence_support','Evidence Support','Are important claims grounded in suitable evidence?',5,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','feasibility','Feasibility','Can the study be completed with the proposed scope and resources?',6,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','threats_validity','Threats to Validity','Are major validity risks recognized and handled?',7,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','expected_contribution','Expected Contribution','Is the expected contribution clear and credible?',8,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','evidence_coverage','Evidence Coverage','Is the gap claim based on adequate evidence coverage?',0,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','literature_recency','Literature Recency','Does the evidence include sufficiently recent literature?',1,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','study_consistency','Consistency Across Studies','Is the claim consistent with the reviewed studies?',2,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','counter_evidence','Counter-evidence Considered','Has contradictory or limiting evidence been considered?',3,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','gap_specificity','Gap Specificity','Is the proposed gap precise and bounded?',4,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','significance','Research Significance','Would addressing the gap matter academically or practically?',5,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','feasibility','Research Feasibility','Can the gap be investigated with realistic methods and resources?',6,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','search_strategy','Search Strategy','Is the literature search transparent and reproducible?',0,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','selection_criteria','Screening / Selection Criteria','Are inclusion and exclusion decisions clear?',1,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','literature_coverage','Literature Coverage','Does the review cover the relevant body of work?',2,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','source_quality','Source Quality','Are source quality and relevance evaluated appropriately?',3,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','evidence_synthesis','Evidence Synthesis','Does the review synthesize rather than merely list studies?',4,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','bias_limitations','Bias / Limitations','Are selection bias and review limitations discussed?',5,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003','citation_quality','Citation Quality','Are citations accurate, relevant and traceable?',6,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','research_problem','Research Problem','Is the research problem clear and justified?',0,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','novelty_contribution','Novelty / Contribution','Is the claimed contribution credible and differentiated?',1,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','research_questions','Research Questions','Are research questions aligned and answerable?',2,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','methodological_rigor','Methodological Rigor','Are methods appropriate, transparent and rigorous?',3,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','results','Results','Do the results support the stated claims?',4,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','threats_validity','Threats to Validity','Are validity threats identified and handled?',5,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','discussion','Discussion','Does the discussion interpret findings responsibly?',6,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','reproducibility','Reproducibility','Is sufficient detail available to audit or reproduce the work?',7,TRUE,TRUE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','citation_quality','Citation Quality','Are relevant sources represented and cited responsibly?',8,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'11000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000004','presentation_clarity','Presentation / Clarity','Is the manuscript coherent and academically readable?',9,TRUE,FALSE,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("version_id", "key") DO NOTHING;
