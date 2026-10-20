-- Project mode of AI quality evaluation: one assessment per (project, paper), shared by project members.
CREATE TABLE quality_project_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  assessment jsonb NOT NULL,
  input_fingerprint varchar(64) NOT NULL,
  model text NOT NULL DEFAULT '',
  prompt_version varchar(64) NOT NULL,
  language varchar(8) NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'vi')),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX quality_project_assessments_project_id_paper_id_key ON quality_project_assessments(project_id, paper_id);
CREATE INDEX quality_project_assessments_paper_id_idx ON quality_project_assessments(paper_id);
