-- pgvector must exist before the papers table declares vector(768).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(24) NOT NULL DEFAULT 'member',
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_papers" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "added_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_chat_messages" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" VARCHAR(16) NOT NULL DEFAULT 'private',
    "role" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "credit_transaction_id" UUID,
    "credit_cost" INTEGER,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "pinned_at" TIMESTAMPTZ(6),
    "pinned_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_chat_citations" (
    "message_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "project_chat_citations_pkey" PRIMARY KEY ("message_id","paper_id")
);

-- CreateTable
CREATE TABLE "project_team_messages" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "project_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by_id" UUID,
    "delete_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_team_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_team_message_reads" (
    "message_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_team_message_reads_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateTable
CREATE TABLE "project_contribution_proposals" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "project_id" UUID NOT NULL,
    "contributor_id" UUID NOT NULL,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "confirmation_required_from" VARCHAR(16) NOT NULL,
    "proposed_by_id" UUID NOT NULL,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "rejected_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_contribution_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_contribution_history" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "action" VARCHAR(24) NOT NULL,
    "actor_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_contribution_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "research_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'public',
    "rules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "owner_id" UUID NOT NULL,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "search_document" tsvector,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_memberships" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "community_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'member',
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "community_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_posts" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "author_id" UUID NOT NULL,
    "community_id" UUID,
    "research_gap_id" UUID,
    "linked_paper_id" UUID,
    "linked_research_gap_id" UUID,
    "linked_project_id" UUID,
    "type" VARCHAR(16) NOT NULL DEFAULT 'discussion',
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "accepted_comment_id" UUID,
    "score" INTEGER NOT NULL DEFAULT 0,
    "vote_score" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_post_papers" (
    "post_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "forum_post_papers_pkey" PRIMARY KEY ("post_id","paper_id")
);

-- CreateTable
CREATE TABLE "forum_comments" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "body" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "score" INTEGER NOT NULL DEFAULT 0,
    "vote_score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "forum_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_references" (
    "id" UUID NOT NULL,
    "post_id" UUID,
    "comment_id" UUID,
    "paper_id" UUID,
    "doi" TEXT,
    "url" TEXT,
    "title" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "forum_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_votes" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "post_id" UUID,
    "comment_id" UUID,
    "user_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "forum_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_content_reports" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "reporter_id" UUID NOT NULL,
    "post_id" UUID,
    "comment_id" UUID,
    "community_id" UUID,
    "reason" VARCHAR(32) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "moderation_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "forum_content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_openings" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "closes_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recruitment_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recruitment_applications" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "opening_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "cover_letter" TEXT NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(24) NOT NULL DEFAULT 'submitted',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recruitment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_workspaces" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "project_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "draft_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "draft_workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "workspace_sections" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "section_revisions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "workspace_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "change_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "section_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_comments" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "workspace_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "section_version" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "full_name" VARCHAR(300) NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'user',
    "academic_profile_type" VARCHAR(32),
    "avatar_url" TEXT,
    "institution" TEXT,
    "research_interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "points" INTEGER NOT NULL DEFAULT 0,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "penalty_points" INTEGER NOT NULL DEFAULT 0,
    "personal_gemini_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" VARCHAR(64),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_profiles" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "public_handle" VARCHAR(40),
    "cover_storage_key" VARCHAR(160),
    "cover_updated_at" TIMESTAMPTZ(6),
    "profile_visibility" VARCHAR(24) NOT NULL DEFAULT 'PUBLIC',
    "headline" VARCHAR(180),
    "biography" TEXT,
    "academic_title" VARCHAR(80),
    "affiliation_ror_id" VARCHAR(64),
    "affiliation_department" VARCHAR(200),
    "affiliation_position" VARCHAR(160),
    "affiliation_start_year" INTEGER,
    "institutional_email" VARCHAR(320),
    "institutional_email_verified_at" TIMESTAMPTZ(6),
    "expertise_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "research_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "support_availability" JSONB NOT NULL DEFAULT '{}',
    "review_availability" JSONB NOT NULL DEFAULT '{}',
    "verification_status" VARCHAR(32) NOT NULL DEFAULT 'SELF_DECLARED',
    "verification_requested_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "verified_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "rejected_by_id" UUID,
    "rejection_reason" TEXT,
    "verification_method" VARCHAR(120),
    "verification_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_profile_handles" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "handle" VARCHAR(40) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_profile_handles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_external_identities" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "provider" VARCHAR(40) NOT NULL,
    "external_id" VARCHAR(200),
    "profile_url" TEXT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
    "source" VARCHAR(24) NOT NULL DEFAULT 'SELF_ASSERTED',
    "linked_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "academic_external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_featured_works" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "paper_id" UUID,
    "doi" TEXT,
    "title" TEXT,
    "year" INTEGER,
    "source" VARCHAR(24) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "academic_featured_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_verification_evidence" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "value" TEXT,
    "status" VARCHAR(24) NOT NULL,
    "source" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "validated_at" TIMESTAMPTZ(6),

    CONSTRAINT "academic_verification_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_email_verification_challenges" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_email_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_institutions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "name" VARCHAR(200) NOT NULL,
    "ror_id" VARCHAR(64),
    "verification_policy" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trusted_institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trusted_institution_domains" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "domain" VARCHAR(255) NOT NULL,

    CONSTRAINT "trusted_institution_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "target_kind" VARCHAR(32),
    "target_legacy_mongo_id" VARCHAR(24),
    "target_uuid" UUID,
    "idempotency_key" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'applied',
    "refunded_transaction_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "order_code" BIGINT NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "payment_link_id" TEXT,
    "checkout_url" TEXT,
    "qr_code" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID,
    "role" VARCHAR(32),
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "paper_id" UUID,
    "target_kind" VARCHAR(32),
    "target_legacy_mongo_id" VARCHAR(24),
    "target_uuid" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id","user_id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "device_name" VARCHAR(120),
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "disabled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_logs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID,
    "query" TEXT NOT NULL,
    "mode" VARCHAR(32) NOT NULL,
    "result_count" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID,
    "action_name" TEXT NOT NULL,
    "target_table_name" TEXT,
    "target_record_id" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_tool_runs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "report_id" UUID,
    "user_id" UUID,
    "tool_name" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mcp_tool_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_explanations" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "topic" TEXT,
    "language" VARCHAR(8) NOT NULL,
    "year_from" INTEGER NOT NULL,
    "year_to" INTEGER NOT NULL,
    "scope_hash" TEXT NOT NULL,
    "scope_label" TEXT NOT NULL,
    "scope_filters" JSONB NOT NULL DEFAULT '{}',
    "explanation" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trend_explanations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_providers" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "provider_name" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "provider_kind" VARCHAR(32) NOT NULL DEFAULT 'academic-api',
    "provider_status" VARCHAR(16) NOT NULL DEFAULT 'disabled',
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_sync_configs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "provider_id" UUID NOT NULL,
    "created_by_id" UUID,
    "config_name" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "from_publication_year" INTEGER,
    "to_publication_year" INTEGER,
    "schedule_cron" TEXT,
    "config_status" VARCHAR(16) NOT NULL DEFAULT 'enabled',
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_sync_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_sync_runs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "sync_config_id" UUID,
    "provider_id" UUID NOT NULL,
    "run_status" VARCHAR(16) NOT NULL DEFAULT 'running',
    "search_text" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "total_fetched" INTEGER NOT NULL DEFAULT 0,
    "total_inserted" INTEGER NOT NULL DEFAULT 0,
    "total_updated" INTEGER NOT NULL DEFAULT 0,
    "total_duplicates" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openalex_ingest_campaigns" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "campaign_key" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL DEFAULT 'openalex',
    "campaign_kind" VARCHAR(16) NOT NULL,
    "state" VARCHAR(40) NOT NULL DEFAULT 'draft',
    "target_unique_works" INTEGER NOT NULL,
    "manifest" JSONB NOT NULL,
    "progress" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "completion_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "openalex_ingest_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openalex_ingest_partitions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "campaign_id" UUID NOT NULL,
    "partition_key" TEXT NOT NULL,
    "cohort_id" TEXT NOT NULL,
    "stratum_key" TEXT NOT NULL,
    "filter_expression" TEXT NOT NULL,
    "planned_population" INTEGER NOT NULL,
    "target_count" INTEGER NOT NULL,
    "selection_method" VARCHAR(24) NOT NULL,
    "seed" INTEGER,
    "state" VARCHAR(24) NOT NULL DEFAULT 'planned',
    "checkpoint_cursor" TEXT,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "committed_attempts" INTEGER NOT NULL DEFAULT 0,
    "checkpoint_version" INTEGER NOT NULL DEFAULT 0,
    "lease_owner_id" TEXT,
    "lease_expires_at" TIMESTAMPTZ(6),
    "lease_heartbeat_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "openalex_ingest_partitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openalex_ingest_page_attempts" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "campaign_id" UUID NOT NULL,
    "partition_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "cursor_before" TEXT,
    "cursor_after" TEXT,
    "request_fingerprint" TEXT NOT NULL,
    "response_hash" TEXT,
    "state" VARCHAR(24) NOT NULL DEFAULT 'started',
    "expected_result_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "committed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "openalex_ingest_page_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingest_dead_letters" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "campaign_id" UUID NOT NULL,
    "partition_id" UUID,
    "attempt_id" UUID,
    "state" VARCHAR(16) NOT NULL DEFAULT 'open',
    "reason_code" TEXT NOT NULL,
    "source_identity" TEXT,
    "request_fingerprint" TEXT,
    "payload_hash" TEXT,
    "details" JSONB,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ingest_dead_letters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_validation_runs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "campaign_id" UUID NOT NULL,
    "state" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "overall_status" VARCHAR(24),
    "decision" VARCHAR(32),
    "validator_version" TEXT NOT NULL,
    "snapshot_committed_pages" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "active_key" TEXT,
    "execution_token" TEXT,
    "metrics" JSONB,
    "checks" JSONB NOT NULL DEFAULT '[]',
    "failure_reason" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "corpus_validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "openalex_refresh_watermarks" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "refresh_policy_key" TEXT NOT NULL,
    "provider_name" TEXT NOT NULL DEFAULT 'openalex',
    "last_successful_at" TIMESTAMPTZ(6),
    "source_updated_since" TIMESTAMPTZ(6),
    "overlap_hours" INTEGER NOT NULL DEFAULT 72,
    "last_campaign_id" UUID,
    "state" VARCHAR(16) NOT NULL DEFAULT 'idle',
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "openalex_refresh_watermarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_cohort_memberships" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "paper_id" UUID NOT NULL,
    "cohort_id" TEXT NOT NULL,
    "campaign_id" UUID NOT NULL,
    "stratum_key" TEXT NOT NULL,
    "sampling_weight" DOUBLE PRECISION,
    "selection_method" VARCHAR(32) NOT NULL,
    "policy_version" TEXT NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "source_population" INTEGER,
    "selected_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_cohort_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "paper_id" UUID,
    "report_id" UUID,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "topic" TEXT,
    "query" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
    "markdown" TEXT,
    "research_gap_snapshots" JSONB NOT NULL DEFAULT '[]',
    "model_version" TEXT NOT NULL DEFAULT '',
    "prompt_version" TEXT NOT NULL DEFAULT '',
    "cache_key" TEXT,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "scope_filters" JSONB NOT NULL DEFAULT '{}',
    "language" VARCHAR(8) NOT NULL DEFAULT 'auto',
    "deep_analysis" BOOLEAN NOT NULL DEFAULT false,
    "fast" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "credit_transaction_id" UUID,
    "credit_cost" INTEGER,
    "credit_action" TEXT,
    "credit_refunded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_papers" (
    "report_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "report_papers_pkey" PRIMARY KEY ("report_id","paper_id","kind")
);

-- CreateTable
CREATE TABLE "rag_queries" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "query_text" TEXT NOT NULL,
    "top_k" INTEGER NOT NULL,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "embedding_ms" INTEGER NOT NULL DEFAULT 0,
    "search_ms" INTEGER NOT NULL DEFAULT 0,
    "llm_ms" INTEGER NOT NULL DEFAULT 0,
    "cache_hit" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rag_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rag_query_results" (
    "query_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "rag_query_results_pkey" PRIMARY KEY ("query_id","paper_id")
);

-- CreateTable
CREATE TABLE "gap_analyses" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "topic" TEXT NOT NULL,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "evidence_mode" VARCHAR(16) NOT NULL DEFAULT 'auto',
    "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "prompt_version" TEXT NOT NULL DEFAULT '',
    "model_version" TEXT NOT NULL DEFAULT '',
    "credit_transaction_id" UUID,
    "credit_cost" INTEGER,
    "credit_action" TEXT,
    "credit_refunded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gap_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gap_analysis_papers" (
    "analysis_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "gap_analysis_papers_pkey" PRIMARY KEY ("analysis_id","paper_id")
);

-- CreateTable
CREATE TABLE "research_gaps" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "topic" TEXT NOT NULL,
    "normalized_topic" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "gap_type" VARCHAR(64) NOT NULL DEFAULT 'OTHER',
    "scope" TEXT,
    "established_knowledge" TEXT,
    "observed_limitation" TEXT,
    "missing_evidence" TEXT,
    "significance_explanation" TEXT,
    "suggested_research_question" TEXT,
    "validation_status" VARCHAR(32) NOT NULL DEFAULT 'CANDIDATE',
    "gap_confidence" VARCHAR(16) NOT NULL DEFAULT 'LOW',
    "research_priority" VARCHAR(16) NOT NULL DEFAULT 'MODERATE',
    "origin" VARCHAR(24) NOT NULL DEFAULT 'AI_ASSISTED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "probe" JSONB,
    "intersection_count" INTEGER,
    "parent_counts" JSONB,
    "parent_trend" JSONB,
    "evidence_confidence" DOUBLE PRECISION,
    "source" VARCHAR(16) NOT NULL,
    "source_report_id" UUID,
    "analysis_id" UUID,
    "user_id" UUID NOT NULL,
    "project_id" UUID,
    "corpus_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "research_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_gap_papers" (
    "gap_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "research_gap_papers_pkey" PRIMARY KEY ("gap_id","paper_id","kind")
);

-- CreateTable
CREATE TABLE "gap_directions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "gap_id" UUID NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "prompt_version" TEXT NOT NULL DEFAULT '',
    "evidence_hash" TEXT NOT NULL DEFAULT '',
    "credit_transaction_id" UUID,
    "credit_cost" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gap_directions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gap_direction_items" (
    "id" UUID NOT NULL,
    "directions_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "suggested_approach" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL,

    CONSTRAINT "gap_direction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gap_direction_papers" (
    "direction_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "gap_direction_papers_pkey" PRIMARY KEY ("direction_id","paper_id")
);

-- CreateTable
CREATE TABLE "gap_evidence_records" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "gap_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "evidence_kind" VARCHAR(16) NOT NULL,
    "evidence_type" VARCHAR(120),
    "excerpt" TEXT,
    "explanation" TEXT NOT NULL,
    "added_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gap_evidence_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gap_validations" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "gap_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "comment" TEXT NOT NULL,
    "suggested_changes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gap_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "literature_corpora" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "owner_id" UUID NOT NULL,
    "project_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "topic" VARCHAR(300) NOT NULL,
    "research_goal" TEXT,
    "domain" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "picoc" JSONB NOT NULL DEFAULT '{}',
    "search_strategy" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "literature_corpora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corpus_papers" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "corpus_id" UUID NOT NULL,
    "paper_id" UUID NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "exclusion_reason" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "added_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "corpus_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_evaluations" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "paper_id" UUID,
    "report_id" UUID,
    "gap_id" UUID,
    "relevance" INTEGER NOT NULL,
    "groundedness" INTEGER NOT NULL,
    "completeness" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "prompt_version" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quality_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ratings" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "paper_id" UUID,
    "report_id" UUID,
    "gap_id" UUID,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "abstract_text" TEXT,
    "submission_type" VARCHAR(40),
    "research_field" VARCHAR(200),
    "research_goal" TEXT,
    "research_questions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "claimed_research_gap" TEXT,
    "claimed_contribution" TEXT,
    "methodology" TEXT,
    "scope" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expected_review_workload" VARCHAR(160),
    "status" VARCHAR(32) NOT NULL DEFAULT 'submitted',
    "current_revision_number" INTEGER NOT NULL DEFAULT 1,
    "current_revision_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_authors" (
    "submission_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "submission_authors_pkey" PRIMARY KEY ("submission_id","user_id")
);

-- CreateTable
CREATE TABLE "submission_declared_conflicts" (
    "submission_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "submission_declared_conflicts_pkey" PRIMARY KEY ("submission_id","user_id")
);

-- CreateTable
CREATE TABLE "submission_revisions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "submission_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "response_to_review" TEXT,
    "storage_uri" TEXT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "submission_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviewer_assignments" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "submission_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "anonymous_code" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'assigned',
    "decision" VARCHAR(24),
    "review_text" TEXT,
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "conflict_checks" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reviewer_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_pre_reviews" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "submission_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "provider" VARCHAR(80),
    "model" VARCHAR(160),
    "status" VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
    "summary" TEXT,
    "goal_alignment" JSONB,
    "rq_coverage" JSONB NOT NULL DEFAULT '[]',
    "unsupported_claims" JSONB NOT NULL DEFAULT '[]',
    "citation_issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contribution_comparison" TEXT,
    "review_focus_areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "limitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw_structured_output" JSONB,
    "error_message" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_pre_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_conflicts" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "submission_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "reason" TEXT,
    "detected_by" VARCHAR(16) NOT NULL,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_templates" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "submission_type" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_criteria" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "template_id" UUID NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "weight" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_reviews" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "assignment_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "revision_id" UUID NOT NULL,
    "template_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "overall_comment" TEXT,
    "recommendation" VARCHAR(24),
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "human_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_responses" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "review_id" UUID NOT NULL,
    "criterion_key" VARCHAR(80) NOT NULL,
    "comment" TEXT NOT NULL,
    "evidence" TEXT,
    "rating" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "review_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_contributions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "contributor_id" UUID NOT NULL,
    "project_id" UUID,
    "submission_id" UUID,
    "contribution_type" VARCHAR(48) NOT NULL,
    "description" TEXT,
    "evidence" TEXT,
    "provenance" VARCHAR(32) NOT NULL,
    "verification_status" VARCHAR(32) NOT NULL,
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
    "verified_by_id" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "source_review_assignment_id" UUID,
    "source_project_contribution_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "research_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "owner_id" UUID NOT NULL,
    "project_id" UUID,
    "workspace_id" UUID,
    "job_type" VARCHAR(32) NOT NULL,
    "prompt" TEXT,
    "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "queue_job_id" TEXT,
    "cost_usd" DECIMAL(18,8),
    "latency_ms" INTEGER,
    "result_summary" TEXT,
    "error_code" VARCHAR(120),
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancel_requested_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_run_evidence" (
    "run_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ai_run_evidence_pkey" PRIMARY KEY ("run_id","evidence_id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "openalex_id" TEXT,
    "orcid" TEXT,
    "scholar_id" TEXT,
    "display_name" TEXT NOT NULL,
    "h_index" INTEGER,
    "cited_by_count" INTEGER NOT NULL DEFAULT 0,
    "works_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "author_affiliations" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "ror" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "author_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "openalex_id" TEXT,
    "eissn" TEXT,
    "crossref_id" TEXT,
    "name" TEXT NOT NULL,
    "publisher" TEXT,
    "country" TEXT,
    "type" VARCHAR(32) NOT NULL DEFAULT 'journal',
    "is_open_access" BOOLEAN NOT NULL DEFAULT false,
    "homepage_url" TEXT,
    "works_count" INTEGER NOT NULL DEFAULT 0,
    "cited_by_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_issns" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "issn" VARCHAR(32) NOT NULL,

    CONSTRAINT "journal_issns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "keyword_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_topics" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "parent_topic_id" UUID,
    "topic_name" TEXT NOT NULL,
    "description" TEXT,
    "research_field" TEXT,
    "openalex_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "research_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papers" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "doi" TEXT,
    "openalex_id" TEXT,
    "semantic_scholar_id" TEXT,
    "arxiv_id" TEXT,
    "pubmed_id" TEXT,
    "title" TEXT NOT NULL,
    "abstract_text" TEXT,
    "journal_id" UUID,
    "journal_name" TEXT,
    "publication_year" INTEGER NOT NULL,
    "publication_date" DATE,
    "paper_kind" VARCHAR(32) NOT NULL DEFAULT 'article',
    "language" VARCHAR(16) NOT NULL DEFAULT 'und',
    "open_access_status" VARCHAR(24) NOT NULL DEFAULT 'unknown',
    "open_access_url" TEXT,
    "paper_link" TEXT,
    "license_name" TEXT,
    "citation_count" INTEGER NOT NULL DEFAULT 0,
    "fwci" DOUBLE PRECISION,
    "citation_normalized_percentile" JSONB,
    "related_works_count" INTEGER NOT NULL DEFAULT 0,
    "primary_provider" VARCHAR(32) NOT NULL,
    "pdf_path" TEXT,
    "requested_by_id" UUID,
    "uploaded_by_id" UUID,
    "uploaded_at" TIMESTAMPTZ(6),
    "upload_rewarded_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "paper_status" VARCHAR(40) NOT NULL DEFAULT 'pending',
    "data_status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "data_quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "is_ai_analyzable" BOOLEAN NOT NULL DEFAULT false,
    "metadata_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duplicate_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "relevance_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prestige_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "utility_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quality_tier" INTEGER NOT NULL DEFAULT 0,
    "quality_tier_name" TEXT NOT NULL DEFAULT 'Invalid',
    "download_cost" INTEGER,
    "upload_credit_reward" INTEGER NOT NULL DEFAULT 0,
    "average_rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_ratings" INTEGER NOT NULL DEFAULT 0,
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(768),
    "embedding_model" TEXT,
    "embedding_version" TEXT,
    "embedding_dimensions" INTEGER,
    "embedding_updated_at" TIMESTAMPTZ(6),
    "referenced_works" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "related_works" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ai_score" JSONB,
    "ai_analysis" JSONB,
    "search_document" tsvector,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_authors" (
    "paper_id" UUID NOT NULL,
    "author_id" UUID,
    "display_name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "is_corresponding" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "paper_authors_pkey" PRIMARY KEY ("paper_id","position")
);

-- CreateTable
CREATE TABLE "paper_keywords" (
    "paper_id" UUID NOT NULL,
    "keyword_id" UUID,
    "keyword_name" TEXT NOT NULL,
    "detected_by" VARCHAR(24) NOT NULL DEFAULT 'openalex',
    "confidence" DOUBLE PRECISION,
    "position" INTEGER NOT NULL,

    CONSTRAINT "paper_keywords_pkey" PRIMARY KEY ("paper_id","position")
);

-- CreateTable
CREATE TABLE "paper_topics" (
    "paper_id" UUID NOT NULL,
    "topic_id" UUID,
    "openalex_topic_id" TEXT,
    "topic_name" TEXT NOT NULL,
    "detected_by" VARCHAR(24) NOT NULL DEFAULT 'openalex',
    "confidence" DOUBLE PRECISION,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "subfield_id" TEXT,
    "subfield_name" TEXT,
    "field_id" TEXT,
    "field_name" TEXT,
    "domain_id" TEXT,
    "domain_name" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "paper_topics_pkey" PRIMARY KEY ("paper_id","position")
);

-- CreateTable
CREATE TABLE "paper_identities" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "provider" VARCHAR(32) NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "paper_id" UUID NOT NULL,
    "first_seen_campaign_id" UUID,
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_source_records" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "paper_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "external_record_id" TEXT,
    "raw_metadata" JSONB,
    "metadata_hash" TEXT,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_quality_checks" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "paper_id" UUID NOT NULL,
    "has_title" BOOLEAN NOT NULL DEFAULT false,
    "has_abstract" BOOLEAN NOT NULL DEFAULT false,
    "has_doi" BOOLEAN NOT NULL DEFAULT false,
    "has_journal" BOOLEAN NOT NULL DEFAULT false,
    "has_publication_year" BOOLEAN NOT NULL DEFAULT false,
    "has_authors" BOOLEAN NOT NULL DEFAULT false,
    "has_open_access_url" BOOLEAN NOT NULL DEFAULT false,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "check_status" VARCHAR(16) NOT NULL DEFAULT 'fail',
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_quality_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_downloads" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "paper_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_translations" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "paper_id" UUID NOT NULL,
    "source_language" VARCHAR(24) NOT NULL,
    "target_language" VARCHAR(24) NOT NULL,
    "source_text_hash" TEXT NOT NULL,
    "translated_title" TEXT NOT NULL,
    "translated_abstract" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL,
    "provider_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_reviews" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "paper_id" UUID,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "strictness" VARCHAR(16) NOT NULL DEFAULT 'balanced',
    "model" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "recommendation" TEXT NOT NULL DEFAULT 'Borderline',
    "scores" JSONB NOT NULL DEFAULT '{}',
    "profile" JSONB NOT NULL DEFAULT '{}',
    "bilingual_review" JSONB NOT NULL DEFAULT '{}',
    "report_markdown" TEXT,
    "artifacts_dir" TEXT,
    "error_message" TEXT,
    "credits_charged" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_format_checks" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" VARCHAR(24),
    "user_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "preset" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "measurements" JSONB NOT NULL DEFAULT '{}',
    "report_markdown" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "paper_format_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_legacy_mongo_id_key" ON "projects"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "project_members_user_id_status_idx" ON "project_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE INDEX "project_papers_paper_id_idx" ON "project_papers"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_papers_project_id_paper_id_key" ON "project_papers"("project_id", "paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_chat_messages_legacy_mongo_id_key" ON "project_chat_messages"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "project_chat_messages_project_id_user_id_created_at_idx" ON "project_chat_messages"("project_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "project_chat_messages_project_id_scope_created_at_idx" ON "project_chat_messages"("project_id", "scope", "created_at");

-- CreateIndex
CREATE INDEX "project_chat_citations_paper_id_idx" ON "project_chat_citations"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_team_messages_legacy_mongo_id_key" ON "project_team_messages"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "project_team_messages_project_id_created_at_idx" ON "project_team_messages"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "project_team_messages_project_id_is_deleted_created_at_idx" ON "project_team_messages"("project_id", "is_deleted", "created_at");

-- CreateIndex
CREATE INDEX "project_team_messages_sender_id_idx" ON "project_team_messages"("sender_id");

-- CreateIndex
CREATE INDEX "project_team_message_reads_user_id_idx" ON "project_team_message_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_contribution_proposals_legacy_mongo_id_key" ON "project_contribution_proposals"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "project_contribution_proposals_project_id_created_at_idx" ON "project_contribution_proposals"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "project_contribution_proposals_contributor_id_status_idx" ON "project_contribution_proposals"("contributor_id", "status");

-- CreateIndex
CREATE INDEX "project_contribution_history_proposal_id_created_at_idx" ON "project_contribution_history"("proposal_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "communities_legacy_mongo_id_key" ON "communities"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "communities_visibility_idx" ON "communities"("visibility");

-- CreateIndex
CREATE INDEX "communities_owner_id_idx" ON "communities"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_memberships_legacy_mongo_id_key" ON "community_memberships"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "community_memberships_community_id_status_role_idx" ON "community_memberships"("community_id", "status", "role");

-- CreateIndex
CREATE INDEX "community_memberships_user_id_idx" ON "community_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_memberships_community_id_user_id_key" ON "community_memberships"("community_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "forum_posts_legacy_mongo_id_key" ON "forum_posts"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "forum_posts_community_id_status_created_at_idx" ON "forum_posts"("community_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "forum_posts_research_gap_id_status_created_at_idx" ON "forum_posts"("research_gap_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "forum_posts_type_status_created_at_idx" ON "forum_posts"("type", "status", "created_at");

-- CreateIndex
CREATE INDEX "forum_posts_tags_idx" ON "forum_posts" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "forum_post_papers_paper_id_idx" ON "forum_post_papers"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "forum_comments_legacy_mongo_id_key" ON "forum_comments"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "forum_comments_post_id_status_created_at_idx" ON "forum_comments"("post_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "forum_comments_author_id_idx" ON "forum_comments"("author_id");

-- CreateIndex
CREATE INDEX "forum_references_post_id_position_idx" ON "forum_references"("post_id", "position");

-- CreateIndex
CREATE INDEX "forum_references_comment_id_position_idx" ON "forum_references"("comment_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "forum_votes_legacy_mongo_id_key" ON "forum_votes"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "forum_votes_post_id_idx" ON "forum_votes"("post_id");

-- CreateIndex
CREATE INDEX "forum_votes_comment_id_idx" ON "forum_votes"("comment_id");

-- CreateIndex
CREATE INDEX "forum_votes_user_id_idx" ON "forum_votes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "forum_content_reports_legacy_mongo_id_key" ON "forum_content_reports"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "forum_content_reports_community_id_status_created_at_idx" ON "forum_content_reports"("community_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "forum_content_reports_reporter_id_status_idx" ON "forum_content_reports"("reporter_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_openings_legacy_mongo_id_key" ON "recruitment_openings"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "recruitment_openings_project_id_status_created_at_idx" ON "recruitment_openings"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_applications_legacy_mongo_id_key" ON "recruitment_applications"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "recruitment_applications_opening_id_status_created_at_idx" ON "recruitment_applications"("opening_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "recruitment_applications_project_id_idx" ON "recruitment_applications"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "recruitment_applications_opening_id_applicant_id_key" ON "recruitment_applications"("opening_id", "applicant_id");

-- CreateIndex
CREATE UNIQUE INDEX "draft_workspaces_legacy_mongo_id_key" ON "draft_workspaces"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "draft_workspaces_project_id_key" ON "draft_workspaces"("project_id");

-- CreateIndex
CREATE INDEX "draft_workspace_members_user_id_idx" ON "draft_workspace_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_sections_legacy_mongo_id_key" ON "workspace_sections"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "workspace_sections_workspace_id_order_created_at_idx" ON "workspace_sections"("workspace_id", "order", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "section_revisions_legacy_mongo_id_key" ON "section_revisions"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "section_revisions_workspace_id_idx" ON "section_revisions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "section_revisions_section_id_version_key" ON "section_revisions"("section_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_comments_legacy_mongo_id_key" ON "workspace_comments"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "workspace_comments_workspace_id_section_id_created_at_idx" ON "workspace_comments"("workspace_id", "section_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_legacy_mongo_id_key" ON "users"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_legacy_mongo_id_key" ON "refresh_tokens"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_profiles_legacy_mongo_id_key" ON "academic_profiles"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_profiles_user_id_key" ON "academic_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_profiles_public_handle_key" ON "academic_profiles"("public_handle");

-- CreateIndex
CREATE INDEX "academic_profiles_verification_status_verification_requeste_idx" ON "academic_profiles"("verification_status", "verification_requested_at");

-- CreateIndex
CREATE INDEX "academic_profiles_profile_visibility_verification_status_up_idx" ON "academic_profiles"("profile_visibility", "verification_status", "updated_at");

-- CreateIndex
CREATE INDEX "academic_profiles_affiliation_ror_id_idx" ON "academic_profiles"("affiliation_ror_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_profile_handles_legacy_mongo_id_key" ON "academic_profile_handles"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_profile_handles_handle_key" ON "academic_profile_handles"("handle");

-- CreateIndex
CREATE INDEX "academic_profile_handles_user_id_idx" ON "academic_profile_handles"("user_id");

-- CreateIndex
CREATE INDEX "academic_external_identities_provider_external_id_idx" ON "academic_external_identities"("provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "academic_external_identities_profile_id_provider_external_i_key" ON "academic_external_identities"("profile_id", "provider", "external_id");

-- CreateIndex
CREATE INDEX "academic_featured_works_profile_id_position_idx" ON "academic_featured_works"("profile_id", "position");

-- CreateIndex
CREATE INDEX "academic_verification_evidence_profile_id_created_at_idx" ON "academic_verification_evidence"("profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_email_verification_challenges_legacy_mongo_id_key" ON "academic_email_verification_challenges"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "academic_email_verification_challenges_expires_at_idx" ON "academic_email_verification_challenges"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_email_verification_challenges_user_id_email_key" ON "academic_email_verification_challenges"("user_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_institutions_legacy_mongo_id_key" ON "trusted_institutions"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "trusted_institutions_ror_id_idx" ON "trusted_institutions"("ror_id");

-- CreateIndex
CREATE INDEX "trusted_institutions_is_active_idx" ON "trusted_institutions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_institution_domains_domain_key" ON "trusted_institution_domains"("domain");

-- CreateIndex
CREATE INDEX "trusted_institution_domains_institution_id_idx" ON "trusted_institution_domains"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_legacy_mongo_id_key" ON "credit_transactions"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_transactions_idempotency_key_key" ON "credit_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "credit_transactions_user_id_created_at_idx" ON "credit_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "credit_transactions_target_kind_target_uuid_idx" ON "credit_transactions"("target_kind", "target_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_legacy_mongo_id_key" ON "payment_orders"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_order_code_key" ON "payment_orders"("order_code");

-- CreateIndex
CREATE INDEX "payment_orders_user_id_idx" ON "payment_orders"("user_id");

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_legacy_mongo_id_key" ON "notifications"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notifications_role_created_at_idx" ON "notifications"("role", "created_at");

-- CreateIndex
CREATE INDEX "notifications_target_kind_target_uuid_idx" ON "notifications"("target_kind", "target_uuid");

-- CreateIndex
CREATE INDEX "notification_reads_user_id_idx" ON "notification_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_legacy_mongo_id_key" ON "device_tokens"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_disabled_at_idx" ON "device_tokens"("user_id", "disabled_at");

-- CreateIndex
CREATE UNIQUE INDEX "search_logs_legacy_mongo_id_key" ON "search_logs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "search_logs_user_id_created_at_idx" ON "search_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "search_logs_created_at_idx" ON "search_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_legacy_mongo_id_key" ON "audit_logs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_name_created_at_idx" ON "audit_logs"("action_name", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_tool_runs_legacy_mongo_id_key" ON "mcp_tool_runs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "mcp_tool_runs_report_id_idx" ON "mcp_tool_runs"("report_id");

-- CreateIndex
CREATE INDEX "mcp_tool_runs_user_id_idx" ON "mcp_tool_runs"("user_id");

-- CreateIndex
CREATE INDEX "mcp_tool_runs_created_at_idx" ON "mcp_tool_runs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trend_explanations_legacy_mongo_id_key" ON "trend_explanations"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "trend_explanations_user_id_created_at_idx" ON "trend_explanations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "trend_explanations_user_id_topic_scope_hash_created_at_idx" ON "trend_explanations"("user_id", "topic", "scope_hash", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_providers_legacy_mongo_id_key" ON "api_providers"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_providers_provider_name_key" ON "api_providers"("provider_name");

-- CreateIndex
CREATE UNIQUE INDEX "api_sync_configs_legacy_mongo_id_key" ON "api_sync_configs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "api_sync_configs_provider_id_idx" ON "api_sync_configs"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_sync_runs_legacy_mongo_id_key" ON "api_sync_runs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "api_sync_runs_started_at_idx" ON "api_sync_runs"("started_at");

-- CreateIndex
CREATE INDEX "api_sync_runs_run_status_idx" ON "api_sync_runs"("run_status");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_ingest_campaigns_legacy_mongo_id_key" ON "openalex_ingest_campaigns"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_ingest_campaigns_campaign_key_key" ON "openalex_ingest_campaigns"("campaign_key");

-- CreateIndex
CREATE INDEX "openalex_ingest_campaigns_state_created_at_idx" ON "openalex_ingest_campaigns"("state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_ingest_partitions_legacy_mongo_id_key" ON "openalex_ingest_partitions"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "openalex_ingest_partitions_campaign_id_state_lease_expires__idx" ON "openalex_ingest_partitions"("campaign_id", "state", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_ingest_partitions_campaign_id_partition_key_key" ON "openalex_ingest_partitions"("campaign_id", "partition_key");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_ingest_page_attempts_legacy_mongo_id_key" ON "openalex_ingest_page_attempts"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "openalex_ingest_page_attempts_campaign_id_state_created_at_idx" ON "openalex_ingest_page_attempts"("campaign_id", "state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_ingest_page_attempts_partition_id_idempotency_key_key" ON "openalex_ingest_page_attempts"("partition_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ingest_dead_letters_legacy_mongo_id_key" ON "ingest_dead_letters"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "ingest_dead_letters_campaign_id_state_created_at_idx" ON "ingest_dead_letters"("campaign_id", "state", "created_at");

-- CreateIndex
CREATE INDEX "ingest_dead_letters_reason_code_idx" ON "ingest_dead_letters"("reason_code");

-- CreateIndex
CREATE UNIQUE INDEX "corpus_validation_runs_legacy_mongo_id_key" ON "corpus_validation_runs"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "corpus_validation_runs_idempotency_key_key" ON "corpus_validation_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "corpus_validation_runs_campaign_id_created_at_idx" ON "corpus_validation_runs"("campaign_id", "created_at");

-- CreateIndex
CREATE INDEX "corpus_validation_runs_state_created_at_idx" ON "corpus_validation_runs"("state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_refresh_watermarks_legacy_mongo_id_key" ON "openalex_refresh_watermarks"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "openalex_refresh_watermarks_refresh_policy_key_key" ON "openalex_refresh_watermarks"("refresh_policy_key");

-- CreateIndex
CREATE UNIQUE INDEX "paper_cohort_memberships_legacy_mongo_id_key" ON "paper_cohort_memberships"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "paper_cohort_memberships_cohort_id_stratum_key_idx" ON "paper_cohort_memberships"("cohort_id", "stratum_key");

-- CreateIndex
CREATE INDEX "paper_cohort_memberships_campaign_id_paper_id_idx" ON "paper_cohort_memberships"("campaign_id", "paper_id");

-- CreateIndex
CREATE INDEX "paper_cohort_memberships_campaign_id_cohort_id_stratum_key__idx" ON "paper_cohort_memberships"("campaign_id", "cohort_id", "stratum_key", "paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_cohort_campaign_unique" ON "paper_cohort_memberships"("paper_id", "cohort_id", "campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_legacy_mongo_id_key" ON "bookmarks"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reports_legacy_mongo_id_key" ON "reports"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "reports_user_id_created_at_idx" ON "reports"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_project_id_idx" ON "reports"("project_id");

-- CreateIndex
CREATE INDEX "reports_status_updated_at_idx" ON "reports"("status", "updated_at");

-- CreateIndex
CREATE INDEX "reports_cache_key_idx" ON "reports"("cache_key");

-- CreateIndex
CREATE INDEX "report_papers_paper_id_idx" ON "report_papers"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "rag_queries_legacy_mongo_id_key" ON "rag_queries"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "rag_queries_report_id_idx" ON "rag_queries"("report_id");

-- CreateIndex
CREATE INDEX "rag_queries_user_id_created_at_idx" ON "rag_queries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "rag_query_results_paper_id_idx" ON "rag_query_results"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "rag_query_results_query_id_rank_key" ON "rag_query_results"("query_id", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "gap_analyses_legacy_mongo_id_key" ON "gap_analyses"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "gap_analyses_user_id_created_at_idx" ON "gap_analyses"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "gap_analyses_project_id_idx" ON "gap_analyses"("project_id");

-- CreateIndex
CREATE INDEX "gap_analyses_status_updated_at_idx" ON "gap_analyses"("status", "updated_at");

-- CreateIndex
CREATE INDEX "gap_analysis_papers_paper_id_idx" ON "gap_analysis_papers"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_gaps_legacy_mongo_id_key" ON "research_gaps"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "research_gaps_normalized_topic_confidence_idx" ON "research_gaps"("normalized_topic", "confidence");

-- CreateIndex
CREATE INDEX "research_gaps_user_id_created_at_idx" ON "research_gaps"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "research_gaps_status_created_at_idx" ON "research_gaps"("status", "created_at");

-- CreateIndex
CREATE INDEX "research_gaps_validation_status_gap_type_created_at_idx" ON "research_gaps"("validation_status", "gap_type", "created_at");

-- CreateIndex
CREATE INDEX "research_gaps_analysis_id_idx" ON "research_gaps"("analysis_id");

-- CreateIndex
CREATE INDEX "research_gaps_project_id_idx" ON "research_gaps"("project_id");

-- CreateIndex
CREATE INDEX "research_gaps_corpus_id_idx" ON "research_gaps"("corpus_id");

-- CreateIndex
CREATE INDEX "research_gap_papers_paper_id_idx" ON "research_gap_papers"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "gap_directions_legacy_mongo_id_key" ON "gap_directions"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "gap_directions_gap_id_key" ON "gap_directions"("gap_id");

-- CreateIndex
CREATE UNIQUE INDEX "gap_direction_items_directions_id_position_key" ON "gap_direction_items"("directions_id", "position");

-- CreateIndex
CREATE INDEX "gap_direction_papers_paper_id_idx" ON "gap_direction_papers"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "gap_evidence_records_legacy_mongo_id_key" ON "gap_evidence_records"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "gap_evidence_records_paper_id_idx" ON "gap_evidence_records"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "gap_evidence_records_gap_id_paper_id_evidence_kind_key" ON "gap_evidence_records"("gap_id", "paper_id", "evidence_kind");

-- CreateIndex
CREATE UNIQUE INDEX "gap_validations_legacy_mongo_id_key" ON "gap_validations"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "gap_validations_gap_id_created_at_idx" ON "gap_validations"("gap_id", "created_at");

-- CreateIndex
CREATE INDEX "gap_validations_reviewer_id_idx" ON "gap_validations"("reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "literature_corpora_legacy_mongo_id_key" ON "literature_corpora"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "literature_corpora_owner_id_created_at_idx" ON "literature_corpora"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "literature_corpora_project_id_idx" ON "literature_corpora"("project_id");

-- CreateIndex
CREATE INDEX "literature_corpora_topic_idx" ON "literature_corpora"("topic");

-- CreateIndex
CREATE INDEX "literature_corpora_status_idx" ON "literature_corpora"("status");

-- CreateIndex
CREATE UNIQUE INDEX "corpus_papers_legacy_mongo_id_key" ON "corpus_papers"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "corpus_papers_paper_id_idx" ON "corpus_papers"("paper_id");

-- CreateIndex
CREATE INDEX "corpus_papers_included_idx" ON "corpus_papers"("included");

-- CreateIndex
CREATE UNIQUE INDEX "corpus_papers_corpus_id_paper_id_key" ON "corpus_papers"("corpus_id", "paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "quality_evaluations_legacy_mongo_id_key" ON "quality_evaluations"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "quality_evaluations_paper_id_idx" ON "quality_evaluations"("paper_id");

-- CreateIndex
CREATE INDEX "quality_evaluations_report_id_idx" ON "quality_evaluations"("report_id");

-- CreateIndex
CREATE INDEX "quality_evaluations_gap_id_idx" ON "quality_evaluations"("gap_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_ratings_legacy_mongo_id_key" ON "user_ratings"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "user_ratings_user_id_idx" ON "user_ratings"("user_id");

-- CreateIndex
CREATE INDEX "user_ratings_paper_id_idx" ON "user_ratings"("paper_id");

-- CreateIndex
CREATE INDEX "user_ratings_report_id_idx" ON "user_ratings"("report_id");

-- CreateIndex
CREATE INDEX "user_ratings_gap_id_idx" ON "user_ratings"("gap_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_legacy_mongo_id_key" ON "submissions"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "submissions_project_id_created_at_idx" ON "submissions"("project_id", "created_at");

-- CreateIndex
CREATE INDEX "submissions_created_by_id_idx" ON "submissions"("created_by_id");

-- CreateIndex
CREATE INDEX "submissions_status_submission_type_research_field_created_a_idx" ON "submissions"("status", "submission_type", "research_field", "created_at");

-- CreateIndex
CREATE INDEX "submission_authors_user_id_idx" ON "submission_authors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_authors_submission_id_position_key" ON "submission_authors"("submission_id", "position");

-- CreateIndex
CREATE INDEX "submission_declared_conflicts_user_id_idx" ON "submission_declared_conflicts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_revisions_legacy_mongo_id_key" ON "submission_revisions"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "submission_revisions_uploaded_by_id_idx" ON "submission_revisions"("uploaded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_revisions_submission_id_revision_number_key" ON "submission_revisions"("submission_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_assignments_legacy_mongo_id_key" ON "reviewer_assignments"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_assignments_anonymous_code_key" ON "reviewer_assignments"("anonymous_code");

-- CreateIndex
CREATE INDEX "reviewer_assignments_reviewer_id_status_created_at_idx" ON "reviewer_assignments"("reviewer_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviewer_assignments_submission_id_reviewer_id_key" ON "reviewer_assignments"("submission_id", "reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_pre_reviews_legacy_mongo_id_key" ON "ai_pre_reviews"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "ai_pre_reviews_submission_id_created_at_idx" ON "ai_pre_reviews"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_pre_reviews_submission_id_status_idx" ON "ai_pre_reviews"("submission_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "review_conflicts_legacy_mongo_id_key" ON "review_conflicts"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_conflicts_submission_id_reviewer_id_key" ON "review_conflicts"("submission_id", "reviewer_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_templates_legacy_mongo_id_key" ON "review_templates"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "review_templates_submission_type_active_idx" ON "review_templates"("submission_type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "review_criteria_legacy_mongo_id_key" ON "review_criteria"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_criteria_template_id_key_key" ON "review_criteria"("template_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "human_reviews_legacy_mongo_id_key" ON "human_reviews"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "human_reviews_assignment_id_key" ON "human_reviews"("assignment_id");

-- CreateIndex
CREATE INDEX "human_reviews_reviewer_id_status_idx" ON "human_reviews"("reviewer_id", "status");

-- CreateIndex
CREATE INDEX "human_reviews_submission_id_idx" ON "human_reviews"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_responses_legacy_mongo_id_key" ON "review_responses"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_responses_review_id_criterion_key_key" ON "review_responses"("review_id", "criterion_key");

-- CreateIndex
CREATE UNIQUE INDEX "research_contributions_legacy_mongo_id_key" ON "research_contributions"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_contributions_source_review_assignment_id_key" ON "research_contributions"("source_review_assignment_id");

-- CreateIndex
CREATE INDEX "research_contributions_contributor_id_created_at_idx" ON "research_contributions"("contributor_id", "created_at");

-- CreateIndex
CREATE INDEX "research_contributions_project_id_idx" ON "research_contributions"("project_id");

-- CreateIndex
CREATE INDEX "research_contributions_submission_id_idx" ON "research_contributions"("submission_id");

-- CreateIndex
CREATE INDEX "research_contributions_source_project_contribution_id_idx" ON "research_contributions"("source_project_contribution_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_runs_legacy_mongo_id_key" ON "ai_runs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "ai_runs_owner_id_created_at_idx" ON "ai_runs"("owner_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_runs_project_id_status_created_at_idx" ON "ai_runs"("project_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "authors_legacy_mongo_id_key" ON "authors"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "authors_openalex_id_key" ON "authors"("openalex_id");

-- CreateIndex
CREATE INDEX "authors_display_name_idx" ON "authors"("display_name");

-- CreateIndex
CREATE INDEX "authors_orcid_idx" ON "authors"("orcid");

-- CreateIndex
CREATE INDEX "author_affiliations_author_id_position_idx" ON "author_affiliations"("author_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "journals_legacy_mongo_id_key" ON "journals"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "journals_openalex_id_key" ON "journals"("openalex_id");

-- CreateIndex
CREATE INDEX "journals_name_idx" ON "journals"("name");

-- CreateIndex
CREATE INDEX "journal_issns_issn_idx" ON "journal_issns"("issn");

-- CreateIndex
CREATE UNIQUE INDEX "journal_issns_journal_id_issn_key" ON "journal_issns"("journal_id", "issn");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_legacy_mongo_id_key" ON "keywords"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_normalized_name_key" ON "keywords"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "research_topics_legacy_mongo_id_key" ON "research_topics"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "research_topics_parent_topic_id_topic_name_idx" ON "research_topics"("parent_topic_id", "topic_name");

-- CreateIndex
CREATE INDEX "research_topics_openalex_id_idx" ON "research_topics"("openalex_id");

-- CreateIndex
CREATE UNIQUE INDEX "papers_legacy_mongo_id_key" ON "papers"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "papers_doi_key" ON "papers"("doi");

-- CreateIndex
CREATE INDEX "papers_openalex_id_idx" ON "papers"("openalex_id");

-- CreateIndex
CREATE INDEX "papers_semantic_scholar_id_idx" ON "papers"("semantic_scholar_id");

-- CreateIndex
CREATE INDEX "papers_arxiv_id_idx" ON "papers"("arxiv_id");

-- CreateIndex
CREATE INDEX "papers_pubmed_id_idx" ON "papers"("pubmed_id");

-- CreateIndex
CREATE INDEX "papers_publication_year_citation_count_idx" ON "papers"("publication_year", "citation_count");

-- CreateIndex
CREATE INDEX "papers_language_idx" ON "papers"("language");

-- CreateIndex
CREATE INDEX "papers_paper_status_idx" ON "papers"("paper_status");

-- CreateIndex
CREATE INDEX "papers_data_status_idx" ON "papers"("data_status");

-- CreateIndex
CREATE INDEX "papers_is_ai_analyzable_data_status_idx" ON "papers"("is_ai_analyzable", "data_status");

-- CreateIndex
CREATE INDEX "papers_requested_by_id_idx" ON "papers"("requested_by_id");

-- CreateIndex
CREATE INDEX "papers_uploaded_by_id_idx" ON "papers"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "paper_authors_author_id_idx" ON "paper_authors"("author_id");

-- CreateIndex
CREATE INDEX "paper_keywords_keyword_id_idx" ON "paper_keywords"("keyword_id");

-- CreateIndex
CREATE INDEX "paper_keywords_keyword_name_idx" ON "paper_keywords"("keyword_name");

-- CreateIndex
CREATE INDEX "paper_topics_topic_id_idx" ON "paper_topics"("topic_id");

-- CreateIndex
CREATE INDEX "paper_topics_topic_name_idx" ON "paper_topics"("topic_name");

-- CreateIndex
CREATE INDEX "paper_topics_openalex_topic_id_idx" ON "paper_topics"("openalex_topic_id");

-- CreateIndex
CREATE INDEX "paper_topics_subfield_name_idx" ON "paper_topics"("subfield_name");

-- CreateIndex
CREATE INDEX "paper_topics_field_name_idx" ON "paper_topics"("field_name");

-- CreateIndex
CREATE INDEX "paper_topics_domain_name_idx" ON "paper_topics"("domain_name");

-- CreateIndex
CREATE UNIQUE INDEX "paper_identities_legacy_mongo_id_key" ON "paper_identities"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "paper_identities_paper_id_idx" ON "paper_identities"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_identities_provider_normalized_value_key" ON "paper_identities"("provider", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "paper_source_records_legacy_mongo_id_key" ON "paper_source_records"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "paper_source_records_paper_id_provider_id_idx" ON "paper_source_records"("paper_id", "provider_id");

-- CreateIndex
CREATE INDEX "paper_source_records_metadata_hash_idx" ON "paper_source_records"("metadata_hash");

-- CreateIndex
CREATE UNIQUE INDEX "paper_quality_checks_legacy_mongo_id_key" ON "paper_quality_checks"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_quality_checks_paper_id_key" ON "paper_quality_checks"("paper_id");

-- CreateIndex
CREATE INDEX "paper_quality_checks_check_status_checked_at_idx" ON "paper_quality_checks"("check_status", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "paper_downloads_legacy_mongo_id_key" ON "paper_downloads"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "paper_downloads_user_id_idx" ON "paper_downloads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_downloads_paper_id_user_id_key" ON "paper_downloads"("paper_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_translations_legacy_mongo_id_key" ON "paper_translations"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "paper_translation_cache_v1" ON "paper_translations"("paper_id", "target_language", "source_text_hash", "provider", "provider_version");

-- CreateIndex
CREATE UNIQUE INDEX "paper_reviews_legacy_mongo_id_key" ON "paper_reviews"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "paper_reviews_user_id_created_at_idx" ON "paper_reviews"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "paper_reviews_paper_id_idx" ON "paper_reviews"("paper_id");

-- CreateIndex
CREATE INDEX "paper_reviews_status_idx" ON "paper_reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "paper_format_checks_legacy_mongo_id_key" ON "paper_format_checks"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "paper_format_checks_user_id_created_at_idx" ON "paper_format_checks"("user_id", "created_at");
