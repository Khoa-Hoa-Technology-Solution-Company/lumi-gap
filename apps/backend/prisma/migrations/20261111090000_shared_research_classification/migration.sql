-- Additive reference snapshots. Existing declarations, invitations and history are unchanged.
ALTER TABLE academic_profiles ADD COLUMN research_classification jsonb NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN research_classification jsonb NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN mentorship_classification jsonb NOT NULL DEFAULT '{}';
ALTER TABLE research_topics ADD COLUMN source_version varchar(120), ADD COLUMN label_vi varchar(300);
ALTER TABLE academic_profiles ADD CONSTRAINT academic_research_classification_object CHECK (jsonb_typeof(research_classification) = 'object');
ALTER TABLE projects ADD CONSTRAINT project_research_classification_object CHECK (jsonb_typeof(research_classification) = 'object');
CREATE INDEX academic_profiles_research_classification_gin ON academic_profiles USING gin(research_classification);
