-- Additive and replay-safe: NULL preserves every legacy permission evaluation.
ALTER TABLE mentor_resource_shares ADD COLUMN IF NOT EXISTS access_mode varchar(16);
-- A paper file is pinned once when sharing; it never follows later uploads.
ALTER TABLE mentor_resource_shares ADD COLUMN IF NOT EXISTS source_file_id uuid;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mentor_resource_shares'::regclass AND conname='mentor_resource_shares_access_mode_check') THEN
  ALTER TABLE mentor_resource_shares ADD CONSTRAINT mentor_resource_shares_access_mode_check
   CHECK (access_mode IS NULL OR (kind='PAPER' AND section_key='' AND access_mode IN ('VIEW','COMMENT')));
 END IF;
END $$;
-- No legacy grants are widened, revoked or rewritten. Recovery: leave the
-- nullable column in place; old clients ignore it. Do not drop shared evidence.

-- Rights may change; published content, authorship and all retention guards remain
-- immutable. Preserve the installed function, including its project-purge guard.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('protect_mentor_access_history()'::regprocedure) INTO definition;
 IF position('to_jsonb(OLD) - ''revoked_at''' IN definition) > 0 THEN
  definition := replace(definition, 'to_jsonb(OLD) - ''revoked_at''', 'to_jsonb(OLD) - ARRAY[''revoked_at'',''access_mode'']');
  definition := replace(definition, 'to_jsonb(NEW) - ''revoked_at''', 'to_jsonb(NEW) - ARRAY[''revoked_at'',''access_mode'']');
  EXECUTE definition;
 END IF;
END $migration$;
