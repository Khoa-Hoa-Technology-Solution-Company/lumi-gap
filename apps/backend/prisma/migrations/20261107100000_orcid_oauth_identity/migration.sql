-- Manual claims do not reserve an ORCID iD. Only authenticated connections are exclusive.
-- Fail rather than silently reassign any pre-existing conflicting OAuth ownership.
CREATE UNIQUE INDEX academic_identity_links_verified_orcid_unique
 ON academic_identity_links(identifier)
 WHERE provider = 'ORCID' AND verification_status = 'PROVIDER_CONNECTED';
ALTER TABLE academic_identity_links ADD CONSTRAINT academic_identity_links_connected_identifier_required
 CHECK (verification_status <> 'PROVIDER_CONNECTED' OR identifier IS NOT NULL);
