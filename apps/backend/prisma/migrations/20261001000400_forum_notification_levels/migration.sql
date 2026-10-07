ALTER TABLE "forum_thread_follows"
ADD COLUMN "notification_level" VARCHAR(16) NOT NULL DEFAULT 'WATCHING';

ALTER TABLE "forum_thread_follows"
ADD CONSTRAINT "forum_thread_notification_level_check"
CHECK ("notification_level" IN ('WATCHING', 'TRACKING', 'NORMAL', 'MUTED'));
