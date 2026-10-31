-- Extend consent records; preserve existing invitations, relationships and feedback.
CREATE UNIQUE INDEX mentorship_requests_access_scope ON mentorship_requests(id,project_id,mentor_user_id);
CREATE UNIQUE INDEX mentor_relationships_access_scope ON mentor_relationships(id,project_id,mentor_user_id,source_request_id);
CREATE TABLE mentor_access (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id),
 request_id uuid NOT NULL UNIQUE, relationship_id uuid UNIQUE, mentor_user_id uuid NOT NULL REFERENCES users(id),
 preset varchar(16) NOT NULL DEFAULT 'ADVISOR' CHECK(preset IN ('OBSERVER','ADVISOR','REVIEWER')),
 permissions text[] NOT NULL DEFAULT '{}', version integer NOT NULL DEFAULT 1 CHECK(version>0),
 expires_at timestamptz, revoked_at timestamptz, configured_by_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(request_id,project_id,mentor_user_id) REFERENCES mentorship_requests(id,project_id,mentor_user_id),
 FOREIGN KEY(relationship_id,project_id,mentor_user_id,request_id) REFERENCES mentor_relationships(id,project_id,mentor_user_id,source_request_id),
 UNIQUE(id,project_id)
);
CREATE INDEX mentor_access_project_id_mentor_user_id_idx ON mentor_access(project_id,mentor_user_id);
-- No automatic publication of old project contents or source snapshots.
INSERT INTO mentor_access(project_id,request_id,relationship_id,mentor_user_id,configured_by_id,revoked_at)
 SELECT r.project_id,r.id,m.id,r.mentor_user_id,p.owner_id,CASE WHEN m.status='ENDED' THEN COALESCE(m.ended_at,now()) END
 FROM mentorship_requests r JOIN projects p ON p.id=r.project_id LEFT JOIN mentor_relationships m ON m.source_request_id=r.id;
CREATE TABLE mentor_resource_shares (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, access_id uuid NOT NULL,
 kind varchar(24) NOT NULL CHECK(kind IN ('OVERVIEW','PAPER','GAP','TASK','MILESTONE','MANUSCRIPT','SUBMISSION','CONTRIBUTION')),
 resource_id uuid NOT NULL, section_key varchar(64) NOT NULL DEFAULT '', title varchar(240) NOT NULL CHECK(length(trim(title))>0),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 50000), shared_by_id uuid NOT NULL REFERENCES users(id), revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(kind<>'MANUSCRIPT' OR length(trim(section_key))>0),
 FOREIGN KEY(access_id,project_id) REFERENCES mentor_access(id,project_id), UNIQUE(id,access_id,project_id)
);
CREATE INDEX mentor_resource_shares_access_id_revoked_at_idx ON mentor_resource_shares(access_id,revoked_at);
CREATE UNIQUE INDEX mentor_resource_shares_current ON mentor_resource_shares(access_id,kind,resource_id,section_key) WHERE revoked_at IS NULL;
CREATE TABLE mentor_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, access_id uuid NOT NULL, share_id uuid, reply_to_id uuid,
 author_id uuid NOT NULL REFERENCES users(id), kind varchar(16) NOT NULL CHECK(kind IN ('MESSAGE','COMMENT','SUGGESTION','REVIEW')),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 5000), credit_roles text[] NOT NULL DEFAULT '{}',
 status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','RESOLVED')), version integer NOT NULL DEFAULT 1 CHECK(version>0),
 handled_by_id uuid REFERENCES users(id), handled_at timestamptz, response text NOT NULL DEFAULT '', client_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(access_id,project_id) REFERENCES mentor_access(id,project_id),
 UNIQUE(id,access_id,project_id), FOREIGN KEY(share_id,access_id,project_id) REFERENCES mentor_resource_shares(id,access_id,project_id),
 FOREIGN KEY(reply_to_id,access_id,project_id) REFERENCES mentor_feedback(id,access_id,project_id), UNIQUE(access_id,author_id,client_key)
);
CREATE INDEX mentor_feedback_access_id_created_at_idx ON mentor_feedback(access_id,created_at);
CREATE TABLE mentor_agreements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, access_id uuid NOT NULL,
 proposed_by_id uuid NOT NULL REFERENCES users(id), credit_roles text[] NOT NULL,
 acknowledgement text NOT NULL CHECK(length(trim(acknowledgement)) BETWEEN 3 AND 3000), note text NOT NULL DEFAULT '',
 status varchar(16) NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','ACCEPTED','REJECTED','WITHDRAWN')),
 responded_by_id uuid REFERENCES users(id), responded_at timestamptz, client_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(access_id,project_id) REFERENCES mentor_access(id,project_id), UNIQUE(access_id,proposed_by_id,client_key)
);
CREATE TABLE mentor_access_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, access_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id), type varchar(32) NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(access_id,project_id) REFERENCES mentor_access(id,project_id)
);
CREATE INDEX mentor_access_events_access_id_created_at_idx ON mentor_access_events(access_id,created_at);
CREATE FUNCTION protect_mentor_access_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR TG_TABLE_NAME='mentor_access_events' THEN RAISE EXCEPTION 'Mentor history must be retained'; END IF;
 IF TG_TABLE_NAME='mentor_resource_shares' THEN
   IF (to_jsonb(OLD)-'revoked_at') IS DISTINCT FROM (to_jsonb(NEW)-'revoked_at') THEN RAISE EXCEPTION 'Published content is immutable'; END IF;
 ELSIF TG_TABLE_NAME='mentor_feedback' THEN
   IF (to_jsonb(OLD)-ARRAY['status','version','handled_by_id','handled_at','response']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','version','handled_by_id','handled_at','response']) THEN RAISE EXCEPTION 'Feedback content is immutable'; END IF;
 ELSIF TG_TABLE_NAME='mentor_agreements' THEN
   IF OLD.status<>'PROPOSED' OR (to_jsonb(OLD)-ARRAY['status','responded_by_id','responded_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','responded_by_id','responded_at']) THEN RAISE EXCEPTION 'Agreement proposal is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mentor_event_immutable BEFORE UPDATE OR DELETE ON mentor_access_events FOR EACH ROW EXECUTE FUNCTION protect_mentor_access_history();
CREATE TRIGGER mentor_share_immutable BEFORE UPDATE OR DELETE ON mentor_resource_shares FOR EACH ROW EXECUTE FUNCTION protect_mentor_access_history();
CREATE TRIGGER mentor_feedback_immutable BEFORE UPDATE OR DELETE ON mentor_feedback FOR EACH ROW EXECUTE FUNCTION protect_mentor_access_history();
CREATE TRIGGER mentor_agreement_immutable BEFORE UPDATE OR DELETE ON mentor_agreements FOR EACH ROW EXECUTE FUNCTION protect_mentor_access_history();
