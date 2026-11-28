-- Optional, immutable note supplied with a direct Paper share. Existing shares
-- remain unchanged; existing history and grant uniqueness guards still apply.
ALTER TABLE mentor_resource_shares ADD COLUMN IF NOT EXISTS message varchar(2000);
