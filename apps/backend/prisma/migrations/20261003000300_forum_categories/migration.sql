-- Preserve taxonomy IDs, topic links and existing scoped moderator assignments.
ALTER TABLE communities ADD COLUMN is_forum_category boolean NOT NULL DEFAULT false;
ALTER TABLE communities ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE communities ADD CONSTRAINT forum_category_public CHECK (NOT is_forum_category OR visibility = 'public');
CREATE INDEX communities_forum_category_order_idx ON communities(is_forum_category, status, sort_order);

WITH taxonomy(slug, position) AS (VALUES
  ('software-engineering', 0), ('artificial-intelligence', 1), ('data-science', 2),
  ('cybersecurity', 3), ('information-systems', 4), ('research-methodology', 5)
)
UPDATE communities SET is_forum_category = true, sort_order = taxonomy.position
FROM taxonomy WHERE communities.slug = taxonomy.slug AND communities.visibility = 'public';

-- Give older uncategorized discussions a neutral category without guessing their field.
INSERT INTO communities(id, name, slug, description, owner_id, is_forum_category, sort_order, updated_at)
SELECT gen_random_uuid(), 'General Research', 'general-research', 'Research discussions across fields.',
  owner_id, true, 6, now()
FROM communities WHERE is_forum_category = true
  AND EXISTS (SELECT 1 FROM forum_posts WHERE community_id IS NULL)
ORDER BY sort_order, id LIMIT 1
ON CONFLICT (slug) DO NOTHING;
UPDATE communities SET is_forum_category = true WHERE slug = 'general-research' AND visibility = 'public';
UPDATE forum_posts SET community_id = (SELECT id FROM communities WHERE slug = 'general-research' AND is_forum_category = true)
WHERE community_id IS NULL AND EXISTS (SELECT 1 FROM communities WHERE slug = 'general-research' AND is_forum_category = true);

