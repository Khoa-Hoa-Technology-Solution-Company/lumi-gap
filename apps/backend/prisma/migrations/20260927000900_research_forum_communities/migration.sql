ALTER TABLE "communities"
  ADD COLUMN "research_field" VARCHAR(160),
  ADD COLUMN "icon" VARCHAR(40),
  ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "thread_count" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "communities" ADD CONSTRAINT "communities_status_check"
  CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));
DROP INDEX IF EXISTS "communities_visibility_idx";
CREATE INDEX "communities_status_visibility_updated_at_idx"
  ON "communities"("status", "visibility", "updated_at");

UPDATE "communities" AS community
SET "thread_count" = (
  SELECT COUNT(*)::INTEGER FROM "forum_posts" AS post
  WHERE post."community_id" = community."id" AND post."status" <> 'deleted'
);

ALTER TABLE "forum_posts"
  ALTER COLUMN "type" TYPE VARCHAR(32),
  ALTER COLUMN "type" SET DEFAULT 'DISCUSSION',
  ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "pinned_at" TIMESTAMPTZ(6),
  ADD COLUMN "edited_at" TIMESTAMPTZ(6);

UPDATE "forum_posts" SET "type" = CASE LOWER("type")
  WHEN 'question' THEN 'QUESTION'
  WHEN 'paper_discussion' THEN 'PAPER_DISCUSSION'
  WHEN 'research_gap_discussion' THEN 'RESEARCH_GAP_DISCUSSION'
  ELSE 'DISCUSSION'
END;

ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_type_check"
  CHECK ("type" IN ('QUESTION', 'DISCUSSION', 'PAPER_DISCUSSION', 'RESEARCH_GAP_DISCUSSION'));
DROP INDEX IF EXISTS "forum_posts_community_id_status_created_at_idx";
CREATE INDEX "forum_posts_community_id_status_is_pinned_updated_at_idx"
  ON "forum_posts"("community_id", "status", "is_pinned", "updated_at");

ALTER TABLE "forum_comments" ADD COLUMN "edited_at" TIMESTAMPTZ(6);

ALTER TABLE "forum_references"
  ADD COLUMN "authors" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "year" INTEGER,
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "forum_references" ADD CONSTRAINT "forum_references_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "research_gaps"
  ADD COLUMN "forum_shareable" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "forum_tags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(80) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "forum_tags_slug_key" ON "forum_tags"("slug");

CREATE TABLE "forum_post_tags" (
  "post_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "forum_post_tags_pkey" PRIMARY KEY ("post_id", "tag_id")
);
CREATE INDEX "forum_post_tags_tag_id_idx" ON "forum_post_tags"("tag_id");
ALTER TABLE "forum_post_tags" ADD CONSTRAINT "forum_post_tags_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_post_tags" ADD CONSTRAINT "forum_post_tags_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "forum_tags"("id") ON DELETE CASCADE;

CREATE TABLE "forum_post_gaps" (
  "post_id" UUID NOT NULL,
  "gap_id" UUID NOT NULL,
  CONSTRAINT "forum_post_gaps_pkey" PRIMARY KEY ("post_id", "gap_id")
);
CREATE INDEX "forum_post_gaps_gap_id_idx" ON "forum_post_gaps"("gap_id");
ALTER TABLE "forum_post_gaps" ADD CONSTRAINT "forum_post_gaps_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_post_gaps" ADD CONSTRAINT "forum_post_gaps_gap_id_fkey"
  FOREIGN KEY ("gap_id") REFERENCES "research_gaps"("id") ON DELETE CASCADE;

INSERT INTO "forum_post_gaps" ("post_id", "gap_id")
SELECT "id", COALESCE("linked_research_gap_id", "research_gap_id")
FROM "forum_posts"
WHERE COALESCE("linked_research_gap_id", "research_gap_id") IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE "forum_post_projects" (
  "post_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  CONSTRAINT "forum_post_projects_pkey" PRIMARY KEY ("post_id", "project_id")
);
CREATE INDEX "forum_post_projects_project_id_idx" ON "forum_post_projects"("project_id");
ALTER TABLE "forum_post_projects" ADD CONSTRAINT "forum_post_projects_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_post_projects" ADD CONSTRAINT "forum_post_projects_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;

INSERT INTO "forum_post_projects" ("post_id", "project_id")
SELECT "id", "linked_project_id" FROM "forum_posts"
WHERE "linked_project_id" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE "forum_thread_follows" (
  "post_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_thread_follows_pkey" PRIMARY KEY ("post_id", "user_id")
);
CREATE INDEX "forum_thread_follows_user_id_created_at_idx"
  ON "forum_thread_follows"("user_id", "created_at");
ALTER TABLE "forum_thread_follows" ADD CONSTRAINT "forum_thread_follows_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_thread_follows" ADD CONSTRAINT "forum_thread_follows_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

CREATE TABLE "forum_moderation_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" UUID NOT NULL,
  "community_id" UUID,
  "post_id" UUID,
  "comment_id" UUID,
  "report_id" UUID,
  "action" VARCHAR(40) NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forum_moderation_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "forum_moderation_actions_community_id_created_at_idx"
  ON "forum_moderation_actions"("community_id", "created_at");
CREATE INDEX "forum_moderation_actions_post_id_created_at_idx"
  ON "forum_moderation_actions"("post_id", "created_at");
CREATE INDEX "forum_moderation_actions_comment_id_created_at_idx"
  ON "forum_moderation_actions"("comment_id", "created_at");
ALTER TABLE "forum_moderation_actions" ADD CONSTRAINT "forum_moderation_actions_one_target_check"
  CHECK (num_nonnulls("post_id", "comment_id", "report_id") = 1);
ALTER TABLE "forum_moderation_actions" ADD CONSTRAINT "forum_moderation_actions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "forum_moderation_actions" ADD CONSTRAINT "forum_moderation_actions_community_id_fkey"
  FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE SET NULL;
ALTER TABLE "forum_moderation_actions" ADD CONSTRAINT "forum_moderation_actions_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "forum_posts"("id") ON DELETE CASCADE;
ALTER TABLE "forum_moderation_actions" ADD CONSTRAINT "forum_moderation_actions_comment_id_fkey"
  FOREIGN KEY ("comment_id") REFERENCES "forum_comments"("id") ON DELETE CASCADE;
ALTER TABLE "forum_moderation_actions" ADD CONSTRAINT "forum_moderation_actions_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "forum_content_reports"("id") ON DELETE CASCADE;
