-- Keep only the newest legacy unconsumed link before enforcing the invariant.
WITH ranked_tokens AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "user_id" ORDER BY "expires_at" DESC, "created_at" DESC, "id" DESC) AS "token_rank"
  FROM "password_reset_tokens"
  WHERE "consumed_at" IS NULL
)
UPDATE "password_reset_tokens" AS token
SET "consumed_at" = CURRENT_TIMESTAMP
FROM ranked_tokens
WHERE token."id" = ranked_tokens."id"
  AND ranked_tokens."token_rank" > 1;

CREATE UNIQUE INDEX "password_reset_tokens_one_active_per_user_idx"
  ON "password_reset_tokens" ("user_id")
  WHERE "consumed_at" IS NULL;
