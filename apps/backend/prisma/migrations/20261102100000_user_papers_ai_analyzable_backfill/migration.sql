-- Data-only backfill. User-submitted and other non-OpenAlex papers were stored with is_ai_analyzable = false and
-- nothing recomputed it, so approved ones never received papers.embedding. The application now derives the flag
-- from the abstract (isAiAnalyzableAbstract: at least 250 characters); apply the same rule to existing rows.
-- OpenAlex rows are left alone: the sync already sets the flag with this rule.
UPDATE "papers"
SET "is_ai_analyzable" = true
WHERE "primary_provider" <> 'openalex'
  AND "is_ai_analyzable" = false
  AND char_length(coalesce("abstract_text", '')) >= 250;
