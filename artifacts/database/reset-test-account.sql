-- Install once in lumigap_db. Reset every newly created ID with:
-- SELECT public.lumigap_reset_test_account('thanhndse182854@fpt.edu.vn');
-- Deletes database rows. The companion CLI also removes uploaded media.
CREATE OR REPLACE FUNCTION public.lumigap_reset_test_account(p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $reset$
DECLARE
  target_email text := lower(btrim(p_email));
  user_ids uuid[];
  identity_keys text[];
  media_keys text[];
  community_ids uuid[];
  voted_posts uuid[];
  voted_comments uuid[];
  affected_threads uuid[];
  relation_row record;
  fk record;
  extra record;
  changed integer;
  added integer;
  removed integer;
  total_removed integer := 0;
  total_users integer := 0;
  result_counts jsonb := '{}'::jsonb;
BEGIN
  IF target_email IS DISTINCT FROM 'thanhndse182854@fpt.edu.vn' THEN
    RAISE EXCEPTION 'This utility is restricted to the approved LumiGap test email.';
  END IF;
  PERFORM 1 FROM public.users u WHERE lower(u.email) = target_email
    OR u.id IN (SELECT user_id FROM public.user_emails WHERE lower(normalized_email) = target_email)
    FOR UPDATE;
  SELECT coalesce(array_agg(u.id), '{}'::uuid[]),
         coalesce(array_agg(u.google_id) FILTER (WHERE u.google_id IS NOT NULL), '{}'::text[])
    INTO user_ids, identity_keys FROM public.users u
    WHERE lower(u.email) = target_email
       OR u.id IN (SELECT user_id FROM public.user_emails WHERE lower(normalized_email) = target_email);
  total_users := cardinality(user_ids);
  identity_keys := identity_keys || user_ids::text[] || ARRAY[target_email];
  SELECT coalesce(array_agg(key) FILTER (WHERE key IS NOT NULL), '{}'::text[])
    INTO media_keys FROM public.academic_profiles p
    CROSS JOIN LATERAL unnest(ARRAY[p.avatar_storage_key, p.cover_storage_key]) key
    WHERE p.user_id = ANY(user_ids);
  SELECT array_agg(DISTINCT community_id) INTO community_ids FROM (
    SELECT community_id FROM public.community_memberships WHERE user_id = ANY(user_ids)
    UNION SELECT community_id FROM public.forum_posts WHERE author_id = ANY(user_ids)
  ) c;
  SELECT array_agg(DISTINCT post_id), array_agg(DISTINCT comment_id)
    INTO voted_posts, voted_comments FROM public.forum_votes WHERE user_id = ANY(user_ids);
  SELECT array_agg(DISTINCT post_id) INTO affected_threads
    FROM public.forum_comments WHERE author_id = ANY(user_ids);

  DROP TABLE IF EXISTS pg_temp.lumigap_reset_plan, pg_temp.lumigap_reset_tables,
    pg_temp.lumigap_reset_fks, pg_temp.lumigap_reset_blocked;
  CREATE TEMP TABLE lumigap_reset_plan (relation_oid oid, row_key jsonb,
    PRIMARY KEY (relation_oid, row_key)) ON COMMIT DROP;
  CREATE TEMP TABLE lumigap_reset_blocked (relation_oid oid, row_key jsonb,
    PRIMARY KEY (relation_oid, row_key)) ON COMMIT DROP;
  CREATE TEMP TABLE lumigap_reset_tables ON COMMIT DROP AS
    SELECT c.oid AS relation_oid, n.nspname AS schema_name, c.relname AS table_name,
      'jsonb_build_object(' || string_agg(format('%L, r.%I', a.attname, a.attname), ', ' ORDER BY a.attnum) || ')' AS key_sql
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
    GROUP BY c.oid, n.nspname, c.relname;
  CREATE TEMP TABLE lumigap_reset_fks ON COMMIT DROP AS
    SELECT c.conrelid AS child_oid, c.confrelid AS parent_oid, c.confdeltype AS delete_rule,
      string_agg(format('r.%I = p.%I', a.attname, b.attname), ' AND ' ORDER BY s.i) AS join_sql
    FROM pg_constraint c JOIN LATERAL generate_subscripts(c.conkey, 1) s(i) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[s.i]
    JOIN pg_attribute b ON b.attrelid = c.confrelid AND b.attnum = c.confkey[s.i]
    WHERE c.contype = 'f' AND c.conrelid IN (SELECT relation_oid FROM lumigap_reset_tables)
      AND c.confrelid IN (SELECT relation_oid FROM lumigap_reset_tables)
    GROUP BY c.oid, c.conrelid, c.confrelid, c.confdeltype;

  -- Account, personal history, metadata without FKs, and email-based invitations.
  FOR extra IN SELECT * FROM (VALUES
    ('users', 'r.id = ANY($1::uuid[])'),
    ('forum_reactions', 'r.user_id = ANY($1::uuid[])'),
    ('forum_post_views', 'r.viewer_key = ANY(ARRAY(SELECT ''user:'' || id::text FROM unnest($1::uuid[]) id))'),
    ('search_logs', 'r.user_id = ANY($1::uuid[])'),
    ('mcp_tool_runs', 'r.user_id = ANY($1::uuid[])'),
    ('project_activities', 'r.actor_id = ANY($1::uuid[])'),
    ('review_templates', 'r.owner_id = ANY($1::uuid[])'),
    ('project_invitations', 'lower(r.email) = $2'),
    ('external_review_invitations', 'lower(r.reviewer_email) = $2'),
    ('copyright_claims', 'lower(r.claimant_email) = $2'),
    ('academic_email_verification_challenges', 'lower(r.email) = $2')
  ) x(table_name, predicate)
  LOOP
    SELECT * INTO relation_row FROM lumigap_reset_tables t WHERE t.table_name = extra.table_name;
    IF NOT FOUND THEN RAISE EXCEPTION 'Required cleanup table % is missing.', extra.table_name; END IF;
    EXECUTE format('INSERT INTO lumigap_reset_plan SELECT %s::oid, %s FROM %I.%I r WHERE %s ON CONFLICT DO NOTHING',
      relation_row.relation_oid, relation_row.key_sql, relation_row.schema_name, relation_row.table_name, extra.predicate)
      USING user_ids, target_email;
  END LOOP;

  -- Some newer moderation tables use scalar user IDs without foreign keys.
  -- Seed account-owned rows there too, rather than depending only on migrations.
  FOR extra IN
    SELECT t.*, a.attname AS owner_column
    FROM lumigap_reset_tables t JOIN pg_attribute a ON a.attrelid = t.relation_oid
    WHERE a.attnum > 0 AND NOT a.attisdropped AND a.atttypid = 'uuid'::regtype
      AND (a.attname = 'user_id' OR (
        a.attname IN ('author_id', 'owner_id', 'sender_id', 'reporter_id', 'appellant_id',
          'contributor_id', 'requester_id', 'uploaded_by_id', 'edited_by_id', 'changed_by_id',
          'created_by_id', 'created_by', 'proposed_by_id', 'reviewer_id', 'mentor_user_id', 'requested_by')
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.contype = 'f'
          AND c.conrelid = a.attrelid AND a.attnum = ANY(c.conkey))
      ))
  LOOP
    EXECUTE format('INSERT INTO lumigap_reset_plan SELECT %s::oid, %s FROM %I.%I r '
      || 'WHERE r.%I = ANY($1::uuid[]) ON CONFLICT DO NOTHING',
      extra.relation_oid, extra.key_sql, extra.schema_name, extra.table_name, extra.owner_column)
      USING user_ids;
  END LOOP;

  -- Follow dependent records. SET NULL attribution retains shared catalog content.
  LOOP
    added := 0;
    FOR fk IN SELECT f.*, t.schema_name, t.table_name, t.key_sql,
                    p.schema_name AS parent_schema, p.table_name AS parent_table
      FROM lumigap_reset_fks f JOIN lumigap_reset_tables t ON t.relation_oid = f.child_oid
      JOIN lumigap_reset_tables p ON p.relation_oid = f.parent_oid
      WHERE f.delete_rule IN ('c', 'r', 'a')
    LOOP
      EXECUTE format('INSERT INTO lumigap_reset_plan SELECT %s::oid, %s FROM %I.%I r '
        || 'JOIN %I.%I p ON %s JOIN lumigap_reset_plan d ON d.relation_oid = %s::oid '
        || 'AND to_jsonb(p) @> d.row_key ON CONFLICT DO NOTHING',
        fk.child_oid, fk.key_sql, fk.schema_name, fk.table_name, fk.parent_schema, fk.parent_table, fk.join_sql, fk.parent_oid);
      GET DIAGNOSTICS changed = ROW_COUNT; added := added + changed;
    END LOOP;
    FOR extra IN SELECT * FROM (VALUES
      ('forum_reactions', 'r.target_id::text IN (SELECT row_key->>''id'' FROM lumigap_reset_plan WHERE relation_oid IN (''public.forum_posts''::regclass, ''public.forum_comments''::regclass))'),
      ('notifications', 'r.target_uuid::text IN (SELECT row_key->>''id'' FROM lumigap_reset_plan) OR EXISTS (SELECT 1 FROM unnest($1::text[]) k WHERE strpos(to_jsonb(r)::text, k) > 0)'),
      ('audit_logs', 'r.target_record_id IN (SELECT row_key->>''id'' FROM lumigap_reset_plan) OR EXISTS (SELECT 1 FROM unnest($1::text[]) k WHERE strpos(to_jsonb(r)::text, k) > 0)'),
      ('forum_content_reports', 'r.target_id::text IN (SELECT row_key->>''id'' FROM lumigap_reset_plan WHERE relation_oid IN (''public.forum_posts''::regclass, ''public.forum_comments''::regclass))')
    ) x(table_name, predicate)
    LOOP
      SELECT * INTO relation_row FROM lumigap_reset_tables t WHERE t.table_name = extra.table_name;
      EXECUTE format('INSERT INTO lumigap_reset_plan SELECT %s::oid, %s FROM %I.%I r WHERE %s ON CONFLICT DO NOTHING',
        relation_row.relation_oid, relation_row.key_sql, relation_row.schema_name, relation_row.table_name, extra.predicate)
        USING identity_keys;
      GET DIAGNOSTICS changed = ROW_COUNT; added := added + changed;
    END LOOP;
    EXIT WHEN added = 0;
  END LOOP;

  -- Leaves first, without disabling constraints; primary keys survive SET NULL.
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM lumigap_reset_plan);
    TRUNCATE lumigap_reset_blocked;
    FOR fk IN SELECT f.*, t.schema_name, t.table_name,
                    p.schema_name AS parent_schema, p.table_name AS parent_table
      FROM lumigap_reset_fks f JOIN lumigap_reset_tables t ON t.relation_oid = f.child_oid
      JOIN lumigap_reset_tables p ON p.relation_oid = f.parent_oid
      WHERE f.delete_rule IN ('c', 'r', 'a')
    LOOP
      EXECUTE format('INSERT INTO lumigap_reset_blocked SELECT d.relation_oid, d.row_key FROM lumigap_reset_plan d '
        || 'JOIN %I.%I p ON d.relation_oid = %s::oid AND to_jsonb(p) @> d.row_key '
        || 'WHERE EXISTS (SELECT 1 FROM %I.%I r WHERE %s) ON CONFLICT DO NOTHING',
        fk.parent_schema, fk.parent_table, fk.parent_oid, fk.schema_name, fk.table_name, fk.join_sql);
    END LOOP;
    removed := 0;
    FOR relation_row IN SELECT t.* FROM lumigap_reset_tables t
      WHERE EXISTS (SELECT 1 FROM lumigap_reset_plan d WHERE d.relation_oid = t.relation_oid)
    LOOP
      EXECUTE format('WITH gone AS (DELETE FROM %I.%I r USING lumigap_reset_plan d '
        || 'WHERE d.relation_oid = %s::oid AND to_jsonb(r) @> d.row_key '
        || 'AND NOT EXISTS (SELECT 1 FROM lumigap_reset_blocked b WHERE b.relation_oid = d.relation_oid AND b.row_key = d.row_key) '
        || 'RETURNING %s AS row_key) DELETE FROM lumigap_reset_plan d USING gone '
        || 'WHERE d.relation_oid = %s::oid AND d.row_key = gone.row_key',
        relation_row.schema_name, relation_row.table_name, relation_row.relation_oid, relation_row.key_sql, relation_row.relation_oid);
      GET DIAGNOSTICS changed = ROW_COUNT; removed := removed + changed;
      IF changed > 0 THEN result_counts := jsonb_set(result_counts, ARRAY[relation_row.table_name],
        to_jsonb(coalesce((result_counts->>relation_row.table_name)::integer, 0) + changed)); END IF;
    END LOOP;
    IF removed = 0 THEN RAISE EXCEPTION 'A cyclic dependency prevents reset; transaction rolled back.'; END IF;
    total_removed := total_removed + removed;
  END LOOP;

  UPDATE public.forum_posts p SET score = coalesce((SELECT sum(value) FROM public.forum_votes WHERE post_id = p.id), 0),
    vote_score = coalesce((SELECT sum(value) FROM public.forum_votes WHERE post_id = p.id), 0)
    WHERE p.id = ANY(voted_posts);
  UPDATE public.forum_comments c SET score = coalesce((SELECT sum(value) FROM public.forum_votes WHERE comment_id = c.id), 0),
    vote_score = coalesce((SELECT sum(value) FROM public.forum_votes WHERE comment_id = c.id), 0)
    WHERE c.id = ANY(voted_comments);
  UPDATE public.forum_posts p SET
    comment_count = (SELECT count(*) FROM public.forum_comments c WHERE c.post_id = p.id
      AND c.status = 'active' AND c.visibility_status = 'ACTIVE'),
    last_activity_at = greatest(p.created_at, coalesce((SELECT max(c.created_at)
      FROM public.forum_comments c WHERE c.post_id = p.id AND c.status = 'active'
      AND c.visibility_status = 'ACTIVE'), p.created_at))
    WHERE p.id = ANY(affected_threads);
  UPDATE public.communities c SET
    member_count = (SELECT count(*) FROM public.community_memberships WHERE community_id = c.id AND status = 'active'),
    thread_count = (SELECT count(*) FROM public.forum_posts WHERE community_id = c.id AND status IN ('active', 'locked') AND visibility_status = 'ACTIVE')
    WHERE c.id = ANY(community_ids);
  IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = target_email OR u.id = ANY(user_ids)) THEN
    RAISE EXCEPTION 'Account reset incomplete; transaction rolled back.';
  END IF;
  -- Clear optional attribution fields without FKs, then assert no UUID link remains.
  FOR extra IN SELECT t.*, a.attname AS link_column FROM lumigap_reset_tables t
    JOIN pg_attribute a ON a.attrelid = t.relation_oid
    WHERE a.attnum > 0 AND NOT a.attisdropped AND a.atttypid = 'uuid'::regtype
      AND NOT a.attnotnull AND NOT EXISTS (SELECT 1 FROM pg_constraint c
        WHERE c.contype = 'f' AND c.conrelid = a.attrelid AND a.attnum = ANY(c.conkey))
  LOOP
    EXECUTE format('UPDATE %I.%I SET %I = NULL WHERE %I = ANY($1::uuid[])',
      extra.schema_name, extra.table_name, extra.link_column, extra.link_column) USING user_ids;
  END LOOP;
  FOR extra IN SELECT t.*, a.attname AS link_column FROM lumigap_reset_tables t
    JOIN pg_attribute a ON a.attrelid = t.relation_oid
    WHERE a.attnum > 0 AND NOT a.attisdropped AND a.atttypid = 'uuid'::regtype
  LOOP
    EXECUTE format('SELECT count(*)::integer FROM %I.%I WHERE %I = ANY($1::uuid[])',
      extra.schema_name, extra.table_name, extra.link_column) INTO changed USING user_ids;
    IF changed > 0 THEN RAISE EXCEPTION 'Account data remain in %.%; reset rolled back.', extra.table_name, extra.link_column; END IF;
  END LOOP;
  RETURN jsonb_build_object('email', target_email, 'accountsDeleted', total_users, 'rowsDeleted', total_removed,
    'deletedByTable', result_counts, 'userIds', user_ids, 'mediaKeys', media_keys);
END;
$reset$;
REVOKE ALL ON FUNCTION public.lumigap_reset_test_account(text) FROM PUBLIC;
