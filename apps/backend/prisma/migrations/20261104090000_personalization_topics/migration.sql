-- Personalized "For you": stored topic keys per forum post, per-user topic follows and mutes.
ALTER TABLE "forum_posts" ADD COLUMN "topic_keys" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "forum_posts" ADD COLUMN "derived_topic_keys" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "forum_posts" ADD COLUMN "derived_topic_weights" REAL[] NOT NULL DEFAULT '{}';

CREATE INDEX "forum_posts_topic_keys_gin" ON "forum_posts" USING GIN ("topic_keys");
CREATE INDEX "forum_posts_derived_topic_keys_gin" ON "forum_posts" USING GIN ("derived_topic_keys");
CREATE INDEX "forum_post_views_viewer_key_viewed_at_idx" ON "forum_post_views" ("viewer_key", "viewed_at");

CREATE TABLE "user_topic_mutes" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_key" VARCHAR(120) NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "topic_key")
);

CREATE TABLE "user_topic_follows" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "topic_key" VARCHAR(120) NOT NULL,
  "label" VARCHAR(200) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "topic_key")
);
