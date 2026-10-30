-- Add context to future assessment versions without inventing historic reading claims.
ALTER TABLE screening_settings ADD COLUMN stages text[] NOT NULL DEFAULT '{}';
ALTER TABLE screening_settings ADD CONSTRAINT screening_settings_stages_check
  CHECK (stages <@ ARRAY['TITLE_ABSTRACT','FULL_TEXT']::text[]);
ALTER TABLE screening_reviews
  ADD COLUMN scope varchar(24),
  ADD COLUMN full_text_reference text,
  ADD COLUMN research_questions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE screening_reviews ADD CONSTRAINT screening_reviews_scope_check
  CHECK (scope IS NULL OR scope IN ('TITLE_ABSTRACT','FULL_TEXT'));
ALTER TABLE screening_reviews ADD CONSTRAINT screening_reviews_full_text_context_check
  CHECK (scope IS DISTINCT FROM 'FULL_TEXT' OR (full_text_reference IS NOT NULL AND length(trim(full_text_reference)) >= 10));
ALTER TABLE screening_reviews ADD CONSTRAINT screening_reviews_questions_shape_check
  CHECK (jsonb_typeof(research_questions) = 'array');
-- Personal negative opinions may be brief; a final exclusion still requires a rationale.
ALTER TABLE screening_reviews DROP CONSTRAINT screening_reviews_check;
ALTER TABLE screening_rounds DROP CONSTRAINT screening_rounds_status_check;
ALTER TABLE screening_rounds ADD CONSTRAINT screening_rounds_status_check
  CHECK (status IN ('NOT_REVIEWED','IN_REVIEW','NEEDS_RESOLUTION','AWAITING_FINALIZATION','INCLUDED','EXCLUDED','BACKGROUND'));
ALTER TABLE screening_final_decisions DROP CONSTRAINT screening_final_decisions_decision_check;
ALTER TABLE screening_final_decisions ADD CONSTRAINT screening_final_decisions_decision_check
  CHECK (decision IN ('INCLUDED','EXCLUDED','BACKGROUND'));
