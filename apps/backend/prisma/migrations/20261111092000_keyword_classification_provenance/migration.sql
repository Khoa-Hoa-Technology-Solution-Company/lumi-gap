ALTER TABLE keywords ADD COLUMN openalex_id varchar(300), ADD COLUMN synced_at timestamptz(6), ADD COLUMN source_version varchar(120);
CREATE UNIQUE INDEX keywords_openalex_id_key ON keywords(openalex_id);
