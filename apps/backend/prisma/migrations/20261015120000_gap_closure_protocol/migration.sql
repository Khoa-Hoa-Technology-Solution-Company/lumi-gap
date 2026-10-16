-- Gap Closure Protocol (docs/gap-closure-protocol.md): a gap is only called open after a logged search,
-- a rubric-based screening of the documents found, and a false-novelty bound from coverage and calibration.

ALTER TABLE "research_gaps" ADD COLUMN "closure_status" VARCHAR(24) NOT NULL DEFAULT 'NOT_CHECKED';
ALTER TABLE "research_gaps" ADD COLUMN "question_facets" JSONB;
ALTER TABLE "research_gaps" ADD COLUMN "latest_closure_check_id" UUID;

-- CreateTable
CREATE TABLE "gap_closure_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "target_kind" VARCHAR(24) NOT NULL,
    "target_id" UUID NOT NULL,
    "protocol_version" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    "question" TEXT NOT NULL,
    "facets" JSONB NOT NULL DEFAULT '{}',
    "queries" JSONB NOT NULL DEFAULT '[]',
    "year_from" INTEGER,
    "year_to" INTEGER,
    "judge_kind" VARCHAR(16),
    "coverage_check_id" UUID,
    "calibration_id" UUID,
    "delta" DOUBLE PRECISION,
    "eps_hat" DOUBLE PRECISION,
    "p_hat" DOUBLE PRECISION,
    "bound" DOUBLE PRECISION,
    "max_false_novelty" DOUBLE PRECISION,
    "decision" VARCHAR(24),
    "decision_reasons" JSONB NOT NULL DEFAULT '[]',
    "witness_document_id" UUID,
    "corroborated" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "created_by_id" UUID NOT NULL,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "credit_transaction_id" UUID,
    "credit_cost" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gap_closure_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gap_closure_checks_target_kind_check" CHECK ("target_kind" IN ('GAP', 'CALIBRATION_QUESTION')),
    CONSTRAINT "gap_closure_checks_status_check" CHECK ("status" IN ('QUEUED', 'SEARCHING', 'SCREENING', 'DECIDED', 'FAILED')),
    CONSTRAINT "gap_closure_checks_decision_check" CHECK ("decision" IS NULL OR "decision" IN ('CLOSED', 'OPEN_CERTIFIED', 'ABSTAIN'))
);

-- CreateTable
CREATE TABLE "gap_closure_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "check_id" UUID NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "paper_id" UUID,
    "openalex_id" TEXT,
    "doi" TEXT,
    "title" TEXT NOT NULL,
    "abstract_text" TEXT,
    "publication_year" INTEGER,
    "retrieved_from" VARCHAR(16) NOT NULL,
    "query_index" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "ai_label" VARCHAR(16),
    "ai_quote" TEXT,
    "ai_facets" JSONB,
    "ai_quote_verified" BOOLEAN NOT NULL DEFAULT false,
    "human_label" VARCHAR(16),
    "human_quote" TEXT,
    "human_facets" JSONB,
    "reviewer_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "second_label" VARCHAR(16),
    "second_reviewer_id" UUID,
    "second_reviewed_at" TIMESTAMPTZ(6),
    "limitation_statement" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gap_closure_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gap_closure_documents_retrieved_from_check" CHECK ("retrieved_from" IN ('LOCAL', 'OPENALEX')),
    CONSTRAINT "gap_closure_documents_ai_label_check" CHECK ("ai_label" IS NULL OR "ai_label" IN ('ANSWERS', 'PARTIAL', 'UNRELATED')),
    CONSTRAINT "gap_closure_documents_human_label_check" CHECK ("human_label" IS NULL OR "human_label" IN ('ANSWERS', 'PARTIAL', 'UNRELATED')),
    CONSTRAINT "gap_closure_documents_second_label_check" CHECK ("second_label" IS NULL OR "second_label" IN ('ANSWERS', 'PARTIAL', 'UNRELATED'))
);

-- CreateTable
CREATE TABLE "coverage_checks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic" VARCHAR(300) NOT NULL,
    "normalized_topic" VARCHAR(300) NOT NULL,
    "project_id" UUID,
    "reference_source" TEXT NOT NULL,
    "m" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "p_hat" DOUBLE PRECISION NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "coverage_checks_counts_check" CHECK ("m" > 0 AND "x" >= 0 AND "x" <= "m")
);

-- CreateTable
CREATE TABLE "coverage_check_items" (
    "coverage_check_id" UUID NOT NULL,
    "doi" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT,
    "found_local" BOOLEAN NOT NULL,
    "found_openalex" BOOLEAN NOT NULL,
    "paper_id" UUID,
    "openalex_id" TEXT,

    CONSTRAINT "coverage_check_items_pkey" PRIMARY KEY ("coverage_check_id", "doi")
);

-- CreateTable
CREATE TABLE "closure_calibrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "domain" VARCHAR(200) NOT NULL,
    "judge_kind" VARCHAR(16) NOT NULL,
    "protocol_version" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "delta" DOUBLE PRECISION NOT NULL,
    "n" INTEGER NOT NULL DEFAULT 0,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "eps_hat" DOUBLE PRECISION,
    "created_by_id" UUID NOT NULL,
    "computed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closure_calibrations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "closure_calibrations_judge_kind_check" CHECK ("judge_kind" IN ('AI', 'HUMAN')),
    CONSTRAINT "closure_calibrations_status_check" CHECK ("status" IN ('DRAFT', 'RUNNING', 'COMPUTED'))
);

-- CreateTable
CREATE TABLE "calibration_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calibration_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "facets" JSONB NOT NULL DEFAULT '{}',
    "witness_doi" TEXT NOT NULL,
    "witness_quote" TEXT,
    "label_source" VARCHAR(24) NOT NULL,
    "label_source_ref" TEXT,
    "result" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "closure_check_id" UUID,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "calibration_questions_label_source_check" CHECK ("label_source" IN ('EXPERT_VALIDATION', 'SURVEY')),
    CONSTRAINT "calibration_questions_result_check" CHECK ("result" IN ('PENDING', 'FOUND', 'MISSED'))
);

-- CreateIndex
CREATE INDEX "research_gaps_closure_status_idx" ON "research_gaps"("closure_status");
CREATE INDEX "gap_closure_checks_target_kind_target_id_created_at_idx" ON "gap_closure_checks"("target_kind", "target_id", "created_at");
CREATE INDEX "gap_closure_checks_status_updated_at_idx" ON "gap_closure_checks"("status", "updated_at");
CREATE UNIQUE INDEX "gap_closure_documents_check_id_dedupe_key_key" ON "gap_closure_documents"("check_id", "dedupe_key");
CREATE INDEX "gap_closure_documents_paper_id_idx" ON "gap_closure_documents"("paper_id");
CREATE INDEX "coverage_checks_normalized_topic_created_at_idx" ON "coverage_checks"("normalized_topic", "created_at");
CREATE INDEX "coverage_checks_project_id_idx" ON "coverage_checks"("project_id");
CREATE INDEX "closure_calibrations_domain_judge_kind_idx" ON "closure_calibrations"("domain", "judge_kind");
CREATE INDEX "calibration_questions_calibration_id_idx" ON "calibration_questions"("calibration_id");

-- AddForeignKey
ALTER TABLE "research_gaps" ADD CONSTRAINT "research_gaps_latest_closure_check_id_fkey" FOREIGN KEY ("latest_closure_check_id") REFERENCES "gap_closure_checks"("id") ON DELETE SET NULL;
ALTER TABLE "gap_closure_checks" ADD CONSTRAINT "gap_closure_checks_coverage_check_id_fkey" FOREIGN KEY ("coverage_check_id") REFERENCES "coverage_checks"("id") ON DELETE SET NULL;
ALTER TABLE "gap_closure_checks" ADD CONSTRAINT "gap_closure_checks_calibration_id_fkey" FOREIGN KEY ("calibration_id") REFERENCES "closure_calibrations"("id") ON DELETE SET NULL;
ALTER TABLE "gap_closure_checks" ADD CONSTRAINT "gap_closure_checks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "gap_closure_checks" ADD CONSTRAINT "gap_closure_checks_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "gap_closure_documents" ADD CONSTRAINT "gap_closure_documents_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "gap_closure_checks"("id") ON DELETE CASCADE;
ALTER TABLE "gap_closure_documents" ADD CONSTRAINT "gap_closure_documents_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "gap_closure_documents" ADD CONSTRAINT "gap_closure_documents_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "gap_closure_documents" ADD CONSTRAINT "gap_closure_documents_second_reviewer_id_fkey" FOREIGN KEY ("second_reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "gap_closure_checks" ADD CONSTRAINT "gap_closure_checks_witness_document_id_fkey" FOREIGN KEY ("witness_document_id") REFERENCES "gap_closure_documents"("id") ON DELETE SET NULL;
ALTER TABLE "coverage_checks" ADD CONSTRAINT "coverage_checks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "coverage_checks" ADD CONSTRAINT "coverage_checks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "coverage_check_items" ADD CONSTRAINT "coverage_check_items_coverage_check_id_fkey" FOREIGN KEY ("coverage_check_id") REFERENCES "coverage_checks"("id") ON DELETE CASCADE;
ALTER TABLE "coverage_check_items" ADD CONSTRAINT "coverage_check_items_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL;
ALTER TABLE "closure_calibrations" ADD CONSTRAINT "closure_calibrations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE;
ALTER TABLE "calibration_questions" ADD CONSTRAINT "calibration_questions_calibration_id_fkey" FOREIGN KEY ("calibration_id") REFERENCES "closure_calibrations"("id") ON DELETE CASCADE;
ALTER TABLE "calibration_questions" ADD CONSTRAINT "calibration_questions_closure_check_id_fkey" FOREIGN KEY ("closure_check_id") REFERENCES "gap_closure_checks"("id") ON DELETE SET NULL;
ALTER TABLE "calibration_questions" ADD CONSTRAINT "calibration_questions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE;
