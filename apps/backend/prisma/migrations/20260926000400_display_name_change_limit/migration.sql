CREATE TABLE "user_display_name_changes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_display_name_changes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_display_name_changes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_display_name_changes_user_id_changed_at_idx"
  ON "user_display_name_changes"("user_id", "changed_at");
