-- Additive private compiler sidecar; existing compilations remain readable.
ALTER TABLE manuscript_compilations ADD COLUMN synctex_data BYTEA;
ALTER TABLE manuscript_compilations ADD CONSTRAINT manuscript_synctex_size
  CHECK (synctex_data IS NULL OR octet_length(synctex_data) <= 2000000);
