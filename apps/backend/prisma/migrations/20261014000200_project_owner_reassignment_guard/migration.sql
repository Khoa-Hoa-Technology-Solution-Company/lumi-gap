-- Check both projects if a membership is reassigned by maintenance SQL.
-- Normal API writes never move a membership between projects.
CREATE OR REPLACE FUNCTION check_project_owner_membership() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE target UUID;
DECLARE targets UUID[];
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN targets := ARRAY[NEW.id];
  ELSIF TG_OP = 'DELETE' THEN targets := ARRAY[OLD.project_id];
  ELSIF TG_OP = 'UPDATE' THEN targets := ARRAY[OLD.project_id, NEW.project_id];
  ELSE targets := ARRAY[NEW.project_id];
  END IF;
  FOREACH target IN ARRAY targets LOOP
    IF EXISTS(SELECT 1 FROM projects p WHERE p.id = target AND NOT EXISTS (
      SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = p.owner_id
        AND m.role = 'OWNER' AND m.status = 'ACTIVE'
    )) THEN RAISE EXCEPTION 'Project requires an active canonical owner' USING ERRCODE = '23514'; END IF;
  END LOOP;
  RETURN NULL;
END $$;
