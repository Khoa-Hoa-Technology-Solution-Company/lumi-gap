-- Preserve submission idempotency across a later withdrawal and reapplication.
ALTER TABLE mentorship_application_events ADD COLUMN client_key UUID, ADD COLUMN command_hash VARCHAR(64);
CREATE UNIQUE INDEX mentorship_application_events_actor_id_client_key_key ON mentorship_application_events(actor_id,client_key);
CREATE INDEX mentorship_application_events_actor_id_type_created_at_idx ON mentorship_application_events(actor_id,type,created_at);
CREATE FUNCTION protect_mentorship_application_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Mentorship application history must be retained';
END $$;
CREATE TRIGGER mentorship_application_event_immutable BEFORE UPDATE OR DELETE ON mentorship_application_events
 FOR EACH ROW EXECUTE FUNCTION protect_mentorship_application_history();
CREATE TRIGGER mentorship_application_note_immutable BEFORE UPDATE OR DELETE ON mentorship_application_notes
 FOR EACH ROW EXECUTE FUNCTION protect_mentorship_application_history();
