-- AlterTable
ALTER TABLE "screening_settings"
  ADD COLUMN IF NOT EXISTS "discovery_goal_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "discovery_goal_target" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "discovery_goal_period" VARCHAR(16) NOT NULL DEFAULT 'WEEK',
  ADD COLUMN IF NOT EXISTS "discovery_goal_paused" BOOLEAN NOT NULL DEFAULT false;
