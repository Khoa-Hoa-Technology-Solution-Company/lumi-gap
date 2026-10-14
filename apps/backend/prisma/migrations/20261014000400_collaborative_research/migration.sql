ALTER TABLE projects ADD COLUMN screening_mode varchar(24) NOT NULL DEFAULT 'EXPLORATORY', ADD COLUMN screening_blinded boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD CONSTRAINT project_screening_mode_check CHECK (screening_mode IN ('EXPLORATORY','INDEPENDENT'));
ALTER TABLE project_papers ADD COLUMN tags text[] NOT NULL DEFAULT '{}', ADD COLUMN collection_name varchar(120), ADD COLUMN import_source varchar(24) NOT NULL DEFAULT 'LIBRARY', ADD COLUMN source_reference varchar(1000);
ALTER TABLE project_papers DROP CONSTRAINT project_papers_screening_status_check;
ALTER TABLE project_papers ADD CONSTRAINT project_papers_screening_status_check CHECK (screening_status IN ('UNDECIDED','INCLUDED','EXCLUDED','MAYBE'));
ALTER TABLE research_gaps ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0), ADD COLUMN assessment_status varchar(32) NOT NULL DEFAULT 'PROPOSED', ADD COLUMN assessment_rationale text NOT NULL DEFAULT '', ADD COLUMN assumptions text NOT NULL DEFAULT '';
ALTER TABLE research_gaps ADD CONSTRAINT gap_assessment_check CHECK (assessment_status IN ('PROPOSED','IN_REVIEW','NEEDS_MORE_EVIDENCE','TEAM_SUPPORTED','REJECTED'));
ALTER TABLE gap_validations ADD COLUMN gap_version integer NOT NULL DEFAULT 1 CHECK (gap_version > 0);
CREATE TABLE project_evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE RESTRICT,
  claim text NOT NULL, quotation text NOT NULL DEFAULT '', locator text NOT NULL DEFAULT '', context text NOT NULL DEFAULT '', methodology text NOT NULL DEFAULT '', population text NOT NULL DEFAULT '', results text NOT NULL DEFAULT '', limitations text NOT NULL DEFAULT '', themes text[] NOT NULL DEFAULT '{}',
  origin varchar(24) NOT NULL CHECK (origin IN ('HUMAN','AI_SUGGESTED')),
  review_state varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (review_state IN ('PENDING','ACCEPTED','REJECTED')),
  review_rationale text NOT NULL DEFAULT '', reviewed_by_id uuid REFERENCES users(id) ON DELETE RESTRICT, reviewed_at timestamptz(6),
  extracted_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, source_snapshot jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0), client_key uuid NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE(project_id, extracted_by_id, client_key), UNIQUE(project_id,id),
  FOREIGN KEY(project_id,paper_id) REFERENCES project_papers(project_id,paper_id) ON DELETE RESTRICT,
  CHECK ((review_state = 'PENDING' AND reviewed_by_id IS NULL AND reviewed_at IS NULL) OR (review_state <> 'PENDING' AND reviewed_by_id IS NOT NULL AND reviewed_at IS NOT NULL AND length(trim(review_rationale)) > 0))
);
CREATE INDEX project_evidence_review_idx ON project_evidence_items(project_id,review_state,created_at);
CREATE INDEX project_evidence_source_idx ON project_evidence_items(project_id,paper_id);
CREATE TABLE project_screening_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE RESTRICT, reviewer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  phase varchar(24) NOT NULL DEFAULT 'TITLE_ABSTRACT' CHECK (phase IN ('TITLE_ABSTRACT','FULL_TEXT')),
  decision varchar(24) NOT NULL DEFAULT 'UNDECIDED' CHECK (decision IN ('UNDECIDED','INCLUDED','EXCLUDED','MAYBE')),
  reason text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz(6) NOT NULL DEFAULT now(), updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE(project_id,paper_id,reviewer_id,phase), FOREIGN KEY(project_id,paper_id) REFERENCES project_papers(project_id,paper_id) ON DELETE RESTRICT,
  CHECK (decision <> 'EXCLUDED' OR length(trim(reason)) > 0)
);
CREATE INDEX project_screening_reviewer_idx ON project_screening_decisions(project_id,reviewer_id,decision);
CREATE TABLE project_paper_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE RESTRICT, uploaded_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  content bytea NOT NULL, sha256 varchar(64) NOT NULL, byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 10485760),
  created_at timestamptz(6) NOT NULL DEFAULT now(), UNIQUE(project_id,paper_id,sha256),
  FOREIGN KEY(project_id,paper_id) REFERENCES project_papers(project_id,paper_id) ON DELETE RESTRICT,
  CHECK (octet_length(content) = byte_size)
);
CREATE INDEX project_paper_files_source_idx ON project_paper_files(project_id,paper_id);
ALTER TABLE gap_evidence_records ADD COLUMN evidence_item_id uuid REFERENCES project_evidence_items(id) ON DELETE RESTRICT, ADD COLUMN evidence_revision_id uuid REFERENCES project_workspace_revisions(id) ON DELETE RESTRICT;
ALTER TABLE gap_evidence_records ADD CONSTRAINT gap_evidence_revision_pair CHECK ((evidence_item_id IS NULL) = (evidence_revision_id IS NULL));
CREATE INDEX gap_validations_version_idx ON gap_validations(gap_id,gap_version,created_at);
