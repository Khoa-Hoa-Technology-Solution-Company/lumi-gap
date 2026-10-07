-- Preserve existing positive community feedback as hearts. Existing reactions
-- take precedence and each voter is imported only once per target.
INSERT INTO forum_reactions (id, target_type, target_id, user_id, reaction, created_at)
SELECT id, CASE WHEN post_id IS NOT NULL THEN 'post' ELSE 'comment' END,
  COALESCE(post_id, comment_id), user_id, 'LIKE', created_at
FROM forum_votes
WHERE value = 1 AND (post_id IS NOT NULL OR comment_id IS NOT NULL)
ON CONFLICT DO NOTHING;
