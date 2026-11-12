-- Literature matrix (custom comparison criteria), limitation identification and feasibility assessment.
-- Written by hand (see docs/prisma-migrations.md). No existing constraint, index or default is dropped.

-- 1. Literature matrix criteria. Built-in columns (methodology, population, claim, results, limitations)
--    stay on project_evidence_items; these rows add project-specific columns.
CREATE TABLE project_matrix_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label varchar(80) NOT NULL CHECK (length(trim(label)) > 0),
  description varchar(500) NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  archived_at timestamptz(6),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);
-- Two active criteria of one project cannot share a label (case-insensitive); archived ones may.
CREATE UNIQUE INDEX project_matrix_criteria_active_label_idx ON project_matrix_criteria (project_id, lower(label)) WHERE archived_at IS NULL;
CREATE INDEX project_matrix_criteria_position_idx ON project_matrix_criteria (project_id, position);

-- Values of the custom criteria, keyed by criterion id. Versioned and reviewed with the extraction.
ALTER TABLE project_evidence_items ADD COLUMN criteria_values jsonb NOT NULL DEFAULT '{}';
ALTER TABLE project_evidence_items ADD CONSTRAINT project_evidence_criteria_values_object CHECK (jsonb_typeof(criteria_values) = 'object');

-- 2. Limitations shared by reviewed extractions.
CREATE TABLE project_limitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  statement text NOT NULL CHECK (length(trim(statement)) BETWEEN 3 AND 2000),
  category varchar(24) NOT NULL CHECK (category IN ('DATA','METHOD','CONTEXT','OUTCOME','TEMPORAL','OTHER')),
  status varchar(16) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PROMOTED','DISMISSED')),
  status_rationale text NOT NULL DEFAULT '',
  gap_id uuid REFERENCES research_gaps(id) ON DELETE SET NULL,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  client_key uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE (project_id, created_by_id, client_key),
  UNIQUE (project_id, id),
  CHECK (status <> 'DISMISSED' OR length(trim(status_rationale)) > 0)
);
CREATE INDEX project_limitations_status_idx ON project_limitations (project_id, status, updated_at);
CREATE INDEX project_limitations_gap_idx ON project_limitations (gap_id) WHERE gap_id IS NOT NULL;

-- Which extractions report a limitation. Both sides must belong to the same project.
CREATE TABLE project_limitation_sources (
  limitation_id uuid NOT NULL,
  project_id uuid NOT NULL,
  evidence_item_id uuid NOT NULL,
  added_by_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (limitation_id, evidence_item_id),
  FOREIGN KEY (project_id, limitation_id) REFERENCES project_limitations (project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, evidence_item_id) REFERENCES project_evidence_items (project_id, id) ON DELETE CASCADE
);
CREATE INDEX project_limitation_sources_evidence_idx ON project_limitation_sources (project_id, evidence_item_id);

-- 3. Feasibility assessments (polymorphic target: targetKind + targetId, checked by the service).
CREATE TABLE project_feasibility_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_kind varchar(16) NOT NULL CHECK (target_kind IN ('LIMITATION','GAP')),
  target_id uuid NOT NULL,
  target_version integer NOT NULL CHECK (target_version > 0),
  assessor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  data_availability smallint NOT NULL CHECK (data_availability BETWEEN 1 AND 5),
  expertise smallint NOT NULL CHECK (expertise BETWEEN 1 AND 5),
  resources smallint NOT NULL CHECK (resources BETWEEN 1 AND 5),
  timeline smallint NOT NULL CHECK (timeline BETWEEN 1 AND 5),
  risk smallint NOT NULL CHECK (risk BETWEEN 1 AND 5),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  UNIQUE (project_id, target_kind, target_id, assessor_id),
  -- A score of 1 or 2 is a concern: the assessor must explain it.
  CHECK (LEAST(data_availability, expertise, resources, timeline, risk) > 2 OR length(trim(notes)) > 0)
);
CREATE INDEX project_feasibility_target_idx ON project_feasibility_assessments (project_id, target_kind, target_id);

-- 4. Immutable history of the new artifacts. Same list as 20261029120000_collaborative_library plus three kinds.
ALTER TABLE project_workspace_revisions DROP CONSTRAINT project_workspace_revisions_entity_kind_check;
ALTER TABLE project_workspace_revisions ADD CONSTRAINT project_workspace_revisions_entity_kind_check
  CHECK (entity_kind IN ('TASK','MILESTONE','DISCUSSION','DECISION','EXTRACTION','SCREENING_VOTE','GAP','MANUSCRIPT','PLAN_DRAFT','SYNTHESIS','GAP_ANALYSIS_INPUT','ANALYSIS_SET','MATRIX_CRITERION','LIMITATION','FEASIBILITY'));
